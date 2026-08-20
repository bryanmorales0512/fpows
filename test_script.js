import 'dotenv/config';
const token = process.env.SIMPRO_ACCESS_TOKEN;
const urlJobs = 'https://redmen-uat.simprosuite.com/api/v1.0/companies/1/jobs/';
const urlQuotes = 'https://redmen-uat.simprosuite.com/api/v1.0/companies/1/quotes/';
const headers = { 'Authorization': `Bearer ${token}` };

async function test(url, query) {
    try {
        const res = await fetch(url + '?' + query, { headers });
        const json = await res.json();
        console.log(`${query}: ${json.length !== undefined ? json.length : JSON.stringify(json)}`);
    } catch(e) {
        console.log(`${query}: Error`);
    }
}

async function run() {
    console.log('JOBS:');
    await test(urlJobs, 'Site.ID=67696');
    await test(urlJobs, 'site.ID=67696');
    await test(urlJobs, 'siteID=67696');
    await test(urlJobs, 'Site=67696');
    await test(urlJobs, 'site=67696');
    
    console.log('QUOTES:');
    await test(urlQuotes, 'JobID=420436');
    await test(urlQuotes, 'Job.ID=420436');
    await test(urlQuotes, 'Site.ID=67696');
}
run();
