# FPOWS Screenshot Taker
# Run this from a normal PowerShell window (NOT inside Claude Code)
# It will open your live app, screenshot key pages, and save them.

$BASE_URL  = "https://bryan-fpows-712513641417.australia-southeast1.run.app"
$ADMIN_KEY = $env:ADMIN_API_KEY
if (-not $ADMIN_KEY) { $ADMIN_KEY = "x1SwjWAyupO9S6SOYr2KeKRUQowcYB8yZFpCUfM" }

$OUTDIR = "$PSScriptRoot\scratch\screenshots"
if (-not (Test-Path $OUTDIR)) { New-Item -ItemType Directory -Path $OUTDIR | Out-Null }

Write-Host "Taking FPOWS screenshots..." -ForegroundColor Cyan

# Use node + puppeteer (already installed)
$script = @"
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL  = '$BASE_URL';
const ADMIN_KEY = '$ADMIN_KEY';
const OUT_DIR   = path.join(__dirname, 'scratch', 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: false,
  executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.evaluateOnNewDocument((key) => { window.FPOWS_KEY = key; }, ADMIN_KEY);

const shot = async (filename, delay = 3000) => {
  await new Promise(r => setTimeout(r, delay));
  await page.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log('Saved:', filename);
};

// 1. Dashboard
console.log('1/4 Dashboard...');
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await shot('01_dashboard.png', 5000);

// 2. Scroll down to show jobs
console.log('2/4 Job list...');
await page.evaluate(() => window.scrollTo(0, 350));
await shot('02_job_list.png', 1500);

// 3. Customer search
console.log('3/4 Customer search...');
await page.evaluate(() => window.scrollTo(0, 0));
const btns = await page.$$('button');
for (const btn of btns) {
  const t = await btn.evaluate(el => el.textContent.toLowerCase());
  if (t.includes('search') || t.includes('customer')) { await btn.click(); break; }
}
await new Promise(r => setTimeout(r, 1000));
const input = await page.$('input[type=text]');
if (input) { await input.type('Red', { delay: 60 }); }
await shot('03_customer_search.png', 3000);

// 4. Admin panel
console.log('4/4 Admin panel...');
try {
  await page.goto(BASE_URL + '/admin?key=' + ADMIN_KEY, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await shot('04_admin_panel.png', 2000);
} catch { console.log('Admin page skipped'); }

await browser.close();
console.log('\\nAll done! Screenshots saved to:', OUT_DIR);
"@

$tmpScript = "$PSScriptRoot\scratch\_ss_temp.mjs"
$script | Out-File -FilePath $tmpScript -Encoding utf8

Write-Host "Running screenshot script..." -ForegroundColor Yellow
node $tmpScript
Remove-Item $tmpScript -ErrorAction SilentlyContinue

Write-Host "`nDone! Now run in Claude Code:" -ForegroundColor Green
Write-Host "  node scratch/generate_boss_pdf.mjs" -ForegroundColor White
