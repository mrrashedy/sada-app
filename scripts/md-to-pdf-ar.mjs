// Convert INVESTOR-AR.md → INVESTOR-AR.pdf
// Markdown → HTML (RTL + Arabic fonts) → Chrome headless → PDF
//
// No external npm packages — uses a focused regex converter for the
// subset of markdown actually used in INVESTOR-AR.md (headers, bold,
// italic, tables, lists, horizontal rules, paragraphs, blockquotes).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD_PATH = path.join(ROOT, 'INVESTOR-AR.md');
const HTML_PATH = path.join(ROOT, 'INVESTOR-AR.html');
const PDF_PATH = path.join(ROOT, 'INVESTOR-AR.pdf');

// ─── Markdown → HTML ───────────────────────────────────────────────
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(s) {
  // Bold **x** → <strong>x</strong>
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *x* → <em>x</em>  (single-asterisk — avoids matching **)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length === 0) return;
    const text = inlineFormat(escapeHtml(buf.join(' ')));
    out.push(`<p>${text}</p>`);
    buf.length = 0;
  };

  let paraBuf = [];

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      flushParagraph(paraBuf);
      out.push('<hr />');
      i++; continue;
    }

    // Headers
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushParagraph(paraBuf);
      const level = h[1].length;
      const text = inlineFormat(escapeHtml(h[2].trim()));
      out.push(`<h${level}>${text}</h${level}>`);
      i++; continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      flushParagraph(paraBuf);
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const text = inlineFormat(escapeHtml(quoteLines.join(' ')));
      out.push(`<blockquote>${text}</blockquote>`);
      continue;
    }

    // Table (GFM): header row, separator, body rows
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i + 1])) {
      flushParagraph(paraBuf);
      const splitRow = (row) => row
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map(c => c.trim());
      const headers = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push('<table>');
      out.push('<thead><tr>' + headers.map(c => `<th>${inlineFormat(escapeHtml(c))}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>');
      for (const row of rows) {
        out.push('<tr>' + row.map(c => `<td>${inlineFormat(escapeHtml(c))}</td>`).join('') + '</tr>');
      }
      out.push('</tbody></table>');
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(paraBuf);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>');
      for (const it of items) {
        out.push(`<li>${inlineFormat(escapeHtml(it))}</li>`);
      }
      out.push('</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph(paraBuf);
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>');
      for (const it of items) {
        out.push(`<li>${inlineFormat(escapeHtml(it))}</li>`);
      }
      out.push('</ol>');
      continue;
    }

    // Blank line → flush paragraph
    if (line.trim() === '') {
      flushParagraph(paraBuf);
      i++; continue;
    }

    // Regular paragraph line
    paraBuf.push(line.trim());
    i++;
  }

  flushParagraph(paraBuf);
  return out.join('\n');
}

// ─── Build final HTML document with RTL + Arabic fonts ─────────────
function buildHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<title>صدى — وثيقة المستثمر</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page {
    size: A4;
    margin: 20mm 18mm;
  }
  html, body {
    direction: rtl;
    font-family: 'Tajawal', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .wrap {
    max-width: 190mm;
    margin: 0 auto;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Tajawal', sans-serif;
    font-weight: 900;
    color: #0a0a0a;
    line-height: 1.3;
    page-break-after: avoid;
  }
  h1 {
    font-size: 26pt;
    text-align: center;
    margin: 0 0 4pt;
    letter-spacing: -0.5px;
  }
  h1 + p + p {
    text-align: center;
    color: #666;
    font-size: 10pt;
    margin-top: 0;
  }
  h2 {
    font-size: 18pt;
    margin: 28pt 0 10pt;
    padding-bottom: 6pt;
    border-bottom: 2px solid #1a1a1a;
  }
  h3 {
    font-size: 14pt;
    margin: 20pt 0 8pt;
    color: #222;
  }
  h4 {
    font-size: 12pt;
    margin: 14pt 0 6pt;
  }
  p {
    margin: 0 0 10pt;
    text-align: justify;
    text-justify: inter-word;
  }
  strong {
    font-weight: 700;
    color: #000;
  }
  em {
    font-style: italic;
    color: #333;
  }
  code {
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 9pt;
    background: #f4f4f4;
    padding: 1pt 4pt;
    border-radius: 3pt;
    direction: ltr;
    display: inline-block;
  }
  a {
    color: #0066cc;
    text-decoration: none;
  }
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 20pt 0;
  }
  ul, ol {
    margin: 8pt 0 12pt;
    padding-right: 22pt;
    padding-left: 0;
  }
  li {
    margin: 4pt 0;
  }
  blockquote {
    background: #f7f7f4;
    border-right: 3px solid #333;
    border-left: none;
    padding: 10pt 14pt;
    margin: 12pt 0;
    font-style: normal;
    color: #222;
    border-radius: 3pt;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0 18pt;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  thead tr {
    background: #1a1a1a;
    color: #fff;
  }
  th {
    padding: 8pt 10pt;
    text-align: right;
    font-weight: 700;
    border: 1px solid #1a1a1a;
  }
  td {
    padding: 7pt 10pt;
    border: 1px solid #ddd;
    vertical-align: top;
    text-align: right;
  }
  tbody tr:nth-child(even) {
    background: #fafafa;
  }
  /* Cover page styles — first H1 is the title */
  h1:first-of-type {
    padding-top: 30mm;
    padding-bottom: 4mm;
    border-bottom: 3px solid #000;
    margin-bottom: 14pt;
  }
  /* Avoid orphan headers */
  h2, h3, h4 { page-break-inside: avoid; }
  table, blockquote { page-break-inside: avoid; }
  /* First paragraph after h1 = subtitle */
  h1 + p {
    text-align: center;
    font-size: 14pt;
    font-weight: 500;
    margin-top: 4pt;
    margin-bottom: 2pt;
  }
</style>
</head>
<body>
<div class="wrap">
${bodyHtml}
</div>
</body>
</html>
`;
}

// ─── Main ──────────────────────────────────────────────────────────
const md = await fs.readFile(MD_PATH, 'utf8');
const bodyHtml = mdToHtml(md);
const html = buildHtml(bodyHtml);
await fs.writeFile(HTML_PATH, html);
console.log(`HTML written: ${HTML_PATH} (${html.length} bytes)`);

// Headless Chrome → PDF
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${PDF_PATH}`,
  '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=10000',
  `file://${HTML_PATH}`,
];

console.log('Running headless Chrome to generate PDF…');
const r = spawnSync(chrome, args, { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(`Chrome exited with code ${r.status}`);
  process.exit(1);
}

const stat = await fs.stat(PDF_PATH);
console.log(`PDF written: ${PDF_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
