import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const doc = new PDFDocument({ margin: 50, size: 'A4' });
const outputPath = path.resolve('fpows_boss_summary.pdf');
doc.pipe(fs.createWriteStream(outputPath));

// ── Colours & fonts ──────────────────────────────────────────────
const RED   = '#C0392B';
const DARK  = '#1A1A1A';
const GREY  = '#555555';
const LIGHT = '#F5F5F5';
const WHITE = '#FFFFFF';

function heading1(text) {
  doc.moveDown(0.5);
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold')
     .text(text, 50, doc.y, { width: 495 });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(RED).lineWidth(1.5).stroke();
  doc.moveDown(0.5);
}

function heading2(text) {
  doc.moveDown(0.4)
     .fontSize(13).fillColor(RED).font('Helvetica-Bold')
     .text(text)
     .moveDown(0.2);
}

function body(text, colour = DARK) {
  doc.fontSize(10).fillColor(colour).font('Helvetica').text(text, { lineGap: 3 });
}

function bullet(text, indent = 65) {
  const y = doc.y;
  doc.fontSize(10).fillColor(RED).font('Helvetica-Bold').text('•', 50, y, { width: 15 });
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(text, indent, y, { width: 480 });
  doc.moveDown(0.15);
}

function tableRow(col1, col2, col3, isHeader = false) {
  const rowY = doc.y;
  const bgColor = isHeader ? RED : (tableRow._alt ? LIGHT : WHITE);
  tableRow._alt = !tableRow._alt;

  const colWidths = [160, 180, 155];
  const colX      = [50, 210, 390];
  const rowH      = isHeader ? 20 : 28;

  // background
  doc.rect(50, rowY, 495, rowH).fillColor(bgColor).fill();

  // text
  const textColor = isHeader ? WHITE : DARK;
  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';
  [col1, col2, col3].forEach((text, i) => {
    doc.fontSize(9).fillColor(textColor).font(font)
       .text(text, colX[i] + 5, rowY + (isHeader ? 5 : 4), { width: colWidths[i] - 10, height: rowH - 4 });
  });

  doc.y = rowY + rowH + 1;
}
tableRow._alt = false;

// ── COVER BAND ───────────────────────────────────────────────────
doc.rect(0, 0, 595, 130).fillColor(RED).fill();
doc.fontSize(32).fillColor(WHITE).font('Helvetica-Bold').text('FPOWS', 50, 30);
doc.fontSize(13).fillColor(WHITE).font('Helvetica').text('Field Protection Operations Web System', 50, 68);
doc.fontSize(10).fillColor('#FFCDD2').font('Helvetica').text('Project Summary — Prepared for Management', 50, 88);
doc.fontSize(9).fillColor('#FFCDD2').text('Bryan Morales  ·  REDMEN Fire Protection  ·  May 2026  ·  LIVE: redmen.simprosuite.com', 50, 106);
doc.y = 155;

// ── 1. THE PROBLEM ───────────────────────────────────────────────
heading1('The Problem It Solves');
body('Before FPOWS, technicians and admin staff had to manually look up job details in simPRO, copy information by hand, and send call sheet emails one by one. It was slow, repetitive, and easy to make mistakes. FPOWS eliminates all of that by automating the entire workflow.');

// ── 2. WHAT IT DOES ─────────────────────────────────────────────
doc.moveDown(0.6);
heading1('What FPOWS Does (in plain English)');
body('Think of FPOWS as a smart dashboard for REDMEN\'s fire protection jobs that sits on top of simPRO and does the routine work automatically.');
doc.moveDown(0.5);

// Table
tableRow._alt = false;
tableRow('What it does', 'What it means for the business', 'Benefit', true);
tableRow('Shows today\'s jobs instantly', 'No need to log into simPRO directly', 'Saves time every morning');
tableRow('Sends call sheet emails automatically', 'One click — email goes to client', 'No manual emails');
tableRow('Updates next-service dates in simPRO', 'Asset records stay accurate after every job', 'No forgotten updates');
tableRow('Sends a daily 6am manager report', 'Management gets a summary without asking', 'Better visibility');
tableRow('Flags overdue customers (30+ days)', 'Overdue work is highlighted automatically', 'Nothing falls through');
tableRow('Tracks who is viewing each job, live', 'Managers see who is working on what', 'Real-time awareness');

// ── 3. HOW IT WAS BUILT ─────────────────────────────────────────
doc.moveDown(0.7);
heading1('How It Was Built');

// Stats boxes
const stats = [
  { number: '7', label: 'Delivery Phases' },
  { number: '51', label: 'Git Commits' },
  { number: '64', label: 'Days in Dev' },
  { number: '14', label: 'API Endpoints' },
];
const boxW = 110, boxH = 48, boxGap = 12;
const startX = 52;
const startY = doc.y;

stats.forEach((s, i) => {
  const bx = startX + i * (boxW + boxGap);
  doc.rect(bx, startY, boxW, boxH).fillColor(LIGHT).fill();
  doc.rect(bx, startY, boxW, 4).fillColor(RED).fill();
  doc.fontSize(22).fillColor(RED).font('Helvetica-Bold').text(s.number, bx, startY + 8, { width: boxW, align: 'center' });
  doc.fontSize(8).fillColor(GREY).font('Helvetica').text(s.label, bx, startY + 32, { width: boxW, align: 'center' });
});

doc.y = startY + boxH + 14;
bullet('Built entirely by Bryan Morales, starting 17 March 2026');
bullet('Reached production-stable status within the first 2 weeks');
bullet('Hosted on Google Cloud — always online, no server to maintain in-house');
bullet('Connects directly to your existing simPRO account — no duplicate data entry');

// ── 4. CURRENT STATUS ───────────────────────────────────────────
doc.addPage();
doc.y = 50;
heading1('Current Status — v1.4.0 (Live Production · redmen.simprosuite.com)');

heading2('Web Dashboard');
bullet('Job viewer showing today\'s schedule pulled live from simPRO');
bullet('Smart customer search with priority tagging and overdue flags');
bullet('Full job history per customer — last 30 jobs, stage-sorted');
bullet('Live presence tracking — shows who is currently viewing each job in real time');

heading2('Email & Reporting');
bullet('Automated call sheet emails sent to clients with company logo');
bullet('Full email history log showing who was contacted and when');
bullet('Daily portfolio report delivered at 6:00am every morning (automated via Cloud Scheduler)');
bullet('Bi-weekly master activity summary sent to management every two weeks');

heading2('simPRO Integration (Live — redmen.simprosuite.com)');
bullet('Connected directly to live simPRO — NOT the UAT/test environment');
bullet('Reads jobs, customers, sites, assets, and schedules from simPRO in real time');
bullet('AFSS Due date read from site Public Notes in simPRO — shows actual date, not a calculation');
bullet('If no AFSS date in site notes → shows "No AFSS Due" instead of a misleading calculated value');
bullet('6-Monthly and 12-Monthly service dates read from Customer Assets — shows "—" if no record found');
bullet('Writes asset service date updates back to simPRO automatically after each job');
bullet('Optimised asset sync — throttled batch fetching to avoid API rate limits');

heading2('Security');
bullet('Protected from unauthorised access (API key + rate limiting + HTTPS)');
bullet('All credentials stored securely in environment variables — not in the code');
bullet('Security hardened May 2026 — headers, proxy trust, and input validation tightened');

// ── 5. WHAT'S NEXT ──────────────────────────────────────────────
doc.moveDown(0.5);
heading1('What\'s Coming Next');

tableRow._alt = false;
tableRow('Priority', 'Feature', 'Why it Matters', true);
tableRow('Short term', 'Persistent email history storage', 'Logs currently reset on server restart — move to file/DB');
tableRow('Medium term', 'GoFormz integration', 'Auto-fill inspection forms from simPRO data');
tableRow('Medium term', 'Mobile-friendly version', 'Technicians can use it on phones in the field');
tableRow('Medium term', 'Individual user logins', 'Currently one shared password — proper logins coming');
tableRow('Long term', 'Analytics dashboard', 'Visualise call sheet volume and overdue trends');

// ── 5b. APP SCREENSHOTS (auto-included if present) ──────────────
const ssDir = path.resolve('scratch/screenshots');
const ssLabels = {
  '01_dashboard.png':      'Dashboard — Today\'s jobs loaded from simPRO',
  '02_job_list.png':       'Job List — All active jobs at a glance',
  '03_customer_search.png':'Customer Search — Smart search with overdue flags',
  '04_admin_panel.png':    'Admin Panel — Email history and log management',
};
const ssDescriptions = {
  '01_dashboard.png':      'Used by technicians and admin to view the Fire Protection Outstanding Works Status call sheet for any job — pulling live client, site, and service date data directly from simPRO without manual lookup.',
  '02_job_list.png':       'Shows all outstanding works and recommendations made to the client for a selected job. Used to review job history and prepare before making a client call or site visit.',
  '03_customer_search.png':'Used to search across all customers in simPRO by name. Highlights priority clients (★ Major) and flags anyone overdue for contact (30+ days), so nothing falls through the cracks.',
  '04_admin_panel.png':    'Used by admin to view the full email call sheet history — who was contacted, when, and for which job. Also allows log management and manual report triggering.',
};
const ssSources = {
  '01_dashboard.png': [
    'Jobs page  (redmen.simprosuite.com/staff/jobs/{ID})  →  fields: Name, Stage, DateIssued, Customer.CompanyName, Site.Name, Description, Notes',
    'Sites page  (redmen.simprosuite.com/staff/locations.php)  →  fields: Address, Zone.Name, PrimaryContact (name, phone, email)',
    'Customers page  (redmen.simprosuite.com/staff/customers.php)  →  fields: CompanyName, Tags[ ].Name, Email, Phone',
    'Customer Assets  (redmen.simprosuite.com/staff/customers/{ID}/assets/)  →  fields: AssetType.Name, ServiceLevels (6mo & 12mo next due dates)',
    'Jobs filtered by Site  →  last 30 jobs at the same site — fields: ID, Name, Stage, DateIssued',
  ],
  '02_job_list.png': [
    'Jobs page  (redmen.simprosuite.com/staff/jobs/)  →  Stage = Pending / In Progress, fields: ID, Name, Customer, DateIssued',
    'Job Sections & Cost Centres  (…/jobs/{ID}/sections/{ID}/costCenters/)  →  outstanding works line items',
    'Schedules page  (redmen.simprosuite.com/staff/schedule.php)  →  fields: Staff.Name, Date, Blocks.StartTime, Blocks.EndTime',
  ],
  '03_customer_search.png': [
    'Jobs page  (Stage=Pending & Stage=Progress, pageSize=250)  →  builds the full customer search list on load',
    'Customers page  (redmen.simprosuite.com/staff/customers.php)  →  fields: CompanyName, Tags[ ].Name (★ Major flag), Address',
    'Sites page  (redmen.simprosuite.com/staff/locations.php)  →  used as fallback — fields: Name, Address, PrimaryContact',
  ],
  '04_admin_panel.png': [
    'Email history is NOT in simPRO — stored locally on the server in file: email_history.jsonl',
    'Customer Assets  (redmen.simprosuite.com/staff/customers/{ID}/assets/)  →  FPOWS writes back here after job: PATCH ServiceLevels with next service date',
  ],
};
const ssFiles = fs.existsSync(ssDir)
  ? Object.keys(ssLabels).filter(f => fs.existsSync(path.join(ssDir, f)))
  : [];

if (ssFiles.length > 0) {
  doc.addPage();
  doc.y = 50;
  heading1('App Screenshots');
  body('The following screenshots show the live FPOWS system running in production.');
  doc.moveDown(0.5);

  for (const file of ssFiles) {
    const imgPath = path.join(ssDir, file);
    const label   = ssLabels[file] || file;

    // Need at least 220pt for caption (18) + image (200) + gap
    if (doc.y > 580) { doc.addPage(); doc.y = 50; }

    const availH  = 750 - doc.y;
    const imgH    = Math.min(availH - 18, 200);

    // caption bar
    const capY = doc.y;
    doc.rect(50, capY, 495, 18).fillColor(RED).fill();
    doc.fontSize(8).fillColor(WHITE).font('Helvetica-Bold')
       .text(label, 56, capY + 4, { width: 483 });
    doc.y = capY + 22;

    // description sentence
    const desc = ssDescriptions[file];
    if (desc) {
      doc.fontSize(9).fillColor(GREY).font('Helvetica')
         .text(desc, 50, doc.y, { width: 495, lineGap: 2 });
      doc.moveDown(0.35);
    }

    // simPRO source lines
    const sources = ssSources[file];
    if (sources && sources.length) {
      const srcY = doc.y;
      doc.rect(50, srcY, 495, 14).fillColor('#F0F4FF').fill();
      doc.fontSize(7.5).fillColor('#2C3E7A').font('Helvetica-Bold')
         .text('simPRO DATA SOURCE', 55, srcY + 3, { width: 200 });
      doc.y = srcY + 16;
      sources.forEach(s => {
        const sy = doc.y;
        doc.fontSize(7).fillColor('#2C3E7A').font('Helvetica-Bold').text('›', 55, sy, { width: 10 });
        doc.fontSize(7).fillColor('#333').font('Helvetica').text(s, 64, sy, { width: 476, lineGap: 1 });
        doc.moveDown(0.2);
      });
      doc.moveDown(0.3);
    }

    // image
    try {
      doc.image(imgPath, 50, doc.y, { width: 495, height: imgH, fit: [495, imgH] });
      doc.y += imgH + 22;
    } catch (e) {
      doc.fontSize(9).fillColor(GREY).text(`[Could not embed image: ${file}]`, 50, doc.y);
      doc.moveDown(0.5);
    }
  }
}

// ── 5c. DATA SOURCES IN simPRO (actual simPRO pages) ────────────
const simproSources = [
  {
    file: 'scratch/screenshots/06_simpro_customers.png',
    title: 'simPRO → People → Customers  —  redmen.simprosuite.com/staff/customers.php  (1,350 customers)',
    used: [
      { field: 'CompanyName',  usage: 'Displayed as the client name on the call sheet and in the customer search list' },
      { field: 'Tags[ ].Name', usage: 'FPOWS reads this to flag ★ Major (priority) customers — tag name must contain "Major"' },
      { field: 'Email',        usage: 'Used as the "To:" address when sending the call sheet email to the client' },
      { field: 'Phone',        usage: 'Shown on the call sheet as the client phone number' },
      { field: 'Address.City / Address.State', usage: 'Shown as the suburb/state in the Geographical Area field on the call sheet' },
    ],
  },
  {
    file: 'scratch/screenshots/07_simpro_sites.png',
    title: 'simPRO → People → Sites  —  redmen.simprosuite.com/staff/locations.php  (1,550 sites)',
    used: [
      { field: 'Name',                  usage: 'Shown as the Site name on the call sheet' },
      { field: 'Address.Address / City', usage: 'Full street address shown on the call sheet' },
      { field: 'Zone.Name',             usage: 'Shown as the Geographical Area field on the call sheet' },
      { field: 'PrimaryContact.GivenName + FamilyName', usage: 'Shown as the on-site contact name on the call sheet' },
      { field: 'PrimaryContact.WorkPhone / Email',      usage: 'On-site contact phone and email shown on the call sheet' },
    ],
  },
];

for (const src of simproSources) {
  const imgPath = path.resolve(src.file);
  if (!fs.existsSync(imgPath)) continue;

  doc.addPage();
  doc.y = 50;
  heading1('Where FPOWS Gets Its Data — simPRO Live');

  // source title bar
  const tY = doc.y;
  doc.rect(50, tY, 495, 20).fillColor(RED).fill();
  doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
     .text(src.title, 56, tY + 5, { width: 483 });
  doc.y = tY + 26;

  // fields used table
  const colX  = [50, 185];
  const hdrY  = doc.y;
  doc.rect(50, hdrY, 495, 16).fillColor('#2C3E7A').fill();
  doc.fontSize(7.5).fillColor(WHITE).font('Helvetica-Bold')
     .text('Field in simPRO', colX[0] + 4, hdrY + 4, { width: 130 });
  doc.fontSize(7.5).fillColor(WHITE).font('Helvetica-Bold')
     .text('What FPOWS uses it for', colX[1] + 4, hdrY + 4, { width: 355 });
  doc.y = hdrY + 17;

  src.used.forEach((row, i) => {
    const ry = doc.y;
    const bg = i % 2 === 0 ? '#F5F5F5' : WHITE;
    doc.rect(50, ry, 495, 18).fillColor(bg).fill();
    doc.rect(50, ry, 2, 18).fillColor(RED).fill();
    doc.fontSize(7.5).fillColor('#2C3E7A').font('Helvetica-Bold')
       .text(row.field, 56, ry + 4, { width: 125 });
    doc.fontSize(7.5).fillColor(DARK).font('Helvetica')
       .text(row.usage, colX[1] + 4, ry + 4, { width: 355, lineGap: 1 });
    doc.y = ry + 19;
  });

  doc.moveDown(0.5);

  // actual simPRO screenshot
  const imgH = Math.min(750 - doc.y, 210);
  if (imgH > 40) {
    doc.image(imgPath, 50, doc.y, { width: 495, fit: [495, imgH] });
    doc.y += imgH + 8;
  }

  doc.fontSize(7.5).fillColor(GREY).font('Helvetica')
     .text('Above: actual simPRO screen — this is where FPOWS reads the data shown in your call sheets.', 50, doc.y, { width: 495, align: 'center' });
}

// ── 5e. WHERE FPOWS GETS ITS DATA (schedule overview) ───────────
const simproImg = path.resolve('scratch/screenshots/05_simpro_live.png');
if (fs.existsSync(simproImg)) {
  doc.addPage();
  doc.y = 50;
  heading1('Where FPOWS Gets Its Data — Inside simPRO');

  body('Everything FPOWS displays is pulled live from this screen in simPRO. Your team never has to log into simPRO manually — FPOWS reads it automatically and presents only what\'s needed.');
  doc.moveDown(0.5);

  // Annotated callout boxes
  const callouts = [
    { label: 'A', color: '#E74C3C', text: 'Schedule / Current Activity — FPOWS reads this list to show today\'s jobs and technician assignments' },
    { label: 'B', color: '#2980B9', text: 'Job Number & Name (e.g. 441684) — FPOWS uses this ID to fetch full job details, site, client, and outstanding works' },
    { label: 'C', color: '#27AE60', text: 'Customer & Site columns — FPOWS pulls customer name, site address, and contact details from here' },
    { label: 'D', color: '#8E44AD', text: 'People → Customers / Sites (left menu) — FPOWS also queries these sections for customer search, tags (★ Major), and asset service dates' },
  ];

  const boxW = 495, boxH = 22;
  callouts.forEach((c) => {
    if (doc.y > 720) { doc.addPage(); doc.y = 50; }
    const cy = doc.y;
    doc.rect(50, cy, boxW, boxH).fillColor('#FAFAFA').fill();
    doc.rect(50, cy, 4, boxH).fillColor(c.color).fill();
    // circle badge
    doc.circle(65, cy + boxH / 2, 7).fillColor(c.color).fill();
    doc.fontSize(8).fillColor(WHITE).font('Helvetica-Bold').text(c.label, 62, cy + boxH / 2 - 4, { width: 14, align: 'center' });
    doc.fontSize(8).fillColor(DARK).font('Helvetica').text(c.text, 78, cy + 5, { width: 460, lineGap: 1 });
    doc.y = cy + boxH + 4;
  });

  doc.moveDown(0.5);

  // simPRO screenshot
  const imgY = doc.y;
  const imgH = Math.min(750 - imgY, 220);
  if (imgH > 50) {
    doc.image(simproImg, 50, imgY, { width: 495, height: imgH, fit: [495, imgH] });
    doc.y = imgY + imgH + 10;
  }

  // Caption under image
  doc.fontSize(7.5).fillColor(GREY).font('Helvetica')
     .text('Above: simPRO live dashboard at redmen.simprosuite.com — the source system FPOWS connects to via the simPRO REST API.', 50, doc.y, { width: 495, align: 'center' });
  doc.moveDown(0.5);
}

// ── 6. BOTTOM LINE ──────────────────────────────────────────────
if (doc.y > 700) { doc.addPage(); doc.y = 50; }
doc.moveDown(0.8);
const blY = doc.y;
doc.rect(50, blY, 495, 70).fillColor('#FFF3F3').fill();
doc.rect(50, blY, 4, 70).fillColor(RED).fill();
doc.fontSize(12).fillColor(RED).font('Helvetica-Bold').text('Bottom Line', 65, blY + 10);
doc.fontSize(10).fillColor(DARK).font('Helvetica')
   .text('FPOWS is a custom automation tool built in-house that saves REDMEN staff time every single day by eliminating manual lookups, manual emails, and manual data entry — all connecting to the simPRO system already in use.', 65, blY + 28, { width: 470, lineGap: 3 });

// ── FOOTER ───────────────────────────────────────────────────────
const pages = doc.bufferedPageRange ? doc.bufferedPageRange() : null;
doc.fontSize(8).fillColor(GREY)
   .text('FPOWS v1.4.0  ·  REDMEN Fire Protection  ·  Prepared by Bryan Morales  ·  May 2026  ·  Live: redmen.simprosuite.com',
         50, 810, { width: 495, align: 'center' });

doc.end();
console.log(`PDF saved to: ${outputPath}`);
