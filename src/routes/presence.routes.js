// Live presence tracking: which users are currently viewing which job.
// In-memory store: Map<jobId, Map<userName, { lastSeen, color }>>.
import express from 'express';

export const presenceRouter = express.Router();

const presenceMap = new Map();
const PRESENCE_TIMEOUT_MS = 15000; // 15 seconds without heartbeat = gone

// Cleanup stale viewers
function cleanPresence() {
    const now = Date.now();
    for (const [jobId, viewers] of presenceMap) {
        for (const [name, info] of viewers) {
            if (now - info.lastSeen > PRESENCE_TIMEOUT_MS) {
                viewers.delete(name);
            }
        }
        if (viewers.size === 0) presenceMap.delete(jobId);
    }
}
setInterval(cleanPresence, 5000);

// Heartbeat: "I am viewing this job"
presenceRouter.post('/api/presence/heartbeat', (req, res) => {
    const { jobId, userName } = req.body;
    if (!jobId || !userName) return res.status(400).json({ error: 'Missing jobId or userName' });

    if (!presenceMap.has(String(jobId))) presenceMap.set(String(jobId), new Map());
    const viewers = presenceMap.get(String(jobId));

    // Assign a consistent color based on name hash
    const colors = ['#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#6a4c93', '#1982c4', '#8ac926'];
    let hash = 0;
    for (let i = 0; i < userName.length; i++) hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    const color = colors[Math.abs(hash) % colors.length];

    viewers.set(userName, { lastSeen: Date.now(), color });
    res.json({ ok: true });
});

// Leave: "I stopped viewing this job"
presenceRouter.post('/api/presence/leave', (req, res) => {
    const { jobId, userName } = req.body || {};
    if (jobId && userName && presenceMap.has(String(jobId))) {
        presenceMap.get(String(jobId)).delete(userName);
    }
    res.json({ ok: true });
});

// Get viewers for a job
presenceRouter.get('/api/presence/:jobId', (req, res) => {
    cleanPresence();
    const viewers = presenceMap.get(req.params.jobId);
    if (!viewers || viewers.size === 0) return res.json({ viewers: [] });

    const list = [];
    for (const [name, info] of viewers) {
        list.push({ name, color: info.color });
    }
    res.json({ viewers: list });
});
