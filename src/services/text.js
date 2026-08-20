// Text utilities for cleaning simPRO's HTML-encoded description fields into
// plain, client- or staff-facing text.

// Decode all common HTML entities to plain text.
export function decodeHtmlEntities(str) {
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
        .replace(/&#\d+;/g, c => { try { return String.fromCharCode(parseInt(c.slice(2, -1))); } catch { return ''; } });
}

// DESCRIPTION CLEANER: Show everything from the description — only strip internal noise
export function cleanDescriptionForClient(desc) {
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
export function fullDescriptionForStaff(rawDesc) {
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
    const dateLines = lines.filter(l => /^scheduled\s+date:/i.test(l));
    const timeLines = lines.filter(l => /^scheduled\s+time:/i.test(l));
    const otherLines = lines.filter(l => !/^scheduled\s+(date|time):/i.test(l));
    return [...dateLines, ...timeLines, ...otherLines].join('\n');
}
