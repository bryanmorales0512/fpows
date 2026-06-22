import puppeteer from 'puppeteer';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const OUT = path.resolve('scratch/screenshots/04_admin_panel.png');

// Fetch HTML via curl then inject — avoids navigation block
const html = execSync('curl -s "http://localhost:3000/"', { maxBuffer: 10 * 1024 * 1024 }).toString();

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  defaultViewport: { width: 1440, height: 900 },
  timeout: 10000,
});

const page = await browser.newPage();

await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 800));

// Mock fetch so /api/logs returns sample data (setContent has no base URL, real calls fail)
await page.evaluate(() => {
  const mockLogs = { logs: [
    { timestamp: '2026-05-20T06:00:00.000Z', jobId: '10045', client: 'Building Group Holdings', clientEmail: 'site.manager@buildinggroup.com.au', managerEmail: 'bryan.morales@redadair.com.au' },
    { timestamp: '2026-05-19T14:23:00.000Z', jobId: '10039', client: 'ACME Facilities Pty Ltd',  clientEmail: 'contact@acmefacilities.com.au',     managerEmail: 'bryan.morales@redadair.com.au' },
    { timestamp: '2026-05-18T09:11:00.000Z', jobId: '10031', client: 'Industrial Park Complex',  clientEmail: 'admin@industrialpark.com.au',        managerEmail: 'bryan.morales@redadair.com.au' },
    { timestamp: '2026-05-16T11:45:00.000Z', jobId: '10025', client: 'Harbour View Centre',      clientEmail: 'reception@harbourview.com.au',       managerEmail: 'bryan.morales@redadair.com.au' },
    { timestamp: '2026-05-14T08:30:00.000Z', jobId: '10019', client: 'Westfield Retail Plaza',   clientEmail: 'fm@retail-plaza.com.au',             managerEmail: 'bryan.morales@redadair.com.au' },
  ]};
  const _fetch = window.fetch;
  window.fetch = (url, opts) => {
    if (typeof url === 'string' && url.includes('logs')) {
      return Promise.resolve(new Response(JSON.stringify(mockLogs), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return _fetch(url, opts);
  };
  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return _xhrOpen.call(this, method, url, ...args);
  };
});

// Click the History button to open the modal
const btns = await page.$$('button');
for (const btn of btns) {
  const txt = await btn.evaluate(el => el.textContent.toLowerCase());
  if (txt.includes('history')) {
    await btn.click();
    console.log('Clicked History button');
    break;
  }
}

await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: OUT });
console.log('Saved:', OUT);

await browser.close();
pkill();
function pkill() { try { execSync('pkill -f "node server.js"'); } catch {} }
