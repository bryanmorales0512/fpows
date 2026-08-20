import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function deepSearch() {
    const targetDate = "2026-04-22";
    console.log(`Deep searching for any activity on ${targetDate}...`);
    try {
        const modifiedSites = new Set();
        // Fetch 1000 jobs in batches
        for (let page = 1; page <= 4; page++) {
            const res = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/jobs/?pageSize=250&page=${page}&columns=ID,Site,DateModified`, {
                headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
            });
            res.data.forEach(j => {
                if (j.DateModified && j.DateModified.startsWith(targetDate)) {
                    modifiedSites.add(j.Site?.ID);
                }
            });
            if (res.data.length < 250) break;
        }

        // Fetch 1000 quotes in batches
        for (let page = 1; page <= 4; page++) {
            const res = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/quotes/?pageSize=250&page=${page}&columns=ID,Site,DateModified`, {
                headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
            });
            res.data.forEach(q => {
                if (q.DateModified && q.DateModified.startsWith(targetDate)) {
                    modifiedSites.add(q.Site?.ID);
                }
            });
            if (res.data.length < 250) break;
        }

        console.log(`Result: ${modifiedSites.size} sites had job/quote activity on ${targetDate}.`);
    } catch (err) {
        console.error("Deep search failed:", err.message);
    }
}
deepSearch();
