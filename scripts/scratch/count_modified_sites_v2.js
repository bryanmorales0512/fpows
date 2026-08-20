import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function getRecentChanges() {
    const targetDate = "2026-04-22";
    console.log(`Checking for sites modified on ${targetDate}...`);
    try {
        // Fetch last 1000 jobs sorted by DateModified
        const jobsRes = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/jobs/?pageSize=250&orderby=-DateModified&columns=ID,Site,DateModified`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });

        const modifiedSites = new Set();
        const foundJobs = [];
        
        jobsRes.data.forEach(job => {
            if (job.DateModified && job.DateModified.startsWith(targetDate)) {
                if (job.Site && job.Site.ID) {
                    modifiedSites.add(job.Site.ID);
                    foundJobs.push(job.ID);
                }
            }
        });

        // Also check quotes
        const quotesRes = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/quotes/?pageSize=250&orderby=-DateModified&columns=ID,Site,DateModified`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });

        quotesRes.data.forEach(quote => {
            if (quote.DateModified && quote.DateModified.startsWith(targetDate)) {
                if (quote.Site && quote.Site.ID) {
                    modifiedSites.add(quote.Site.ID);
                    foundJobs.push(`Q${quote.ID}`);
                }
            }
        });

        console.log(`Total unique sites modified on ${targetDate}: ${modifiedSites.size}`);
        if (modifiedSites.size > 0) {
            console.log("Details:", foundJobs.join(', '));
        } else {
            console.log("No modifications found on that specific date in the last 250 records.");
            // Print the most recent DateModified seen to help debug
            if (jobsRes.data.length > 0) {
                console.log("Most recent job modification:", jobsRes.data[0].DateModified);
            }
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}
getRecentChanges();
