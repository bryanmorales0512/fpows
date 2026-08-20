// Express application assembly. Middleware and routers are wired in a specific
// order — session/auth before routes, and the '/' page route before
// express.static so the app shell (with injected config) is served first.
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import { SESSION_SECRET, PUBLIC_DIR } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.routes.js';
import { pagesRouter } from './routes/pages.routes.js';
import { jobsRouter } from './routes/jobs.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { emailRouter } from './routes/email.routes.js';
import { presenceRouter } from './routes/presence.routes.js';
import { systemRouter } from './routes/system.routes.js';

// Registering the MCP tool (side-effect import; not served over HTTP).
import './services/mcp.js';

export function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: '10mb' }));
    app.use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
    }));

    // Auth gate (allows /auth/*, /health, /api/ping, /api/trigger-manager-report)
    app.use(requireAuth);

    // Public auth flow
    app.use(authRouter);

    // App shell ('/' + version.txt) must come before static file serving
    app.use(pagesRouter);

    // Serve static frontend assets (index.html, logo.png, docs.html, ...)
    app.use(express.static(PUBLIC_DIR));

    // API routes
    app.use(jobsRouter);
    app.use(customersRouter);
    app.use(emailRouter);
    app.use(presenceRouter);
    app.use(systemRouter);

    return app;
}
