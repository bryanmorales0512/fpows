import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SIMPRO_BASE_URL = process.env.SIMPRO_BASE_URL;
const SIMPRO_ACCESS_TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const COMPANY_ID = "1";

async function testSimproPatch() {
    try {
        console.log("Searching for any customer asset with a service level...");
        const res = await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/customerAssets/?pageSize=250`, {
            headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
        });
        
        let assetWithSL = null;
        for(let a of res.data) {
            if (a.ServiceLevels && a.ServiceLevels.length > 0) {
                assetWithSL = a;
                break;
            }
        }

        if (!assetWithSL) {
            console.log("Could not find any asset with ServiceLevels in the first 250.");
            return;
        }

        const slId = assetWithSL.ServiceLevels[0].ID;
        console.log(`Found! Asset ID: ${assetWithSL.ID}, ServiceLevel ID: ${slId}`);

        // Let's test the customerAssets endpoint for GET service level
        try {
            await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/customerAssets/${assetWithSL.ID}/serviceLevels/${slId}/`, {
                headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
            });
            console.log("SUCCESS: /customerAssets/{id}/serviceLevels/{slId}/ GET works!");
        } catch(e) {
            console.log("FAILED: /customerAssets... GET returns " + e.response?.status);
        }

        // Test the old assets endpoint (which was returning 404 in logs)
        try {
            await axios.get(`${SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/assets/${assetWithSL.ID}/serviceLevels/${slId}/`, {
                headers: { 'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}` }
            });
            console.log("SUCCESS: /assets/{id}/serviceLevels/{slId}/ GET works!");
        } catch(e) {
            console.log("FAILED: /assets... GET returns " + e.response?.status);
        }

    } catch (e) {
        console.error("Test failed: ", e.message);
    }
}

testSimproPatch();
