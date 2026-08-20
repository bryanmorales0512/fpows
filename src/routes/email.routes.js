// Email routes: send a call sheet, list email history, delete a history entry.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { SMTP_USER, MANAGER_EMAIL, PUBLIC_DIR, DATA_DIR } from '../config.js';
import { getTransporter, sendMailWithRetry } from '../services/mailer.js';
import { emailLimiter, adminLimiter } from '../middleware/rateLimit.js';
import { requireApiKey } from '../middleware/auth.js';

export const emailRouter = express.Router();

const HISTORY_PATH = path.join(DATA_DIR, 'email_history.jsonl');

// Email endpoint
emailRouter.post('/api/send-email', emailLimiter, async (req, res) => {
    try {
        const { jobId, recipientEmail, managerEmail, htmlContent, subject, clientName } = req.body;
        const payloadSize = JSON.stringify(req.body).length;
        console.log(`[POST] /api/send-email - Payload: ${Math.round(payloadSize / 1024)}KB`);
        console.log(`[EMAIL] Job #${jobId} -> To: ${recipientEmail}, CC: ${managerEmail || MANAGER_EMAIL}`);

        const transporter = getTransporter();
        if (!transporter) {
            console.error('[SMTP ERROR] Transporter not initialized. Check SMTP_USER/PASS.');
            return res.status(500).json({ error: 'Email delivery not configured. Check server logs.' });
        }

        if (!recipientEmail && !managerEmail && !MANAGER_EMAIL) {
            console.warn('[EMAIL WARN] No recipient email addresses provided or found in env.');
            return res.status(400).json({ error: 'No recipient email addresses provided.' });
        }

        const recipients = [recipientEmail, (managerEmail && managerEmail.trim()) || MANAGER_EMAIL].filter(Boolean).join(',');

        // Check logo exists before attaching
        const logoPath = path.join(PUBLIC_DIR, 'logo.png');
        const attachments = [];
        if (fs.existsSync(logoPath)) {
            attachments.push({ filename: 'logo.png', path: logoPath, cid: 'redmen-logo' });
        } else {
            console.warn('[EMAIL] logo.png not found, sending without logo attachment.');
        }

        const mailOptions = {
            from: `"FPOWS Automation" <${SMTP_USER}>`,
            to: recipients,
            subject: subject || `FPOWS Call Sheet - Job #${jobId} - ${clientName || 'Unknown Client'}`,
            html: htmlContent,
            attachments
        };

        await sendMailWithRetry(transporter, mailOptions, 1);

        // Structured Log Entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: "EMAIL_SUCCESS",
            jobId,
            client: clientName || "Unknown Client",
            clientEmail: recipientEmail || "—",
            managerEmail: (managerEmail && managerEmail.trim()) || MANAGER_EMAIL || "—",
            subject: mailOptions.subject,
            siteId: req.body.siteId || "",
            siteName: req.body.siteName || ""
        };

        console.log(`[EMAIL SUCCESS] Job #${jobId} -> ${recipients}`);
        await fs.promises.appendFile(HISTORY_PATH, JSON.stringify(logEntry) + "\n");

        res.json({ success: true, sentTo: recipients });
    } catch (err) {
        console.error(`[EMAIL ERROR] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Logs endpoint for manager
emailRouter.get('/api/logs', adminLimiter, requireApiKey, async (req, res) => {
    try {
        let raw;
        try { raw = await fs.promises.readFile(HISTORY_PATH, 'utf8'); } catch { return res.json({ logs: [] }); }
        const lines = raw.trim().split('\n').filter(Boolean);
        const logs = lines.map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean).reverse().slice(0, 50);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete history endpoint
emailRouter.post('/api/delete-history', adminLimiter, requireApiKey, async (req, res) => {
    try {
        const { timestamp } = req.body;
        if (!timestamp || typeof timestamp !== 'string') return res.status(400).json({ error: 'Timestamp is required' });

        let raw;
        try { raw = await fs.promises.readFile(HISTORY_PATH, 'utf8'); } catch { return res.json({ success: true }); }

        const updatedLines = raw.split('\n').filter(line => {
            if (!line.trim()) return false;
            try { return JSON.parse(line).timestamp !== timestamp; } catch { return true; }
        });

        await fs.promises.writeFile(HISTORY_PATH, updatedLines.join('\n') + (updatedLines.length > 0 ? '\n' : ''));
        res.json({ success: true });
    } catch (err) {
        console.error("Delete history error:", err);
        res.status(500).json({ error: err.message });
    }
});
