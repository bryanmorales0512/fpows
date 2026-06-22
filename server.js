// [HEARTBEAT] Loaded Bryan as Sender - 2026-04-20
import { FastMCP } from 'fastmcp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import express from 'express';
import cron from 'node-cron';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { OAuth2Client } from 'google-auth-library';

// Load .env if not in production
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Utility to clean environment variables (handles cases where variables might be concatenated in Cloud Run)
const cleanEnv = (val, defaultValue = "") => {
    if (!val || val === "undefined" || val === "null" || val === "") return defaultValue;
    let cleaned = val.toString().replace(/[^\x20-\x7E]/g, '').trim().replace(/^"|"$/g, '');
    // If the variable contains a space followed by another variable name (Cloud Run corruption), take the first part
    if (cleaned.includes(' ')) {
        cleaned = cleaned.split(' ')[0];
    }
    return cleaned;
};

// Configuration from Environment Variables
const SIMPRO_BASE_URL = cleanEnv(process.env.SIMPRO_BASE_URL);
const SIMPRO_ACCESS_TOKEN = cleanEnv(process.env.SIMPRO_ACCESS_TOKEN);
const COMPANY_ID = cleanEnv(process.env.SIMPRO_COMPANY_ID, "1");
const SMTP_USER = cleanEnv(process.env.SMTP_USER);
const SMTP_PASS = cleanEnv(process.env.SMTP_PASS);
const MANAGER_EMAIL = cleanEnv(process.env.MANAGER_EMAIL);
const ADMIN_API_KEY = cleanEnv(process.env.ADMIN_API_KEY);
const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
const SESSION_SECRET = cleanEnv(process.env.SESSION_SECRET, 'fpows-dev-secret-change-me');
const OAUTH_REDIRECT = process.env.NODE_ENV === 'production'
    ? 'https://fpows.redadair.com.au/auth/callback'
    : 'http://localhost:3000/auth/callback';
const googleOAuth = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT);

/**
 * Background Service: Sync Asset Service Dates back to simPRO
 * This ensures that when a job is processed, the next service date is automatically set in the DB.
 */
async function syncAssetDates(siteId, jobDate, jobType) {
    if (!siteId) return;
    
    try {
        console.log(`[AUTO-SYNC] Starting asset sync for Site #${siteId} (Type: ${jobType}, Date: ${jobDate})`);
        
        // 1. Calculate the Target Next Date
        const baseDate = new Date(jobDate);
        if (isNaN(baseDate.getTime())) return;
        
        // Move to the same day next cycle
        if (jobType === "12 Monthly") {
            baseDate.setFullYear(baseDate.getFullYear() + 1);
        } else {
            baseDate.setMonth(baseDate.getMonth() + 6);
        }
        
        // Format to YYYY-MM-DD for simPRO
        const nextDateStr = baseDate.toISOString().split('T')[0];
        console.log(`[AUTO-SYNC] Target Next Date: ${nextDateStr}`);

        // 2. Fetch Customer Assets for this Site (Returns ServiceLevels INLINE)
        const assetsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customerAssets/?Site.ID=${siteId}&pageSize=250`);
        if (!assetsRes.data || assetsRes.data.length === 0) return;

        for (const asset of assetsRes.data) {
            try {
                // 3. Extract Inline Service Levels
                const serviceLevels = asset.ServiceLevels || [];
                if (serviceLevels.length === 0) continue;

                for (const sl of serviceLevels) {
                    const slName = (sl.Name || "").toLowerCase();
                    const isAnnualMatch = jobType === "12 Monthly" && (slName.includes("annual") || slName.includes("12 month") || slName.includes("yearly") || slName.includes("12month"));
                    const is6MonthMatch = jobType === "6 Monthly" && (slName.includes("6 month") || slName.includes("6month") || slName.includes("bi-annual") || slName.includes("half year") || slName.includes("semi-annual"));

                    if (isAnnualMatch || is6MonthMatch) {
                        // 4. Update if the date is different (Standardizes to /customerAssets/ endpoint)
                        const dateStr = sl.ServiceDate || sl.NextDate || "";
                        if (dateStr !== nextDateStr) {
                            console.log(`[AUTO-SYNC] Updating Asset #${asset.ID} Service Level #${sl.ID} to ${nextDateStr}`);
                            await axios.patch(`${process.env.SIMPRO_BASE_URL}/api/v1.0/companies/${COMPANY_ID}/customerAssets/${asset.ID}/serviceLevels/${sl.ID}/`, 
                                { ServiceDate: nextDateStr, NextDate: nextDateStr },
                                { headers: { 'Authorization': `Bearer ${process.env.SIMPRO_ACCESS_TOKEN}` } }
                            );
                        }
                    }
                }
            } catch (e) {
                console.error(`[AUTO-SYNC ERROR] Failed asset #${asset.ID}: ${e.message}`);
            }
        }
        console.log(`[AUTO-SYNC] Completed for Site #${siteId}`);
    } catch (err) {
        console.error(`[AUTO-SYNC CRITICAL ERROR]: ${err.message}`);
    }
}

if (!SIMPRO_BASE_URL || !SIMPRO_ACCESS_TOKEN) {
    throw new Error("[CRITICAL] Missing SIMPRO_BASE_URL or SIMPRO_ACCESS_TOKEN — server cannot start.");
}

// Reusable SMTP transporter (created once, connection pooled)
function getTransporter() {
    // Re-read env every time to ensure we pick up .env changes without needing a full reboot
    const user = process.env.SMTP_USER ? process.env.SMTP_USER.replace(/^"|"$/g, '') : null;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : null;

    if (user && pass) {
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass },
            pool: true,
            maxConnections: 3
        });
    }
    return null;
}

// Simple retry helper for sending email
async function sendMailWithRetry(transporter, mailOptions, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } catch (err) {
            console.error(`[SMTP] Attempt ${attempt + 1} failed: ${err.message}`);
            if (attempt < retries) {
                console.log(`[SMTP] Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                throw err;
            }
        }
    }
}

const getSimpro = async (path, retries = 3, delayMs = 1500) => {
    if (!SIMPRO_BASE_URL) throw new Error("SIMPRO_BASE_URL not configured");
    const rawUrl = `${SIMPRO_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    console.log(`[simPRO FETCH] URL: ${rawUrl}`);
    try {
        const validatedUrl = new URL(rawUrl).toString();
        const response = await axios.get(validatedUrl, {
            headers: {
                'Authorization': `Bearer ${SIMPRO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000 
        });
        console.log(`[simPRO SUCCESS] ${path} -> ${response.status}`);
        return response;
    } catch (urlErr) {
        if (urlErr.response && urlErr.response.status === 429 && retries > 0) {
            console.warn(`[simPRO RATE LIMIT] 429 on ${path}. Retrying in ${delayMs}ms...`);
            await new Promise(res => setTimeout(res, delayMs));
            return getSimpro(path, retries - 1, delayMs * 2);
        }
        console.error(`[simPRO ERROR] ${path} -> ${urlErr.message}`);
        throw urlErr;
    }
};

// Initialize FastMCP Server
const mcp = new FastMCP({
    name: "simPRO FPOWS Automation",
    version: "1.0.0"
});

// Decode all common HTML entities to plain text
function decodeHtmlEntities(str) {
    return str
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&bull;/gi, '•')
        .replace(/&middot;/gi, '·')
        .replace(/&ndash;/gi, '–')
        .replace(/&mdash;/gi, '—')
        .replace(/&hellip;/gi, '…')
        .replace(/&#8226;/g, '•')
        .replace(/&#x2022;/gi, '•')
        .replace(/&#\d+;/g, c => { try { return String.fromCharCode(parseInt(c.slice(2,-1))); } catch { return ''; } });
}

// DESCRIPTION CLEANER: Show everything from the description — only strip internal noise
function cleanDescriptionForClient(desc) {
    if (!desc || !desc.trim()) return null;

    // 1. Strip HTML tags and decode entities
    const clean = decodeHtmlEntities(
        desc
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    ).replace(/[ \t]+/g, ' ').trim();

    // 2. Only remove true noise — internal timestamps and tracking URLs.
    //    Show ALL other content including empty template fields, so the expanded
    //    view matches simPRO exactly. The frontend summary picker skips empty labels.
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    const filtered = lines.filter(line => {
        const p = line.toLowerCase();
        // Internal staff timestamps (e.g. "14:32 01/06/2026 Geffrey Go")
        if (/^\d{1,2}:\d{2}\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(p)) return false;
        // External tracking links
        if (p.includes('my link ly')) return false;
        return true;
    });

    if (filtered.length === 0) return null;
    return filtered.join('\n');
}

// Full staff-facing description: strips only truly internal lines, keeps everything else.
// Puts Scheduled Date/Time first so the summary line (first line) is the date.
function fullDescriptionForStaff(rawDesc) {
    if (!rawDesc || !rawDesc.trim()) return null;
    const clean = decodeHtmlEntities(
        rawDesc
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    ).replace(/[ \t]+/g, ' ').trim();
    const schedulingLabelRe = /^(JAN|FEB|MAR|APR|MAY|JUN|JUNE|JUL|JULY|AUG|SEP|OCT|NOV|DEC)\s+WEEK\s+\d+/i;
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean).filter(line => {
        const p = line.toLowerCase();
        if (/^\d{1,2}:\d{2}\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(p)) return false; // timestamps
        if (p.includes('my link ly')) return false;
        if (p.includes('sell price:')) return false;
        if (p.includes('quoted by:')) return false;
        if (p.includes('requested by:')) return false;
        if (schedulingLabelRe.test(line.trim())) return false;
        return true;
    });
    if (lines.length === 0) return null;
    // Put Scheduled Date first, then Time, then everything else — date shows as the summary line
    const dateLines  = lines.filter(l => /^scheduled\s+date:/i.test(l));
    const timeLines  = lines.filter(l => /^scheduled\s+time:/i.test(l));
    const otherLines = lines.filter(l => !/^scheduled\s+(date|time):/i.test(l));
    return [...dateLines, ...timeLines, ...otherLines].join('\n');
}

/**
 * Shared logic for data aggregation
 * Can be called by MCP tool or REST API
 */
const fetchFpowData = async (jobId) => {
    const jobRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${jobId}`);
    const jobData = jobRes.data;

    // 1. Site Info
    let siteName = jobData.Site?.Name || "Site Details Not Found";
    let siteArea = "N/A";
    let afssFromNotes = null;
    if (jobData.Site?.ID) {
        try {
            const siteRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/sites/${jobData.Site.ID}?columns=Address,PublicNotes`);
            if (siteRes.data && siteRes.data.Address) {
                const addr = siteRes.data.Address;
                const isAustralia = !addr.Country || addr.Country.toLowerCase().includes('australia');
                if (isAustralia) {
                    const suburb = addr.City || "";
                    const state = addr.State || "";
                    const postcode = addr.PostalCode || "";
                    siteArea = `${suburb}${suburb && (state || postcode) ? ', ' : ''}${state}${state && postcode ? ' ' : ''}${postcode}`.trim();
                } else {
                    siteArea = "Non-Australian Site";
                }
            }
            // Parse AFSS due date from site Public Notes
            if (siteRes.data?.PublicNotes) {
                const notesText = siteRes.data.PublicNotes.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
                // Match: "AFSS DUE DATE - 20th of June 2026" or "AFSS DUE - 20/06/2026" or "AFSS DUE DATE 20 June 2026"
                const afssMatch = notesText.match(/AFSS\s+DUE(?:\s+DATE)?\s*[-:]?\s*(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
                if (afssMatch) {
                    const raw = afssMatch[1].replace(/(?:st|nd|rd|th)\s+of\s+/i, ' ').replace(/(?:st|nd|rd|th)\s+/i, ' ').trim();
                    const parsed = new Date(raw);
                    if (!isNaN(parsed)) afssFromNotes = parsed.toLocaleDateString('en-AU');
                }
            }
        } catch (e) {}
    }
    
    // 2. Contact Parse
    // Strip HTML tags and extract plain text from a potentially HTML-encoded simPRO field
    const stripHtml = (val) => {
        if (!val) return "";
        return val.toString()
            .replace(/<[^>]+>/g, ' ')       // complete tags: <span style="...">
            .replace(/^[^<>]*">\s*/gm, '')  // partial tag remnants at line start: 10pt;">
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/\s+/g, ' ')
            .trim();
    };
    // For phone: strip HTML remnants AND any "Phone Number:" label simPRO embeds
    const cleanPhone = (val) => {
        if (!val) return "";
        let v = val.toString()
            .replace(/<[^>]+>/g, ' ')
            .replace(/^[^<>]*">\s*/gm, '')  // strip partial tag ending e.g. 10pt;">
            .replace(/Phone\s*Number\s*[:\-]?\s*/i, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        // Last resort: if value still has non-phone junk, extract the digit sequence
        if (v && !/^[\d\+\(]/.test(v)) {
            const digits = v.match(/[\d][\d\s\-\(\)]{5,}/);
            if (digits) v = digits[0].trim();
        }
        return v;
    };

    let contactSource = jobData.Contact?.Name ? "simpro_direct" : "not_found";
    const desc = jobData.Description || "";
    const nameMatch = desc.match(/Name:\s*([^<\n\r]+)/i);
    const phoneMatch = desc.match(/Phone[^:]*:\s*([^<\n\r]+)/i);
    const emailMatch = desc.match(/Email:\s*([^<\n\r]+)/i);

    let contactName = stripHtml(jobData.Contact?.Name) || (nameMatch ? (contactSource="description", nameMatch[1].trim()) : "");
    let contactPhone = cleanPhone(jobData.Contact?.Phone) || (phoneMatch ? (contactSource="description", cleanPhone(phoneMatch[1])) : "");
    let contactEmail = stripHtml(jobData.Contact?.Email) || (emailMatch ? (contactSource="description", emailMatch[1].trim()) : "");

    if (!contactName && jobData.Site?.ID) {
        try {
            const scRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/sites/${jobData.Site.ID}/contacts/`);
            if (scRes.data && scRes.data.length > 0) {
                // Filter out internal-note entries: timestamps, asterisks, "DO NOT CALL", very long strings
                const isInternalNote = (name) => !name || name.length > 80
                    || /\d{1,2}:\d{2}\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(name)
                    || /^\*/.test(name.trim())
                    || /do not call/i.test(name);

                const validContacts = scRes.data
                    .map(c => {
                        const n = `${c.GivenName || ''} ${c.FamilyName || ''}`.trim();
                        const p = cleanPhone(c.Phone || c.Mobile || "");
                        return { name: n, phone: p };
                    })
                    .filter(c => c.name && !isInternalNote(c.name));

                if (validContacts.length > 0) {
                    // Join ALL valid contacts so every name and phone is visible
                    contactName = validContacts.map(c => c.name).join(' / ');
                    if (!contactPhone) contactPhone = validContacts.map(c => c.phone).filter(Boolean).join(' / ');
                    contactSource = "site_contacts";
                }
            }
        } catch (e) {}
    }

    // 3. Customer Info (Improved Individual Handling)
    let clientName = jobData.Customer?.CompanyName || jobData.Customer?.Name || "Client Not Found";
    if (jobData.Customer?.ID) {
        try {
            const custRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customers/${jobData.Customer.ID}`);
            const cust = custRes.data;
            if (cust.CompanyName) {
                clientName = cust.CompanyName;
            } else if (cust.GivenName || cust.FamilyName) {
                clientName = `${cust.GivenName || ''} ${cust.FamilyName || ''}`.trim();
            } else {
                clientName = cust.Name || clientName;
            }
        } catch (e) {}
    }

    // 4. Site-Wide Aggregation (Filtered by Customer to prevent cross-account confusion)
    const siteId = jobData.Site ? jobData.Site.ID : null;
    const customerId = jobData.Customer ? jobData.Customer.ID : null;
    const outstandingWorks = [];

    if (siteId) {
        try {
            let siteJobsUrl = `/api/v1.0/companies/${COMPANY_ID}/jobs/?Site.ID=${siteId}&pageSize=50`;
            if (customerId) siteJobsUrl += `&Customer.ID=${customerId}`;
            
            const jobsRes = await getSimpro(siteJobsUrl);
            if (jobsRes.data && jobsRes.data.length > 0) {
                // Optimize: Fetch all job details in parallel to speed up the report
                const jobDetails = await Promise.all(jobsRes.data.map(async (j) => {
                    try {
                        const detailRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${j.ID}`);
                        const dj = detailRes.data;
                        
                        // STRICT STATUS FILTER: Whitelist ONLY Pending and Progress
                        if (dj.Stage) {
                            const st = dj.Stage.toLowerCase();
                            if (!(st.includes('pending') || st.includes('progress'))) {
                                return null;
                            }
                        }
                        
                        // Use only Description — Notes is internal staff notes (e.g. "14:32 01/06/2026 Geffrey Go"), not scope of work
                        const rawDesc = (dj.Description || "");

                        // Fetch sections — used for Issue description fallback and Equipment Type
                        let sectionDesc = "";
                        let sectionCostCenterName = "";
                        let sectionCostCenterDesc = "";
                        let _sectionId = null;
                        let _costCenterId = null;
                        try {
                            const secRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${j.ID}/sections/`);
                            if (secRes.data?.[0]) {
                                _sectionId = secRes.data[0].ID;
                                sectionDesc = secRes.data[0].Description || "";
                                const ccRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${j.ID}/sections/${_sectionId}/costCenters/`);
                                if (ccRes.data?.[0]) {
                                    _costCenterId = ccRes.data[0].ID;
                                    sectionCostCenterName = ccRes.data[0].Name || ccRes.data[0].CostCenter?.Name || "";
                                    sectionCostCenterDesc = ccRes.data[0].Description || ccRes.data[0].CostCenter?.Description || "";
                                }
                            }
                        } catch (e) {}

                        // Filter out scheduling-label names/descriptions like "JUNE WEEK 4"
                        const schedulingLabelRe = /^(JAN|FEB|MAR|APR|MAY|JUN|JUNE|JUL|JULY|AUG|SEP|OCT|NOV|DEC)\s+WEEK\s+\d+/i;
                        const isSchedulingContent = (text) => !!text && schedulingLabelRe.test(text.trim()) && !text.includes('\n');
                        const isSchedulingName = dj.Name && schedulingLabelRe.test(dj.Name.trim());
                        // Returns true when the ENTIRE text is a bare service-type label (single line)
                        const isServiceLabelText = (text) => !!text && /^(weekly|monthly|annual|bi-?annual|quarterly|daily)\s+(service|maintenance|inspection|test|check)\s*$/i.test(text.trim());
                        // Returns true when text has NO real content — every line is a known boilerplate pattern
                        const boilerplateLinePatterns = [
                            /^(weekly|monthly|annual|bi-?annual|quarterly|daily)\s+(service|maintenance|inspection|test|check)/i,
                            /^techs attending/i, /^attendance confirmed by/i,
                            /^name:\s*$/i, /^phone/i, /^email:\s*$/i,
                            /^site contacts?:\s*$/i, /^contact:\s*$/i,
                            /^scheduled\s+(time|date):\s*$/i, /^osa name:\s*$/i,
                            /^access instructions/i, /^parking instructions/i,
                            /^materials.*:\s*$/i, /^scope:\s*$/i, /^signage:\s*$/i,
                            /^deliverables:\s*$/i, /^redmen fire protection scope of works/i,
                            /^(qualified\s+)?technician[s\/]*\s+to attend site/i,
                            /^\d{1,2}:\d{2}\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/,
                            /^[•\-\*]+\s*$/, /^\d+\s*x\s+/i,
                        ];
                        const isAllBoilerplate = (text) => {
                            if (!text) return true;
                            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                            return lines.length === 0 || lines.every(l => boilerplateLinePatterns.some(re => re.test(l)));
                        };
                        const cleanedRawDesc = cleanDescriptionForClient(rawDesc);
                        const cleanedSectionDesc = cleanDescriptionForClient(sectionDesc);
                        const cleanedCostCenterDesc = cleanDescriptionForClient(sectionCostCenterDesc);
                        const notesDesc = cleanDescriptionForClient(dj.Notes || "");
                        const staffDesc = fullDescriptionForStaff(rawDesc);
                        // Build primary description — skip entries that are entirely boilerplate
                        const primaryDesc = (!isSchedulingContent(cleanedRawDesc) && !isAllBoilerplate(cleanedRawDesc) ? cleanedRawDesc : null)
                            || (!isSchedulingContent(cleanedSectionDesc) && !isAllBoilerplate(cleanedSectionDesc) ? cleanedSectionDesc : null)
                            || (!isSchedulingContent(cleanedCostCenterDesc) && !isAllBoilerplate(cleanedCostCenterDesc) ? cleanedCostCenterDesc : null)
                            || (!isAllBoilerplate(staffDesc) ? staffDesc : null);

                        // Option B: if still no real description, fetch section line items as last resort
                        let lineItemsDesc = null;
                        if ((!primaryDesc || isAllBoilerplate(primaryDesc)) && !notesDesc && _sectionId && _costCenterId) {
                            try {
                                const itemsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${j.ID}/sections/${_sectionId}/costCenters/${_costCenterId}/items/?columns=ID,Name,Description`);
                                if (itemsRes.data && itemsRes.data.length > 0) {
                                    const tasks = itemsRes.data
                                        .map(item => (item.Description || item.Name || "").trim())
                                        .filter(n => n && !/^\d+$/.test(n) && n.length > 2)
                                        .slice(0, 6);
                                    if (tasks.length > 0) lineItemsDesc = tasks.join('\n');
                                }
                            } catch (e) {}
                        }

                        const combinedParts = [primaryDesc, lineItemsDesc, notesDesc].filter(Boolean);
                        const isServiceLabel = isServiceLabelText((dj.Name || "").trim());
                        const descFormatted = (combinedParts.length > 0 ? combinedParts.join('\n') : null)
                            || (!isSchedulingName && !isServiceLabel && dj.Name && !/^\d+$/.test(dj.Name) && dj.Name.trim().includes(' ') ? dj.Name : null)
                            || "Qualified technician to attend site to carry out the following works:";

                        // Determine a professional [STATUS] for the client POV
                        let displayStatus = 'PENDING';
                        if (dj.Stage) {
                            const stage = dj.Stage.toLowerCase();
                            if (stage.includes('progress')) displayStatus = 'IN PROGRESS';
                            if (stage.includes('complete')) displayStatus = 'COMPLETED';
                        }
                        if (rawDesc.toLowerCase().includes('scheduled for')) displayStatus = 'SCHEDULED';


                        let sq = dj.Quote ? dj.Quote.ID : "";

                        // Equipment Type — reuse already-fetched section data
                        let rawEq = (dj.Service?.Name || dj.Name || "").trim();
                        let eqType = /^\d+$/.test(rawEq) ? "" : rawEq;

                        if (!eqType || eqType.toLowerCase().includes("general")) {
                            if (sectionCostCenterName) {
                                eqType = sectionCostCenterName.replace(/\s*(?:Division|Sales|Income|Division Income|Center)\s*$/i, "").trim();
                            }
                        }
                        if (!eqType) eqType = rawEq || "Service Job";

                        // Matches (simplified for speed)
                        const darnMatch = (dj.Description || "").match(/DARN\W*(?:form|no|number|#|id)*\W*([A-Z0-9-]*\d+[A-Z0-9-]*)/i);
                        const quoteMatch = (dj.Description || "").match(/Quote\W*(?:form|no|number|#|id)*\W*([A-Z0-9-]*\d+[A-Z0-9-]*)/i);

                        return {
                            Date: dj.DateIssued ? new Date(dj.DateIssued).toLocaleDateString('en-AU') : "",
                            EquipmentType: eqType,
                            Issue: descFormatted,
                            DisplayStatus: displayStatus,
                            Lead: dj.Lead ? `#${dj.Lead.ID}` : "",
                            DARN: darnMatch ? darnMatch[1] : "", 
                            Quote: dj.Quote ? `#${dj.Quote.ID}` : (quoteMatch ? `#${quoteMatch[1]}` : ""), 
                            Job: j.ID ? `#${j.ID}` : "", 
                            Comment: "",
                            Status: displayStatus
                        };
                    } catch (e) { return null; }
                }));
                
                outstandingWorks.push(...jobDetails.filter(Boolean));
            }

            // Sort by Status Hierarchy: 1. IN PROGRESS, 2. PENDING
            outstandingWorks.sort((a, b) => {
                const getPriority = (status) => {
                    const s = (status || "").toLowerCase();
                    if (s === 'in progress') return 1;
                    if (s === 'pending') return 2;
                    return 3;
                };
                
                const pA = getPriority(a.Status);
                const pB = getPriority(b.Status);
                
                if (pA !== pB) return pA - pB;
                
                // Secondary sort: Newest Job/Quote ID first
                const idA = parseInt((a.Job || a.Quote || "0").replace(/\D/g, ''));
                const idB = parseInt((b.Job || b.Quote || "0").replace(/\D/g, ''));
                return idB - idA;
            });
        } catch (err) {
            console.error(`Aggregation error: ${err.message}`);
        }
    }

    // --- Dynamic Asset Date Discovery (Improved for Portfolio Accuracy) ---
    let liveSixMo = { Month: "", Year: "", rawDate: null, Source: "—" };
    let liveTwelveMo = { Month: "", Year: "", rawDate: null, Source: "—" };

    if (siteId) {
        try {
            const custAssetsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customerAssets/?Site.ID=${siteId}&pageSize=100`);
            
            if (custAssetsRes.data && custAssetsRes.data.length > 0) {
                for (const asset of custAssetsRes.data) {
                    if (!asset.ServiceLevels) continue;
                    
                    for (const sl of asset.ServiceLevels) {
                        const dateStr = sl.ServiceDate || sl.NextDate || "";
                        if (!dateStr) continue;
                        
                        const slName = (sl.Name || "").toLowerCase();
                        const slDate = new Date(dateStr);
                        if (isNaN(slDate.getTime())) continue;

                        const isAnnual = slName.includes("annual") || slName.includes("12 month") || slName.includes("yearly") || slName.includes("12month");
                        const is6Mo = slName.includes("6 month") || slName.includes("6month") || slName.includes("bi-annual") || slName.includes("half year") || slName.includes("semi-annual");
                        
                        if (isAnnual) {
                            if (!liveTwelveMo.rawDate || slDate < liveTwelveMo.rawDate) {
                                liveTwelveMo.rawDate = slDate;
                                liveTwelveMo.Month = slDate.toLocaleString('default', { month: 'long' });
                                liveTwelveMo.Year = slDate.getFullYear().toString();
                                liveTwelveMo.Source = "Live Asset";
                            }
                        } else if (is6Mo) {
                            if (!liveSixMo.rawDate || slDate < liveSixMo.rawDate) {
                                liveSixMo.rawDate = slDate;
                                liveSixMo.Month = slDate.toLocaleString('default', { month: 'long' });
                                liveSixMo.Year = slDate.getFullYear().toString();
                                liveSixMo.Source = "Live Asset";
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[ASSET DISCOVERY ERROR] Site #${siteId}: ${e.message}`);
        }
    }

    // FALLBACK: If live dates are still empty, use the current Job's date as a reference
    const jobType = (jobData.Name || "").toLowerCase().includes('12 monthly') ? "12 Monthly" : "6 Monthly";
    const jobRefDate = jobData.DateIssued ? new Date(jobData.DateIssued) : new Date();
    
    if (!liveSixMo.Month) {
        liveSixMo.Month = "—";
        liveSixMo.Year = "—";
        liveSixMo.Source = "Not found in assets";
    }
    if (!liveTwelveMo.Month) {
        liveTwelveMo.Month = "—";
        liveTwelveMo.Year = "—";
        liveTwelveMo.Source = "Not found in assets";
    }

    const result = {
        JobID: parseInt(jobId), 
        Site: siteName,
        SiteArea: siteArea,
        SiteContact: { Name: contactName || clientName, Phone: contactPhone, Email: contactEmail, Source: contactSource },
        Client: clientName, 
        DateCompleted: new Date().toLocaleDateString('en-AU'),
        DateCallMade: jobData.DateIssued ? new Date(jobData.DateIssued).toLocaleDateString('en-AU') : "Not Issued",
        AFSSDue: afssFromNotes || "No AFSS Due",
        ServiceDue: {
            Type: jobType,
            Month: jobRefDate.toLocaleString('default', { month: 'long' }),
            Year: jobRefDate.getFullYear(),
            LiveSixMo: liveSixMo,
            LiveTwelveMo: liveTwelveMo
        },
        OutstandingWorks: outstandingWorks,
        SiteID: siteId
    };

    // 5. Initiate Background Asset Sync (Do not await, keep it fast for the user)
    if (jobData.DateIssued && siteId) {
        syncAssetDates(siteId, jobData.DateIssued, jobType).catch(e => console.error("AutoSync catch:", e));
    }

    return result;
};

/**
 * MCP Tool: get_fpow_data
 */
mcp.addTool({
    name: "get_fpow_data",
    description: "Fetch and aggregate FPOW data for a job ID, including site-wide outstanding works.",
    parameters: z.object({
        jobId: z.number().describe("The simPRO Job ID to retrieve data for")
    }),
    execute: async (args) => {
        return fetchFpowData(args.jobId);
    }
});

// Express App for UI and legacy API
const hApp = express();
hApp.set('trust proxy', 1);
hApp.use(helmet({ contentSecurityPolicy: false }));
hApp.use(express.json({ limit: '10mb' }));
hApp.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
    if (req.path.startsWith('/auth/') ||
        req.path === '/health' ||
        req.path === '/api/ping' ||
        req.path === '/api/trigger-manager-report') return next();
    if (req.session?.user) return next();
    res.redirect('/auth/login');
}
hApp.use(requireAuth);

// Auth: Initiate Google login
hApp.get('/auth/login', (req, res) => {
    const url = googleOAuth.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account'
    });
    res.redirect(url);
});

// Auth: Google OAuth callback
hApp.get('/auth/callback', async (req, res) => {
    try {
        const { tokens } = await googleOAuth.getToken(req.query.code);
        const ticket = await googleOAuth.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
        const { email, name, picture } = ticket.getPayload();
        if (!email.endsWith('@redadair.com.au')) {
            req.session.rejected = email;
            return res.redirect('/auth/rejected');
        }
        req.session.user = { email, name, picture };
        res.redirect('/');
    } catch (err) {
        console.error('[AUTH] Callback error:', err.message);
        res.redirect('/auth/login');
    }
});

// Auth: Rejected page
hApp.get('/auth/rejected', (req, res) => {
    const email = req.session.rejected || 'your account';
    req.session.destroy(() => {});
    res.status(403).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Access Denied – FPOWS</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:white;border-radius:12px;padding:48px 40px;max-width:460px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1)}.logo{font-size:2rem;font-weight:900;letter-spacing:-1px;margin-bottom:8px}.logo span{color:#c0392b}h1{font-size:1.1rem;color:#c0392b;margin-bottom:24px;font-weight:700}p{color:#555;line-height:1.6;margin-bottom:12px}.email{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 16px;color:#991b1b;font-size:0.9rem;margin:16px 0 24px;word-break:break-all}a{display:inline-block;background:#c0392b;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.95rem}a:hover{background:#a93226}</style>
</head><body><div class="card">
<div class="logo"><span>F</span>POWS</div>
<h1>Access Denied</h1>
<p>This system is restricted to <strong>Redadair</strong> staff only.</p>
<div class="email">${email}</div>
<p>You must sign in with a <strong>@redadair.com.au</strong> Google account.</p><br>
<a href="/auth/login">Sign in with a different account</a>
</div></body></html>`);
});

// Auth: Logout
hApp.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/auth/login'));
});

const searchLimiter = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });
const emailLimiter  = rateLimit({ windowMs: 60_000, max: 10,  standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 60_000, max: 30,  standardHeaders: true, legacyHeaders: false });

function requireApiKey(req, res, next) {
    if (!ADMIN_API_KEY) return next();
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// Serve index.html with injected client key — must be registered before express.static
hApp.get('/', (req, res) => {
    try {
        let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
        if (ADMIN_API_KEY) {
            html = html.replace('<head>', `<head>\n<script>window.FPOWS_KEY=${JSON.stringify(ADMIN_API_KEY)};window.FPOWS_USER=${JSON.stringify(req.session?.user || null)};</script>`);
        }
        res.send(html);
    } catch (e) {
        res.status(500).send('Failed to load UI');
    }
});

hApp.use(express.static(__dirname));

hApp.get('/version.txt', (req, res) => {
    try {
        const v = fs.readFileSync(path.join(__dirname, 'version.txt'), 'utf-8');
        res.send(v);
    } catch (e) { res.status(404).send("Version file not found"); }
});

// Legacy API Proxy
hApp.get('/api/job/:id', async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isInteger(jobId) || jobId <= 0 || jobId > 9_999_999) {
        return res.status(400).json({ error: 'Invalid job ID' });
    }
    try {
        const result = await fetchFpowData(jobId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Schedules endpoint
hApp.get('/api/schedules/today', async (req, res) => {
    console.log(`[GET] /api/schedules/today`);
    try {
        const jobsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/?pageSize=50&columns=ID,Name,Customer,DateIssued`);
        const schedules = jobsRes.data.map(job => ({
            jobId: job.ID,
            client: job.Customer?.CompanyName || job.Name || "simPRO Record",
            site: "simPRO Site", 
            time: job.DateIssued ? new Date(job.DateIssued).toLocaleDateString('en-AU') : "Live Record"
        }));
        res.json({ date: new Date().toISOString().split('T')[0], schedules });
    } catch (err) {
        res.json({ date: "Offline", schedules: [] });
    }
});

let activeCustomersCache = null;
let activeCustomersCacheTime = 0;

// Customer Search endpoint
hApp.get('/api/customers/search', searchLimiter, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length > 0 && q.length < 2) return res.json({ results: [] });
    console.log(`[GET] /api/customers/search?q=${q}`);
    try {
        // Cache valid for 60 seconds. force=1 always bypasses it (e.g. on modal open)
        if (!activeCustomersCache || (Date.now() - activeCustomersCacheTime) > 60000 || req.query.force === '1') {
            // 1. Fetch ALL active jobs to populate customers (Fully Live Portfolio)
            const jobsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/?Stage=Pending&Stage=Progress&pageSize=250&columns=ID,Name,Customer,Site,Status,DateIssued,DateModified,Tags`);
            const siteMap = new Map();

            // Build unique map of customers
            const uniqueMap = new Map();
            const OVERDUE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            jobsRes.data.forEach(job => {
                if (job.Customer && job.Customer.ID) {
                    const cId = job.Customer.ID;
                    const modDate = job.DateModified ? new Date(job.DateModified).getTime() : 0;
                    
                    if (!uniqueMap.has(cId)) {
                        const isOverdue = modDate > 0 ? (now - modDate) > OVERDUE_THRESHOLD_MS : false;
                        uniqueMap.set(cId, {
                            id: cId,
                            name: job.Customer.CompanyName || `${job.Customer.GivenName || ''} ${job.Customer.FamilyName || ''}`.trim() || 'Unnamed',
                            type: job.Customer.CompanyName ? 'Company' : 'Individual',
                            priority: false,
                            overdue: isOverdue,
                            postcode: 'N/A',
                            latestActivity: modDate,
                            latestJobId: job.ID,
                            latestSite: job.Site?.Name || 'Unknown'
                        });
                    } else {
                        // If we already have this customer, check if this job is newer
                        const curr = uniqueMap.get(cId);
                        if (modDate > curr.latestActivity) {
                            curr.latestActivity = modDate;
                            curr.latestJobId = job.ID;
                            curr.latestSite = job.Site?.Name || 'Unknown';
                            const OVERDUE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
                            curr.overdue = (now - modDate) > OVERDUE_THRESHOLD_MS;
                        }
                    }
                }
            });
            let customersArray = Array.from(uniqueMap.values());
            
            // Sort the raw array by activity before processing tags
            customersArray.sort((a, b) => b.latestActivity - a.latestActivity);

            const getTagNames = (tags) => {
                if (!Array.isArray(tags) || tags.length === 0) return null;
                const names = tags.map(t => {
                    if (typeof t === 'string') return t;
                    if (t.Name) return t.Name;
                    if (t.ID) return `Tag ID: ${t.ID}`;
                    return 'Tagged';
                }).filter(Boolean);
                return names.length > 0 ? names : null;
            };
            
            // Process all customers in small throttled batches to prevent 429 Too Many Requests errors
            const batchSize = 3;
            for (let i = 0; i < customersArray.length; i += batchSize) {
                const batch = customersArray.slice(i, i + batchSize);
                await Promise.allSettled(batch.map(async (c) => {
                    if (c.priority) return; 
                    try {
                        let finalTags = null;
                        
                        // Try to fetch Customer Profile Tags and Address directly via standard endpoint
                        const routeType = c.type === 'Company' ? 'companies' : 'individuals';
                        const custRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customers/${routeType}/${c.id}?columns=ID,Tags,Address`);
                        
                        // Handle Tags
                        if (custRes.data && custRes.data.Tags && getTagNames(custRes.data.Tags)) {
                            const allTags = getTagNames(custRes.data.Tags);
                            // Strictly filter down to only tags containing "testing" (which catches both TESTING and NON TESTING)
                            const testingTags = allTags.filter(t => t.toLowerCase().includes('testing'));
                            
                            if (testingTags.length > 0) {
                                finalTags = testingTags;
                            }
                        }

                        // Handle Address/Postcode
                        if (custRes.data && custRes.data.Address && custRes.data.Address.PostalCode) {
                            c.postcode = custRes.data.Address.PostalCode;
                        }

                        if (finalTags) {
                            c.priority = true;
                            c.priorityTags = finalTags;
                        }
                    } catch (e) {
                        // Ignore lookup errors silently
                    }
                }));
                // artificial delay to ensure we do not hit simPRO rate limits
                await new Promise(r => setTimeout(r, 300));
            }
            
            activeCustomersCache = customersArray;
            activeCustomersCacheTime = Date.now();
        }
        
        // 3. Perform Case-Insensitive Name & Postcode Search
        let filtered = activeCustomersCache;
        if (q.length >= 2) {
            const lowerQ = q.toLowerCase();
            filtered = activeCustomersCache.filter(c => 
                c.name.toLowerCase().includes(lowerQ) || 
                (c.postcode && c.postcode.toLowerCase().includes(lowerQ))
            );

            // FALLBACK: If we have few results, query simPRO directly for this name OR site
            if (filtered.length < 10) {
                try {
                    // 1. Search Customers (Standard fuzzy search)
                    const liveRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customers/?Search=${encodeURIComponent(q)}&pageSize=20`);
                    
                    // 2. Search Sites (High Precision wildcard search)
                    const siteRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/sites/?Name=%25${encodeURIComponent(q)}%25&pageSize=50`);

                    const liveCustomers = []; // Customers found via site get top priority
                    const fuzzyCustomers = liveRes.data || [];
                    
                    // Process matching sites and fetch their customers
                    if (siteRes.data && siteRes.data.length > 0) {
                        for (const sMatch of siteRes.data) {
                            try {
                                const siteDetailRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/sites/${sMatch.ID}`);
                                const site = siteDetailRes.data;
                                
                                let custId = site.Customer?.ID;
                                let custType = site.Customer?.Type;
                                
                                if (!custId && site.Customers && site.Customers.length > 0) {
                                    custId = site.Customers[0].ID;
                                    custType = site.Customers[0].Type;
                                }

                                if (custId) {
                                    if (!liveCustomers.find(c => String(c.ID) === String(custId))) {
                                        const typePath = (custType || 'Company').toLowerCase() === 'individual' ? 'individuals' : 'companies';
                                        const custDetail = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/customers/${typePath}/${custId}`);
                                        if (custDetail.data) {
                                            custDetail.data._foundViaSite = true;
                                            liveCustomers.push(custDetail.data);
                                        }
                                    }
                                }
                            } catch (detailErr) {
                                console.error(`[SEARCH DEBUG ERROR] Failed site-customer resolution #${sMatch.ID}: ${detailErr.message}`);
                            }
                        }
                    }

                    // 3. Process All Found (Site Matches + Fuzzy Matches)
                    const liveResults = [];
                    
                    // Priority: Site Matches
                    for (const lc of liveCustomers) {
                        const isCompany = !!(lc.CompanyName || (lc.Name && !lc.GivenName));
                        const cName = lc.CompanyName || lc.Name || `${lc.GivenName || ''} ${lc.FamilyName || ''}`.trim();
                        liveResults.push({
                            id: lc.ID,
                            name: cName,
                            type: isCompany ? 'Company' : 'Individual',
                            priority: true,
                            overdue: false,
                            postcode: lc.Address?.PostalCode || 'N/A',
                            latestActivity: 0,
                            isLiveFallback: true,
                            foundViaSite: true
                        });
                    }
                    
                    // Fuzzy Matches
                    for (const lc of fuzzyCustomers) {
                        if (!liveResults.find(r => String(r.id) === String(lc.ID))) {
                            const isCompany = !!(lc.CompanyName || (lc.Name && !lc.GivenName));
                            const cName = lc.CompanyName || lc.Name || `${lc.GivenName || ''} ${lc.FamilyName || ''}`.trim();
                            liveResults.push({
                                id: lc.ID,
                                name: cName,
                                type: isCompany ? 'Company' : 'Individual',
                                priority: false,
                                overdue: false,
                                postcode: lc.Address?.PostalCode || 'N/A',
                                latestActivity: 0,
                                isLiveFallback: true
                            });
                        }
                    }

                    // Merge liveResults into filtered (Live results get priority)
                    const finalMerged = [...liveResults];
                    for (const f of filtered) {
                        if (!finalMerged.find(r => String(r.id) === String(f.id))) {
                            finalMerged.push(f);
                        }
                    }
                    filtered = finalMerged;
                } catch (e) {
                    console.error(`[SEARCH FALLBACK ERROR] ${e.message}`);
                }
            }
        }

        // 4. Arrange: Ensure only a max of 10 clients are prioritized
        let majorCount = 0;
        const results = filtered.map(c => {
            if (c.priority) {
                if (majorCount < 10) {
                    majorCount++;
                    return c;
                } else {
                    return { ...c, priority: false, priorityTags: null };
                }
            }
            return c;
        }).slice(0, 50);
        res.json({ results, cacheTime: activeCustomersCacheTime });
    } catch (err) {
        console.error(`[CUSTOMER SEARCH ERROR] ${err.message}`);
        res.json({ results: [], error: err.message });
    }
});

// Customer Jobs endpoint (get jobs for a specific customer)
hApp.get('/api/customers/:id/jobs', async (req, res) => {
    const custId = req.params.id;
    console.log(`[GET] /api/customers/${custId}/jobs`);
    try {
        const jobsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/?Customer.ID=${custId}&pageSize=30&orderby=-ID&columns=ID,Name,Site,Stage,DateIssued`);
        
        const validStages = ['Pending', 'Progress', 'Completed', 'Invoiced'];
        const jobs = (jobsRes.data || [])
            .filter(j => validStages.includes(j.Stage))
            .map(j => ({
                id: j.ID,
                name: j.Name || `Job #${j.ID}`,
                site: j.Site?.Name || 'Unknown Site',
                stage: j.Stage === 'Progress' ? 'In Progress' : (j.Stage || 'Unknown'),
                date: j.DateIssued ? new Date(j.DateIssued).toLocaleDateString('en-AU') : '—',
                rawDate: j.DateIssued || '0'
            }))
            .sort((a, b) => {
                const getScore = (s) => {
                    const sl = (s || '').toLowerCase();
                    if (sl.includes('progress')) return 1;
                    if (sl.includes('pending')) return 2;
                    if (sl.includes('completed')) return 3;
                    if (sl.includes('invoiced')) return 4;
                    return 5;
                };
                const scoreA = getScore(a.stage);
                const scoreB = getScore(b.stage);
                if (scoreA !== scoreB) return scoreA - scoreB;
                return parseInt(b.id) - parseInt(a.id);
            });
            
        res.json({ jobs });
    } catch (err) {
        console.error(`[CUSTOMER JOBS ERROR] ${err.message}`);
        res.json({ jobs: [], error: err.message });
    }
});

// Email endpoint
hApp.post('/api/send-email', emailLimiter, async (req, res) => {
    try {
        const { jobId, recipientEmail, managerEmail, htmlContent, subject, clientName } = req.body;
        const payloadSize = JSON.stringify(req.body).length;
        console.log(`[POST] /api/send-email - Payload: ${Math.round(payloadSize/1024)}KB`);
        console.log(`[EMAIL] Job #${jobId} -> To: ${recipientEmail}, CC: ${managerEmail || MANAGER_EMAIL}`);

        const transporter = getTransporter();
        if (!transporter) {
            console.error('[SMTP ERROR] Transporter not initialized. Check SMTP_USER/PASS.');
            return res.status(500).json({ error: 'Email delivery not configured. Check server logs.' });
        }

        if (!recipientEmail && !managerEmail && !MANAGER_EMAIL) {
            console.warn('[EMAIL WARN] No recipient email addresses provided or found in env.');
            return res.status(400).json({ error: 'No recipient email addresses provided.' });
        }

        const recipients = [recipientEmail, (managerEmail && managerEmail.trim()) || MANAGER_EMAIL].filter(Boolean).join(',');

        // Check logo exists before attaching
        const logoPath = path.join(__dirname, 'logo.png');
        const attachments = [];
        if (fs.existsSync(logoPath)) {
            attachments.push({ filename: 'logo.png', path: logoPath, cid: 'redmen-logo' });
        } else {
            console.warn('[EMAIL] logo.png not found, sending without logo attachment.');
        }

        const mailOptions = {
            from: `"FPOWS Automation" <${SMTP_USER}>`,
            to: recipients,
            subject: subject || `FPOWS Call Sheet - Job #${jobId} - ${clientName || 'Unknown Client'}`,
            html: htmlContent,
            attachments
        };

        await sendMailWithRetry(transporter, mailOptions, 1);
        
        // Structured Log Entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: "EMAIL_SUCCESS",
            jobId,
            client: clientName || "Unknown Client",
            clientEmail: recipientEmail || "—",
            managerEmail: (managerEmail && managerEmail.trim()) || MANAGER_EMAIL || "—",
            subject: mailOptions.subject,
            siteId: req.body.siteId || "",
            siteName: req.body.siteName || ""
        };
        
        console.log(`[EMAIL SUCCESS] Job #${jobId} -> ${recipients}`);
        const logPath = path.join(__dirname, 'email_history.jsonl');
        await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + "\n");
        
        res.json({ success: true, sentTo: recipients });
    } catch (err) {
        console.error(`[EMAIL ERROR] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Logs endpoint for manager
hApp.get('/api/logs', adminLimiter, requireApiKey, async (req, res) => {
    try {
        const logPath = path.join(__dirname, 'email_history.jsonl');
        let raw;
        try { raw = await fs.promises.readFile(logPath, 'utf8'); } catch { return res.json({ logs: [] }); }
        const lines = raw.trim().split('\n').filter(Boolean);
        const logs = lines.map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean).reverse().slice(0, 50);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete history endpoint
hApp.post('/api/delete-history', adminLimiter, requireApiKey, async (req, res) => {
    try {
        const { timestamp } = req.body;
        if (!timestamp || typeof timestamp !== 'string') return res.status(400).json({ error: 'Timestamp is required' });

        const historyPath = path.join(__dirname, 'email_history.jsonl');
        let raw;
        try { raw = await fs.promises.readFile(historyPath, 'utf8'); } catch { return res.json({ success: true }); }

        const updatedLines = raw.split('\n').filter(line => {
            if (!line.trim()) return false;
            try { return JSON.parse(line).timestamp !== timestamp; } catch { return true; }
        });

        await fs.promises.writeFile(historyPath, updatedLines.join('\n') + (updatedLines.length > 0 ? '\n' : ''));
        res.json({ success: true });
    } catch (err) {
        console.error("Delete history error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- Diagnostic Ping ---
// Latest job endpoint — returns the most recently modified active job
hApp.get('/api/latest-job', async (req, res) => {
    try {
        const category = req.query.category; // 'major' or 'regular'
        const customer = req.query.customer;

        if (category && activeCustomersCache) {
            const isMajor = category === 'major';

            // Use cache insertion order (already sorted by latestActivity desc at build time)
            // Apply same 10-major cap as the search modal display
            let majorCount = 0;
            const displayList = activeCustomersCache.map(c => {
                if (c.priority) {
                    if (majorCount < 10) { majorCount++; return c; }
                    return { ...c, priority: false };
                }
                return c;
            });

            // Top customer in the category = first in display list (most recently active)
            const topCustomer = displayList.find(c => isMajor ? c.priority : !c.priority);
            if (!topCustomer || !topCustomer.latestJobId) return res.json({ jobId: null });

            // Job ID and site are stored directly in cache — no re-scan needed
            return res.json({
                jobId: topCustomer.latestJobId,
                client: topCustomer.name,
                site: topCustomer.latestSite || 'Unknown',
                modified: topCustomer.latestActivity ? new Date(topCustomer.latestActivity).toISOString() : null
            });
        }

        const customerFilter = customer ? `&Customer.CompanyName=${encodeURIComponent(customer)}` : '';
        const jobsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/?Stage=Pending&Stage=Progress&pageSize=1&orderby=-DateModified&columns=ID,Name,Customer,Site,DateModified${customerFilter}`);
        const job = jobsRes.data?.[0];
        if (!job) return res.json({ jobId: null, message: 'No active jobs found' });
        res.json({
            jobId: job.ID,
            client: job.Customer?.CompanyName || job.Customer?.Name || 'Unknown',
            site: job.Site?.Name || 'Unknown',
            modified: job.DateModified || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

hApp.get('/api/debug-cache', (req, res) => {
    if (!activeCustomersCache) return res.json({ error: 'Cache not built yet — open Search Customers first' });
    const top20 = activeCustomersCache.slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        priority: c.priority,
        latestJobId: c.latestJobId,
        latestSite: c.latestSite,
        latestActivity: c.latestActivity ? new Date(c.latestActivity).toISOString() : null
    }));
    res.json({ total: activeCustomersCache.length, top20 });
});

hApp.get('/api/ping', (req, res) => {
    console.log('[PING] Route hit successfully');
    res.json({ ok: true, time: new Date().toISOString() });
});

// --- Health Check (used by Cloud Run probe) ---
hApp.get('/health', (req, res) => {
    const ok = !!(SIMPRO_BASE_URL && SIMPRO_ACCESS_TOKEN && SMTP_USER && SMTP_PASS);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', time: new Date().toISOString() });
});

// --- Manual Trigger for Portfolio Report ---
hApp.get('/api/trigger-manager-report', adminLimiter, requireApiKey, async (req, res) => {
    console.log('[MANUAL] Triggering expanded portfolio report...');
    try {
        await sendManagerDailyReport(true);
        console.log('[MANUAL] Report generation completed.');
        res.json({ success: true, message: 'Report generation completed.' });
    } catch (err) {
        console.error('[MANUAL] Report generation failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- Live Presence Tracking ---
// In-memory store: Map<jobId, Map<userName, { lastSeen: timestamp, color: string }>>
const presenceMap = new Map();
const PRESENCE_TIMEOUT_MS = 15000; // 15 seconds without heartbeat = gone

// Cleanup stale viewers
function cleanPresence() {
    const now = Date.now();
    for (const [jobId, viewers] of presenceMap) {
        for (const [name, info] of viewers) {
            if (now - info.lastSeen > PRESENCE_TIMEOUT_MS) {
                viewers.delete(name);
            }
        }
        if (viewers.size === 0) presenceMap.delete(jobId);
    }
}
setInterval(cleanPresence, 5000);

// Heartbeat: "I am viewing this job"
hApp.post('/api/presence/heartbeat', (req, res) => {
    const { jobId, userName } = req.body;
    if (!jobId || !userName) return res.status(400).json({ error: 'Missing jobId or userName' });
    
    if (!presenceMap.has(String(jobId))) presenceMap.set(String(jobId), new Map());
    const viewers = presenceMap.get(String(jobId));
    
    // Assign a consistent color based on name hash
    const colors = ['#e63946','#2a9d8f','#e9c46a','#264653','#f4a261','#6a4c93','#1982c4','#8ac926'];
    let hash = 0;
    for (let i = 0; i < userName.length; i++) hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    const color = colors[Math.abs(hash) % colors.length];
    
    viewers.set(userName, { lastSeen: Date.now(), color });
    res.json({ ok: true });
});

// Leave: "I stopped viewing this job"
hApp.post('/api/presence/leave', (req, res) => {
    const { jobId, userName } = req.body || {};
    if (jobId && userName && presenceMap.has(String(jobId))) {
        presenceMap.get(String(jobId)).delete(userName);
    }
    res.json({ ok: true });
});

// Get viewers for a job
hApp.get('/api/presence/:jobId', (req, res) => {
    cleanPresence();
    const viewers = presenceMap.get(req.params.jobId);
    if (!viewers || viewers.size === 0) return res.json({ viewers: [] });
    
    const list = [];
    for (const [name, info] of viewers) {
        list.push({ name, color: info.color });
    }
    res.json({ viewers: list });
});

// --- Daily Manager Reporting ---
export async function sendManagerDailyReport(bypassCheck = false) {
    console.log("[CRON] Generating Daily Live Portfolio Summary Report for Manager...");
    const logPath = path.join(__dirname, 'email_history.jsonl');
    const statusPath = path.join(__dirname, 'last_daily_report.txt');
    const now = new Date();

    let rawLog;
    try { rawLog = await fs.promises.readFile(logPath, 'utf8'); } catch {
        console.log("[CRON] No history found. Skipping report.");
        return;
    }

    try {
        const raw = rawLog.trim();
        if (!raw) {
            console.log("[CRON] History file is empty.");
            return;
        }
        
        const lines = raw.split('\n').filter(Boolean);
        const logs = lines.map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
        }).filter(item => item !== null);

        // --- Expanded Discovery: Major & Regular Clients ---
        const discoveredSites = new Map();

        try {
            console.log("[CRON] Discovering Total Portfolio (Major & Regular Clients)...");
            console.log("[CRON] Discovering Total Portfolio via Global Site Scan...");
            
            // 1. Target ONLY sites with active (Pending/Progress) jobs as requested
            console.log("[CRON] Scanning for active Pending/Progress jobs...");
            const activeJobsRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/?Stage=Pending&Stage=Progress&pageSize=250&columns=ID,Site,Customer`);
            
            if (activeJobsRes.data) {
                console.log(`[CRON] Found ${activeJobsRes.data.length} active jobs across the portfolio.`);
                for (const j of activeJobsRes.data) {
                    if (j.Site?.ID && !discoveredSites.has(String(j.Site.ID))) {
                        discoveredSites.set(String(j.Site.ID), {
                            siteName: j.Site.Name || "Active Site",
                            representativeJobId: j.ID,
                            client: j.Customer?.CompanyName || j.Customer?.Name || "Individual Client"
                        });
                    }
                }
            }
            console.log(`[CRON] Discovery Complete: ${discoveredSites.size} unique sites have active work.`);

            // 2. Add sites from TODAY'S SCHEDULES (Safety catch)
            const todayStr = now.toISOString().split('T')[0];
            const schedulesRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/schedules/?Date=${todayStr}&pageSize=250`);
            if (schedulesRes.data) {
                for (const s of schedulesRes.data) {
                    if (s.Site?.ID && !discoveredSites.has(String(s.Site.ID))) {
                        let repJobId = s.Reference || null; 
                        if (repJobId) {
                            discoveredSites.set(String(s.Site.ID), {
                                siteName: s.Site.Name || "Scheduled Site",
                                representativeJobId: repJobId,
                                client: s.Customer?.Name || "Scheduled Client"
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error("[CRON] Discovery Error:", e.message);
        }

        // --- Merge with History Logs (Enhanced to catch logs with only jobId) ---
        for (const log of logs) {
            const sid = log.siteId ? String(log.siteId) : null;
            if (sid && !discoveredSites.has(sid)) {
                discoveredSites.set(sid, { 
                    siteName: log.siteName || "Unknown Site", 
                    representativeJobId: log.jobId, 
                    client: log.client 
                });
            } else if (!sid && log.jobId) {
                // FALLBACK: If log only has jobId, we need to fetch its site to include it
                try {
                    const jobRes = await getSimpro(`/api/v1.0/companies/${COMPANY_ID}/jobs/${log.jobId}?columns=Site,Customer`);
                    const j = jobRes.data;
                    if (j.Site?.ID && !discoveredSites.has(String(j.Site.ID))) {
                        discoveredSites.set(String(j.Site.ID), {
                            siteName: j.Site.Name || "Unknown Site",
                            representativeJobId: log.jobId,
                            client: j.Customer?.CompanyName || j.Customer?.Name || log.client
                        });
                        console.log(`[CRON] Recovered Site #${j.Site.ID} from Job #${log.jobId} in logs.`);
                    }
                } catch (e) {
                    console.warn(`[CRON] Could not recover site for Job #${log.jobId}: ${e.message}`);
                }
            }
        }

        if (discoveredSites.size === 0) {
            console.log("[CRON] No sites found in discovery or logs.");
            return; 
        }

        let reportRows = "";
        const processedSites = discoveredSites.size;
        console.log(`[CRON] Starting report generation for ${processedSites} unique sites...`);
        
        // Process each unique site with a LIVE FETCH as requested
        for (const [siteId, info] of discoveredSites.entries()) {
            try {
                console.log(`[CRON] Fetching live data for Site #${siteId} (via Job #${info.representativeJobId})...`);
                const liveData = await fetchFpowData(info.representativeJobId);
                const works = liveData.OutstandingWorks || [];
                
                let worksSummaryHtml = "";
                if (works.length > 0) {
                    worksSummaryHtml = `<table width="100%" style="border-collapse:collapse; font-size:11px; color:#444;">`;
                    works.forEach(w => {
                        const s = (w.DisplayStatus || 'PENDING').toUpperCase();
                        const statusStyle = s === 'PENDING' ? 'color:#92400E; font-weight:700;' : 'color:#0369A1; font-weight:700;';
                        // REMOVED TRUNCATION: Show full issue detail as requested
                        const fullIssue = (w.Issue || "").replace(/\n/g, '<br>');
                        worksSummaryHtml += `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:8px 0; width:70px; vertical-align:top;"><span style="${statusStyle}">#${w.Job || '—'}</span></td>
                                <td style="padding:8px 0; width:110px; text-transform:uppercase; font-size:9px; font-weight:600; vertical-align:top;">${w.EquipmentType || 'Works'}</td>
                                <td style="padding:8px 0; line-height:1.4;">${fullIssue}</td>
                            </tr>
                        `;
                    });
                    worksSummaryHtml += `</table>`;
                } else {
                    worksSummaryHtml = `<i style="color:#999;">No outstanding works found live.</i>`;
                }

                const sixMo = liveData.ServiceDue?.LiveSixMo?.Month || "—";
                const sixYear = liveData.ServiceDue?.LiveSixMo?.Year || "";
                const twelveMo = liveData.ServiceDue?.LiveTwelveMo?.Month || "—";
                const twelveYear = liveData.ServiceDue?.LiveTwelveMo?.Year || "";

                reportRows += `
                    <tr style="border-bottom: 2px solid #eee;">
                        <td style="padding: 15px; vertical-align: top; background: #fafafa; border-right: 1px solid #ddd; width: 260px;">
                            <div style="font-weight: 700; color: #1a1a1a; margin-bottom:4px; font-size: 14px;">${info.siteName}</div>
                            <div style="font-size: 11px; color: #666; margin-bottom: 8px;">Site ID: ${siteId}</div>
                            
                            <div style="margin-bottom: 12px; padding: 8px; background: #fff; border: 1px solid #eee; border-radius: 4px;">
                                <div style="font-size: 10px; text-transform: uppercase; color: #999; font-weight: bold; margin-bottom: 4px;">Live Service Dates</div>
                                <div style="font-size: 11px; margin-bottom: 2px;"><strong>6-Monthly:</strong> ${sixMo} ${sixYear}</div>
                                <div style="font-size: 11px;"><strong>12-Monthly:</strong> ${twelveMo} ${twelveYear}</div>
                            </div>

                            <div style="font-size: 11px; color: #cc2222;"><strong>Customer:</strong> ${info.client}</div>
                        </td>
                        <td style="padding: 15px; vertical-align: top;">
                            ${worksSummaryHtml}
                        </td>
                    </tr>
                `;
                
                await new Promise(r => setTimeout(r, 800)); // Respectful staggered fetching
            } catch (err) {
                console.error(`[CRON ERROR] Failed to fetch live summary for Site #${siteId}:`, err.message);
            }
        }

        const emailHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 950px; margin: auto; padding: 20px; color:#333; line-height: 1.5;">
                <h2 style="color: #cc2222; border-bottom: 4px solid #cc2222; padding-bottom: 12px; margin-bottom: 5px;">FPOWS Live Portfolio Status Report</h2>
                <div style="font-size: 12px; color: #666; margin-bottom: 25px;">Daily Summary for Management · ${now.toLocaleDateString('en-AU')}</div>
                
                <p>Hello Management, this report summarizes <strong>all outstanding jobs</strong> (Pending & In-Progress) fetched live from simPRO for every site in your customer portfolio.</p>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #ddd; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <thead>
                        <tr style="background: #2c2c2c; color: white; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;">
                            <th align="left" style="padding: 14px; width: 250px;">Site & Customer Information</th>
                            <th align="left" style="padding: 14px;">Summary of All Outstanding Findings (Live)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportRows || '<tr><td colspan="2" style="padding:40px; text-align:center; color:#999;">No site activity recorded with linkable Site IDs.</td></tr>'}
                    </tbody>
                </table>

                <div style="margin-top: 30px; padding: 20px; background: #fdf2f2; border-left: 5px solid #cc2222; border-radius: 4px; font-size: 12px;">
                    <strong>Technical Summary:</strong> This report is dynamically generated. If a job described here is updated in simPRO, the changes will reflect live in this summary.
                </div>
                
                <p style="text-align: center; font-size: 10px; color: #aaa; margin-top: 50px;">
                    REDMEN FPOWS Master Reporter v2.1 · Automated Dispatch
                </p>
            </div>
        `;

        const transporter = getTransporter();
        if (!transporter) {
            throw new Error('SMTP transporter not initialised — check SMTP_USER/SMTP_PASS env vars in Cloud Run.');
        }

        const recipients = [MANAGER_EMAIL].filter(Boolean).join(',');
        if (!recipients) {
            throw new Error('MANAGER_EMAIL env var is not set — no recipient for daily report.');
        }

        await transporter.sendMail({
            from: `"FPOWS Reporter" <${SMTP_USER}>`,
            to: recipients,
            subject: `[LIVE STATUS] FPOWS Daily Portfolio Summary - ${processedSites} Sites - ${now.toLocaleDateString('en-AU')}`,
            html: emailHtml
        });
        
        await fs.promises.writeFile(statusPath, now.toISOString());
        console.log(`[CRON] Daily Portfolio Report sent to ${recipients}.`);
    } catch (err) {
        console.error(`[CRON ERROR] ${err.message}`);
    }
}

cron.schedule('0 6 * * *', () => {
    sendManagerDailyReport();
}, {
    scheduled: true,
    timezone: "Asia/Manila"
});


// Start Server (Express Listener for Cloud Run)
hApp.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] FPOWS Automation live on port ${PORT}`);
});

