import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

const BASE = process.env.SIMPRO_BASE_URL;
const TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const CO = process.env.SIMPRO_COMPANY_ID || '1';

const get = (path) => axios.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000
});

// Job 443776 - Avondale College
const jobRes = await get(`/api/v1.0/companies/${CO}/jobs/443776`);
const siteId = jobRes.data.Site?.ID;
console.log('Site ID:', siteId);

// Fetch site with NO column filter — get everything
const siteRes = await get(`/api/v1.0/companies/${CO}/sites/${siteId}`);
const data = siteRes.data;

// Print all top-level keys
console.log('\n--- All site fields ---');
Object.keys(data).forEach(k => {
    const val = data[k];
    if (typeof val === 'string' && val.length > 0) {
        console.log(`\n[${k}]:\n${val.substring(0, 500)}`);
    } else if (val !== null && typeof val === 'object') {
        console.log(`\n[${k}]: (object)`, JSON.stringify(val).substring(0, 200));
    }
});
