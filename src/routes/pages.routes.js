// Page routes: the app shell (index.html with injected client config) and the
// version endpoint. Mounted BEFORE express.static so '/' is handled here.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR, ADMIN_API_KEY } from '../config.js';

export const pagesRouter = express.Router();

// Serve index.html with injected client key + user — must be registered before express.static
pagesRouter.get('/', (req, res) => {
    try {
        let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
        if (ADMIN_API_KEY) {
            html = html.replace('<head>', `<head>\n<script>window.FPOWS_KEY=${JSON.stringify(ADMIN_API_KEY)};window.FPOWS_USER=${JSON.stringify(req.session?.user || null)};</script>`);
        }
        res.send(html);
    } catch (e) {
        res.status(500).send('Failed to load UI');
    }
});

pagesRouter.get('/version.txt', (req, res) => {
    try {
        const v = fs.readFileSync(path.join(PUBLIC_DIR, 'version.txt'), 'utf-8');
        res.send(v);
    } catch (e) { res.status(404).send("Version file not found"); }
});
