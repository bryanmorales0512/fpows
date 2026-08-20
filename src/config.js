// Centralised configuration: environment variables, derived paths, and the
// Google OAuth client. Importing this module loads .env (in non-production)
// and fails fast if the critical simPRO credentials are missing.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';

// Load .env if not in production (Cloud Run injects env vars directly)
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Filesystem layout -------------------------------------------------------
// config.js lives in <root>/src, so the project root is one level up.
export const ROOT_DIR = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');   // served web app
export const DATA_DIR = path.join(ROOT_DIR, 'data');       // runtime read/write data

export const PORT = process.env.PORT || 3000;

// Clean environment variables (handles cases where Cloud Run concatenates them)
const cleanEnv = (val, defaultValue = "") => {
    if (!val || val === "undefined" || val === "null" || val === "") return defaultValue;
    let cleaned = val.toString().replace(/[^\x20-\x7E]/g, '').trim().replace(/^"|"$/g, '');
    // If the variable contains a space followed by another variable name (Cloud Run corruption), take the first part
    if (cleaned.includes(' ')) {
        cleaned = cleaned.split(' ')[0];
    }
    return cleaned;
};

// --- Configuration from environment variables --------------------------------
export const SIMPRO_BASE_URL = cleanEnv(process.env.SIMPRO_BASE_URL);
export const SIMPRO_ACCESS_TOKEN = cleanEnv(process.env.SIMPRO_ACCESS_TOKEN);
export const COMPANY_ID = cleanEnv(process.env.SIMPRO_COMPANY_ID, "1");
export const SMTP_USER = cleanEnv(process.env.SMTP_USER);
export const SMTP_PASS = cleanEnv(process.env.SMTP_PASS);
export const MANAGER_EMAIL = cleanEnv(process.env.MANAGER_EMAIL);
export const ADMIN_API_KEY = cleanEnv(process.env.ADMIN_API_KEY);
export const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
export const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
export const SESSION_SECRET = cleanEnv(process.env.SESSION_SECRET, 'fpows-dev-secret-change-me');
export const ALLOWED_EMAIL_DOMAIN = '@redadair.com.au';

// Safety switch: when SIMPRO_READ_ONLY=1, the app makes NO writes to simPRO
// (skips the background asset-service-date sync). Use this when pointing at a
// production instance for testing so viewing jobs cannot modify live data.
export const SIMPRO_READ_ONLY = cleanEnv(process.env.SIMPRO_READ_ONLY) === '1';

export const OAUTH_REDIRECT = process.env.NODE_ENV === 'production'
    ? 'https://fpows.redadair.com.au/auth/callback'
    : 'http://localhost:3000/auth/callback';

export const googleOAuth = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT);

// Fail fast: the server cannot function without a simPRO connection.
if (!SIMPRO_BASE_URL || !SIMPRO_ACCESS_TOKEN) {
    throw new Error("[CRITICAL] Missing SIMPRO_BASE_URL or SIMPRO_ACCESS_TOKEN — server cannot start.");
}
