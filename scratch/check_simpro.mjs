import 'dotenv/config';
import https from 'https';

const TOKEN = process.env.SIMPRO_ACCESS_TOKEN;
const BASE  = 'https://redmen-uat.simprosuite.com/api/v1.0/companies/1';

function get(path) {
  return new Promise((res, rej) => {
    const url = BASE + path;
    https.get(url, { headers: { Authorization: `Bearer ${TOKEN}` } }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch { res(d); }
      });
    }).on('error', rej);
  });
}

console.log('\n=== JOBS (1 sample) ===');
const jobs = await get('/jobs/?pageSize=1&columns=ID,Name,Customer,Site,Stage,DateIssued');
console.log(JSON.stringify(jobs[0] || jobs, null, 2));

console.log('\n=== SCHEDULES (1 sample) ===');
const sched = await get('/schedules/?pageSize=1');
console.log(JSON.stringify(sched[0] || sched, null, 2));

console.log('\n=== CUSTOMERS (1 sample) ===');
const custs = await get('/customers/?pageSize=1&columns=ID,CompanyName,Tags,Address,Email,Phone');
console.log(JSON.stringify(custs[0] || custs, null, 2));

console.log('\n=== SITES (1 sample) ===');
const sites = await get('/sites/?pageSize=1');
console.log(JSON.stringify(sites[0] || sites, null, 2));

console.log('\n=== CUSTOMER ASSETS (1 sample) ===');
const assets = await get('/customerAssets/?pageSize=1');
console.log(JSON.stringify(assets[0] || assets, null, 2));
