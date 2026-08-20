import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function getModifiedSites() {
    const targetDate = "2026-04-22";
    console.log(`Checking for sites modified on ${targetDate}...`);

    try {
        // Fetch jobs modified recently
        const jobsRes = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/jobs/?pageSize=250&columns=ID,Site,DateModified`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });

        const modifiedSites = new Set();
        
        jobsRes.data.forEach(job => {
            if (job.DateModified && job.DateModified.startsWith(targetDate)) {
                if (job.Site && job.Site.ID) {
                    modifiedSites.add(job.Site.ID);
                }
            }
        });

        // Also check quotes
        const quotesRes = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/quotes/?pageSize=250&columns=ID,Site,DateModified`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });

        quotesRes.data.forEach(quote => {
            if (quote.DateModified && quote.DateModified.startsWith(targetDate)) {
                if (quote.Site && quote.Site.ID) {
                    modifiedSites.add(quote.Site.ID);
                }
            }
        });

        console.log(`Total unique sites modified on ${targetDate}: ${modifiedSites.size}`);
        console.log("Site IDs:", Array.from(modifiedSites));

    } catch (err) {
        console.error("Error fetching data:", err.message);
    }
}

getModifiedSites();
