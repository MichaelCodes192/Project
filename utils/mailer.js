// utils/mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

// Create a reusable transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,         // e.g., smtp.sendgrid.net
  port: process.env.SMTP_PORT,         // e.g., 587
  secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,       // e.g., "apikey" for SendGrid
    pass: process.env.SMTP_PASS        // your SMTP password or API key
  }
});

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML or plain text content
 */
async function sendMail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,   // e.g., "No Reply <noreply@yourdomain.com>"
      to,
      subject,
      html
    });
    console.log(`[Mailer] Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[Mailer] Failed to send email to ${to}:`, err);
    throw err;
  }
}

module.exports = sendMail;

