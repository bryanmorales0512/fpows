// Authentication & authorization middleware.
import { ADMIN_API_KEY } from '../config.js';

// Gate all pages behind a Google session, except public auth/health endpoints.
export function requireAuth(req, res, next) {
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
