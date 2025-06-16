require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const db = require('./database'); // local SQLite database module

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(bodyParser.json());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: Send email
function sendEmail(templateFile, to, subject, linkPlaceholder, linkUrl) {
  const template = fs.readFileSync(templateFile, 'utf8');
  const html = template.replace(linkPlaceholder, linkUrl);
  transporter.sendMail({ to, subject, html });
}



// SIGNUP
app.post('/signup', async (req, res) => {
  const { gmail, username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (row) return res.json({ success: false, message: "Username Taken" });

    const hashed = await bcrypt.hash(password, 10);
    const token = uuidv4();

    db.run("INSERT INTO users (gmail, username, password, verify_token) VALUES (?, ?, ?, ?)",
      [gmail, username, hashed, token], (err) => {
        if (err) return res.json({ success: false, message: "Signup error" });
        const link = `http://localhost:3000/verify?token=${token}`;
        sendEmail('public/email-templates/verify.html', gmail, "Verify Your Email", '{{verify_link}}', link);
        res.json({ success: true, message: "Verification email sent." });
      });
  });
});

// VERIFY EMAIL
app.get('/verify', (req, res) => {
  const token = req.query.token;
  db.run("UPDATE users SET verified = 1, verify_token = NULL WHERE verify_token = ?", [token], function (err) {
    if (this.changes > 0) res.send("Email verified! You can now log in.");
    else res.send("Invalid or expired verification token.");
  });
});

// LOGIN
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: "Invalid credentials" });
    if (!user.verified) return res.json({ success: false, message: "Email not verified" });
    if (user.banned) return res.json({ success: false, message: "Account Banned ):" });

    res.json({ success: true });
  });
});

// RESET PASSWORD REQUEST
app.post('/reset-request', (req, res) => {
  const { gmail } = req.body;
  const token = uuidv4();

  db.run("UPDATE users SET reset_token = ? WHERE gmail = ?", [token, gmail], function (err) {
    if (this.changes > 0) {
      const link = `http://localhost:3000/reset-password.html?token=${token}`;
      sendEmail('public/email-templates/reset.html', gmail, "Reset Your Password", '{{reset_link}}', link);
      res.json({ success: true, message: "Reset link sent." });
    } else {
      res.json({ success: false, message: "Email not found." });
    }
  });
});

// RESET PASSWORD
app.post('/reset-password', async (req, res) => {
  const { password, token } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  db.run("UPDATE users SET password = ?, reset_token = NULL WHERE reset_token = ?", [hashed, token], function (err) {
    if (this.changes > 0) {
      res.json({ success: true, message: "Password updated successfully." });
    } else {
      res.json({ success: false, message: "Invalid or expired token." });
    }
  });
});

// CONTACT FORM HANDLER
app.post('/contact', (req, res) => {
  const { email, message } = req.body;

  if (!email || !message) {
    return res.json({ success: false, message: "Email and message are required." });
  }

  const mailOptions = {
    from: email,
    to: 'mkang4636@gmail.com',
    subject: 'New Contact Form Submission',
    text: `From: ${email}\n\n${message}`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Failed to send message. Please try again later." });
    }
    res.json({ success: true, message: "Message sent successfully!" });
  });
});


// WEBSOCKET CHAT
const bannedWords = ['fuck', 'shit', 'bitch', 'dumbass', 'ass'];

io.on('connection', socket => {
  socket.on('chatMessage', ({ username, message }) => {
    const isBad = bannedWords.some(word => message.toLowerCase().includes(word));

    if (isBad) {
      db.run("UPDATE users SET banned = 1 WHERE username = ?", [username]);
      socket.emit('chatMessage', { username: 'System', message: 'You have been banned.' });
    } else {
      db.run("INSERT INTO chat (username, message) VALUES (?, ?)", [username, message]);
      io.emit('chatMessage', { username, message });
    }
  });
});

server.listen(3000, () => console.log("✅ Server running at http://localhost:3000"));
