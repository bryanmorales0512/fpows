// Authentication & authorization middleware.
import { ADMIN_API_KEY } from '../config.js';

// Gate all pages behind a Google session, except public auth/health endpoints.
export function requireAuth(req, res, next) {
    // LOCAL DEV ONLY: preview the UI without Google OAuth. Never active in
    // production — requires NODE_ENV!=production AND DEV_NO_AUTH=1 in .env.
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_NO_AUTH === '1') {
        if (!req.session.user) {
            req.session.user = { email: 'dev@redadair.com.au', name: 'Local Dev', picture: '' };
        }
        return next();
    }

    // Programmatic (server-to-server) access for the ADK agent / integrations:
    // a valid x-agent-key header authenticates without a browser session. The
    // exposed routes are read-only; keep AGENT_API_KEY secret.
    const agentKey = process.env.AGENT_API_KEY;
    if (agentKey && req.headers['x-agent-key'] === agentKey) return next();

    if (req.path.startsWith('/auth/') ||
        req.path === '/health' ||
        req.path === '/api/ping' ||
        req.path === '/api/trigger-manager-report') return next();
    if (req.session?.user) return next();
    res.redirect('/auth/login');
}

// Protect admin endpoints with a shared API key (header or ?key= query).
export function requireApiKey(req, res, next) {
    if (!ADMIN_API_KEY) return next();
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}
