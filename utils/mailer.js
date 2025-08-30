// utils/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send an email using the no-reply address
 * @param {string} to - recipient email
 * @param {string} subject - subject line
 * @param {string} text - plain text body
 */
async function sendMail(to, subject, text) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM, // "No Reply <noreply@yourdomain.com>"
    to,
    subject,
    text
  });
}

module.exports = sendMail;

