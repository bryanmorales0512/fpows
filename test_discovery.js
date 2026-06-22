import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = "1";

const getSimpro = async (path) => {
    const rawUrl = `${SIMPRO_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    const response = await axios.get(rawUrl, {
        headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
    });
    return response.data;
};

async function run() {
    console.log("--- STARTING DISCOVERY TEST V2 ---");
    try {
        const cid = "50886"; // Known customer ID from previous logs
        console.log(`Testing sites for Customer #${cid}...`);
        
        // Try filtering sites by Customer ID
        try {
            const sites = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/sites/?Customer.ID=${cid}&pageSize=10`);
            console.log(`SUCCESS: Found ${sites.length} sites using Customer.ID filter.`);
        } catch (e) {
            console.log(`FAILED Customer.ID: ${e.message}`);
        }

        // Try direct sub-route
        try {
            const sites2 = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customers/companies/${cid}/sites/`);
            console.log(`SUCCESS: Found ${sites2.length} sites using sub-route.`);
        } catch (e) {
            console.log(`FAILED sub-route: ${e.message}`);
        }

        console.log("--- TEST COMPLETED ---");
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

run();
