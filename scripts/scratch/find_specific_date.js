import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function findApril22Changes() {
    try {
        console.log("Searching for any changes starting from April 22, 2026...");
        const url = `${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/jobs/?DateModified=ge,2026-04-22T00:00:00&pageSize=250&columns=ID,Site,DateModified`;
        const res = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });
        
        console.log(`Found ${res.data.length} jobs modified since April 22.`);
        res.data.forEach(j => console.log(`Job #${j.ID} modified at ${j.DateModified}`));

    } catch (err) {
        console.error("Search failed:", err.message);
    }
}
findApril22Changes();
