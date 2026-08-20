// Job data route: the primary FPOW aggregation endpoint.
import express from 'express';
import { fetchFpowData } from '../services/fpow.js';

export const jobsRouter = express.Router();

// Legacy API Proxy
jobsRouter.get('/api/job/:id', async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isInteger(jobId) || jobId <= 0 || jobId > 9_999_999) {
        return res.status(400).json({ error: 'Invalid job ID' });
    }
    try {
        const result = await fetchFpowData(jobId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
