// Google OAuth routes. Login is restricted to the allowed email domain.
import express from 'express';
import { googleOAuth, GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN } from '../config.js';

export const authRouter = express.Router();

// Auth: Initiate Google login
authRouter.get('/auth/login', (req, res) => {
    const url = googleOAuth.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account'
    });
    res.redirect(url);
});

// Auth: Google OAuth callback
authRouter.get('/auth/callback', async (req, res) => {
    try {
        const { tokens } = await googleOAuth.getToken(req.query.code);
        const ticket = await googleOAuth.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
        const { email, name, picture } = ticket.getPayload();
        if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
            req.session.rejected = email;
            return res.redirect('/auth/rejected');
        }
        req.session.user = { email, name, picture };
        res.redirect('/');
    } catch (err) {
        console.error('[AUTH] Callback error:', err.message);
        res.redirect('/auth/login');
    }
});

// Auth: Rejected page
authRouter.get('/auth/rejected', (req, res) => {
    const email = req.session.rejected || 'your account';
    req.session.destroy(() => {});
    res.status(403).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Access Denied – FPOWS</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:white;border-radius:12px;padding:48px 40px;max-width:460px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1)}.logo{font-size:2rem;font-weight:900;letter-spacing:-1px;margin-bottom:8px}.logo span{color:#c0392b}h1{font-size:1.1rem;color:#c0392b;margin-bottom:24px;font-weight:700}p{color:#555;line-height:1.6;margin-bottom:12px}.email{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 16px;color:#991b1b;font-size:0.9rem;margin:16px 0 24px;word-break:break-all}a{display:inline-block;background:#c0392b;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.95rem}a:hover{background:#a93226}</style>
</head><body><div class="card">
<div class="logo"><span>F</span>POWS</div>
<h1>Access Denied</h1>
<p>This system is restricted to <strong>Redadair</strong> staff only.</p>
<div class="email">${email}</div>
<p>You must sign in with a <strong>@redadair.com.au</strong> Google account.</p><br>
<a href="/auth/login">Sign in with a different account</a>
</div></body></html>`);
});

// Auth: Logout
authRouter.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/auth/login'));
});
