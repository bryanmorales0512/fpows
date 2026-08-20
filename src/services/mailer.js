// Email transport: a pooled Gmail SMTP transporter plus a small retry helper.
import nodemailer from 'nodemailer';

// Reusable SMTP transporter (created on demand, connection pooled).
export function getTransporter() {
    // Re-read env every time to pick up .env changes without a full reboot.
    const user = process.env.SMTP_USER ? process.env.SMTP_USER.replace(/^"|"$/g, '') : null;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : null;

    if (user && pass) {
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass },
            pool: true,
            maxConnections: 3
        });
    }
    return null;
}

// Simple retry helper for sending email.
export async function sendMailWithRetry(transporter, mailOptions, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } catch (err) {
            console.error(`[SMTP] Attempt ${attempt + 1} failed: ${err.message}`);
            if (attempt < retries) {
                console.log(`[SMTP] Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                throw err;
            }
        }
    }
}
