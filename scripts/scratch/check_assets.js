import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function checkAssets() {
    const targetDate = "2026-04-22";
    console.log(`Checking for assets modified on ${targetDate}...`);
    try {
        const url = `${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/customerAssets/?pageSize=250&columns=ID,Site,DateModified`;
        const res = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });
        
        const modifiedSites = new Set();
        res.data.forEach(a => {
            if (a.DateModified && a.DateModified.startsWith(targetDate)) {
                modifiedSites.add(a.Site?.ID);
                console.log(`Asset #${a.ID} (Site #${a.Site?.ID}) modified yesterday.`);
            }
        });
        console.log(`Summary: ${modifiedSites.size} sites had asset activity on ${targetDate}.`);
    } catch (err) {
        console.error("Asset check failed:", err.message);
    }
}
checkAssets();
