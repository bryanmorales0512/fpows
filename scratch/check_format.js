import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = process.env.SIMPRO_COMPANY_ID || "1";

async function checkFormat() {
    try {
        const jobsRes = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/jobs/?pageSize=5&columns=ID,DateModified`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });
        console.log("Job Data:", JSON.stringify(jobsRes.data, null, 2));
    } catch (err) {
        console.error(err.message);
    }
}
checkFormat();
