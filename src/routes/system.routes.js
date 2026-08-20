// System routes: diagnostics, health check (Cloud Run probe), and the manual
// trigger for the daily portfolio report.
import express from 'express';
import { SIMPRO_BASE_URL, SIMPRO_ACCESS_TOKEN, SMTP_USER, SMTP_PASS } from '../config.js';
import { adminLimiter } from '../middleware/rateLimit.js';
import { requireApiKey } from '../middleware/auth.js';
import { sendManagerDailyReport } from '../services/report.js';

export const systemRouter = express.Router();

systemRouter.get('/api/ping', (req, res) => {
    console.log('[PING] Route hit successfully');
    res.json({ ok: true, time: new Date().toISOString() });
});

// --- Health Check (used by Cloud Run probe) ---
systemRouter.get('/health', (req, res) => {
    const ok = !!(SIMPRO_BASE_URL && SIMPRO_ACCESS_TOKEN && SMTP_USER && SMTP_PASS);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', time: new Date().toISOString() });
});

// --- Manual Trigger for Portfolio Report ---
systemRouter.get('/api/trigger-manager-report', adminLimiter, requireApiKey, async (req, res) => {
    console.log('[MANUAL] Triggering expanded portfolio report...');
    try {
        await sendManagerDailyReport(true);
        console.log('[MANUAL] Report generation completed.');
        res.json({ success: true, message: 'Report generation completed.' });
    } catch (err) {
        console.error('[MANUAL] Report generation failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});
