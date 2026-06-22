import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputHtml = path.resolve(__dirname, '..', 'fpows_project_plan.html');
const outputPdf = 'C:\\Users\\Admin\\OneDrive\\Desktop\\FPOWS\\fpows_project_plan.pdf';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file:///${inputHtml.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

await page.pdf({
  path: outputPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();
console.log(`PDF saved to: ${outputPdf}`);
