import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const OUT_DIR = path.resolve('scratch/screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Fetch HTML via curl (known to work) then inject via setContent — no navigation needed
function fetch(url) {
  return execSync(`curl -s "${url}"`, { maxBuffer: 10 * 1024 * 1024 }).toString();
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  defaultViewport: { width: 1440, height: 900 },
  timeout: 10000,
});

const page = await browser.newPage();

async function loadAndShot(url, filename, scrollY = 0, waitMs = 3000) {
  const html = fetch(url);
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (scrollY) await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await new Promise(r => setTimeout(r, waitMs));
  await page.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log('Saved:', filename);
}

console.log('1/4 Dashboard...');
await loadAndShot('http://localhost:3000/', '01_dashboard.png', 0, 3000);

console.log('2/4 Job list (scrolled)...');
await loadAndShot('http://localhost:3000/', '02_job_list.png', 380, 2000);

console.log('3/4 Customer search...');
await loadAndShot('http://localhost:3000/', '03_customer_search.png', 0, 1000);
// Click search button if present
const btns = await page.$$('button');
for (const btn of btns) {
  const t = await btn.evaluate(el => el.textContent.toLowerCase()).catch(() => '');
  if (t.includes('search') || t.includes('customer')) { await btn.click().catch(() => {}); break; }
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: path.join(OUT_DIR, '03_customer_search.png') });
console.log('Saved: 03_customer_search.png (after click)');

console.log('4/4 Admin panel...');
const ADMIN_KEY = 'x1SwjWAyupO9S6SOYr2KeKRUQowcYB8yZFpCUfM';
await loadAndShot(`http://localhost:3000/admin?key=${ADMIN_KEY}`, '04_admin_panel.png', 0, 2000);

await browser.close();
console.log('\nAll screenshots saved to:', OUT_DIR);
