require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const bodyParser = require('body-parser');
const db = require('./database');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const USER_LOG_FILE = path.join(__dirname, 'data', 'users.json');

app.use(express.static('public'));
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendEmail(templatePath, to, subject, placeholder, value) {
  const template = fs.readFileSync(templatePath, 'utf8');
  const html = template.replace(placeholder, value);
  transporter.sendMail({ to, subject, html });
}

function logUserToJSON(userData) {
  const users = fs.existsSync(USER_LOG_FILE) ? JSON.parse(fs.readFileSync(USER_LOG_FILE)) : [];
  users.push(userData);
  fs.writeFileSync(USER_LOG_FILE, JSON.stringify(users, null, 2));
}

// Signup
app.post('/signup', async (req, res) => {
  const { gmail, username, password } = req.body;
  const token = uuidv4();
  const hashed = await bcrypt.hash(password, 10);

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user) return res.json({ success: false, message: "Username Taken" });

    db.run("INSERT INTO users (gmail, username, password, verify_token) VALUES (?, ?, ?, ?)",
      [gmail, username, hashed, token], err => {
        if (err) return res.json({ success: false, message: "Signup failed." });

        const link = `http://localhost:3000/verify?token=${token}`;
        console.log(`[SIGNUP] Sending verification to ${gmail} using token: ${token}`);

        sendEmail('public/email-templates/verify.html', gmail, "Verify Your Email", '{{verify_link}}', link);

        logUserToJSON({ username, gmail, date: new Date().toISOString() });

        res.json({ success: true, message: "Verification email sent." });
      });
  });
});

app.get('/verify', (req, res) => {
  const token = req.query.token;
  db.run("UPDATE users SET verified = 1, verify_token = NULL WHERE verify_token = ?", [token], function (err) {
    if (this.changes > 0) res.send("Email verified. You can now log in.");
    else res.send("Invalid or expired verification token.");
  });
});

// Login
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

// Password reset request
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

// Contact form
app.post('/contact', (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) return res.json({ success: false, message: "Email and message required." });

  transporter.sendMail({
    from: email,
    to: 'mkang4636@gmail.com',
    subject: 'New Contact Form Submission',
    text: `From: ${email}\n\n${message}`
  }, err => {
    if (err) return res.json({ success: false, message: "Failed to send email." });
    res.json({ success: true, message: "Message sent!" });
  });
});

// Delete account
app.post('/delete-account', (req, res) => {
  const { username } = req.body;
  db.run("DELETE FROM users WHERE username = ?", [username], function (err) {
    if (err) return res.json({ success: false, message: "Error deleting account." });
    res.json({ success: true, message: "Account deleted." });
  });
});

// WebSocket Chat with banning
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

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
});

server.listen(3000, () => console.log("✅ Server running at http://localhost:3000"));
