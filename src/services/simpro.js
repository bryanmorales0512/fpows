// simPRO API client: a single GET helper with rate-limit (429) retry/backoff.
import axios from 'axios';
import { SIMPRO_BASE_URL, SIMPRO_ACCESS_TOKEN } from '../config.js';

export const getSimpro = async (path, retries = 3, delayMs = 1500) => {
    if (!SIMPRO_BASE_URL) throw new Error("SIMPRO_BASE_URL not configured");
    const rawUrl = `${SIMPRO_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    console.log(`[simPRO FETCH] URL: ${rawUrl}`);
    try {
        const validatedUrl = new URL(rawUrl).toString();
        const response = await axios.get(validatedUrl, {
            headers: {
                'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        console.log(`[simPRO SUCCESS] ${path} -> ${response.status}`);
        return response;
    } catch (urlErr) {
        if (urlErr.response && urlErr.response.status === 429 && retries > 0) {
            console.warn(`[simPRO RATE LIMIT] 429 on ${path}. Retrying in ${delayMs}ms...`);
            await new Promise(res => setTimeout(res, delayMs));
            return getSimpro(path, retries - 1, delayMs * 2);
        }
        console.error(`[simPRO ERROR] ${path} -> ${urlErr.message}`);
        throw urlErr;
    }
};
