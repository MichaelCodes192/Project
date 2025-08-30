require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const bodyParser = require('body-parser');
const db = require('./database');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const sendMail = require("./utils/mailer");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const USER_LOG_FILE = path.join(__dirname, 'data', 'users.json');

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Helper: log user signup to JSON
function logUserToJSON(userData) {
  const users = fs.existsSync(USER_LOG_FILE) ? JSON.parse(fs.readFileSync(USER_LOG_FILE)) : [];
  users.push(userData);
  fs.writeFileSync(USER_LOG_FILE, JSON.stringify(users, null, 2));
}

// -------------------- Signup --------------------
app.post('/signup', async (req, res) => {
  const { gmail, username, password } = req.body;
  const token = uuidv4();
  const hashed = await bcrypt.hash(password, 10);

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user) return res.json({ success: false, message: "Username Taken" });

    db.run(
      "INSERT INTO users (gmail, username, password, verify_token) VALUES (?, ?, ?, ?)",
      [gmail, username, hashed, token], 
      async err => {
        if (err) return res.json({ success: false, message: "Signup failed." });

        const link = `https://project-1-s1tk.onrender.com/verify?token=${token}`;
        console.log(`[SIGNUP] Sending verification to ${gmail} using token: ${token}`);

        try {
          const template = fs.readFileSync('public/email-templates/verify.html', 'utf8')
                             .replace('{{verify_link}}', link);
          await sendMail(gmail, "Verify Your Email", template);
        } catch (e) {
          console.error("Failed to send verification email:", e);
        }

        logUserToJSON({ username, gmail, date: new Date().toISOString() });

        res.json({ success: true, message: "Verification email sent." });
      }
    );
  });
});

// Email verification
app.get('/verify', (req, res) => {
  const token = req.query.token;
  db.run(
    "UPDATE users SET verified = 1, verify_token = NULL WHERE verify_token = ?",
    [token],
    function (err) {
      if (this.changes > 0) res.send("Email verified. You can now log in.");
      else res.send("Invalid or expired verification token.");
    }
  );
});

// -------------------- Login --------------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: "Invalid credentials" });
    if (!user.verified) return res.json({ success: false, message: "Please verify your email." });
    if (user.banned) return res.json({ success: false, message: "Account Banned ):" });

    res.json({ success: true, message: "Login successful" });
  });
});

// -------------------- Password Reset --------------------
// Request reset
app.post('/reset-request', (req, res) => {
  const { gmail } = req.body;
  const token = uuidv4();

  db.run("UPDATE users SET reset_token = ? WHERE gmail = ?", [token, gmail], async function (err) {
    if (this.changes > 0) {
      const link = `https://project-1-s1tk.onrender.com/reset-password.html?token=${token}`;
      try {
        const template = fs.readFileSync('public/email-templates/reset.html', 'utf8')
                           .replace('{{reset_link}}', link);
        await sendMail(gmail, "Reset Your Password", template);
        res.json({ success: true, message: "Reset link sent." });
      } catch (e) {
        console.error("Failed to send reset email:", e);
        res.json({ success: false, message: "Failed to send reset link." });
      }
    } else {
      res.json({ success: false, message: "Email not found." });
    }
  });
});

// Reset password
app.post('/reset-password', async (req, res) => {
  const { password, token } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  db.run("UPDATE users SET password = ?, reset_token = NULL WHERE reset_token = ?", [hashed, token], function (err) {
    if (this.changes > 0) {
      res.json({ success: true, message: "Password updated." });
    } else {
      res.json({ success: false, message: "Invalid token." });
    }
  });
});

// -------------------- Contact Form --------------------
app.post('/contact', async (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) return res.json({ success: false, message: "Email and message required." });

  try {
    await sendMail("mkang4636@gmail.com", "New Contact Form Submission", `From: ${email}\n\n${message}`);
    await sendMail(email, "We received your message", "Thanks for contacting us. This is a no-reply confirmation.");
    res.json({ success: true, message: "Message sent!" });
  } catch (e) {
    console.error("Contact email failed:", e);
    res.json({ success: false, message: "Failed to send email." });
  }
});

// -------------------- Delete Account --------------------
app.post('/delete-account', (req, res) => {
  const { username } = req.body;
  db.run("DELETE FROM users WHERE username = ?", [username], function (err) {
    if (err) return res.json({ success: false, message: "Error deleting account." });
    res.json({ success: true, message: "Account deleted." });
  });
});

// -------------------- WebSocket Chat --------------------
const bannedWords = ['fuck', 'shit'];
io.on('connection', socket => {
  socket.on('chatMessage', ({ username, message }) => {
    if (bannedWords.some(word => message.toLowerCase().includes(word))) {
      db.run("UPDATE users SET banned = 1 WHERE username = ?", [username]);
      socket.emit('chatMessage', { username: 'System', message: 'You have been banned.' });
    } else {
      db.run("INSERT INTO chat (username, message) VALUES (?, ?)", [username, message]);
      io.emit('chatMessage', { username, message });
    }
  });
});

// -------------------- Stripe Checkout --------------------
app.post('/create-checkout-session', async (req, res) => {
  const { amount } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Donation' },
          unit_amount: parseInt(amount)
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://project-1-s1tk.onrender.com/success.html',
      cancel_url: 'https://project-1-s1tk.onrender.com/checkout.html',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe Error]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// -------------------- 404 Fallback --------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
});

// -------------------- Start Server --------------------
server.listen(3000, () => console.log("✅ Server running at http://localhost:3000"));

