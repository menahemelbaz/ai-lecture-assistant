// escapeHtml is ported verbatim from the former server/utils/escapeHtml.js,
// including the &#039; form for single quotes.
export function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
// Applies inline formatting (bold) to already-escaped text.
function renderInline(escapedLine) {
    return escapedLine.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
// Converts the subset of Markdown the model produces into safe HTML.
function renderMarkdown(markdown) {
    const escaped = escapeHtml(markdown);
    const lines = escaped.split(/\r?\n/);
    const parts = [];
    let paragraph = [];
    let listType = null;
    const flushParagraph = () => {
        if (paragraph.length > 0) {
            parts.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }
    };
    const closeList = () => {
        if (listType) {
            parts.push(`</${listType}>`);
            listType = null;
        }
    };
    const openList = (type) => {
        if (listType !== type) {
            closeList();
            parts.push(`<${type}>`);
            listType = type;
        }
    };
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushParagraph();
            closeList();
            continue;
        }
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length;
            parts.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }
        const ordered = line.match(/^\d+\.\s+(.*)$/);
        if (ordered) {
            flushParagraph();
            openList("ol");
            parts.push(`<li>${renderInline(ordered[1])}</li>`);
            continue;
        }
        const unordered = line.match(/^[-*]\s+(.*)$/);
        if (unordered) {
            flushParagraph();
            openList("ul");
            parts.push(`<li>${renderInline(unordered[1])}</li>`);
            continue;
        }
        paragraph.push(line);
    }
    flushParagraph();
    closeList();
    return parts.join("\n");
}
// Builds the printable summary document as a clean, academic-styled page with
// subtle orange accents matching the extension. RTL throughout.
export function buildSummaryHtml(summary) {
    const body = renderMarkdown(summary);
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>AI Lecture Assistant</title>
    <style>
      @page { margin: 20mm 16mm; }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        padding: 32px 36px;
        font-family: "Assistant", "Rubik", -apple-system, BlinkMacSystemFont,
          "Segoe UI", Arial, sans-serif;
        font-size: 15px;
        line-height: 1.85;
        color: #1a1a1a;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .doc {
        max-width: 760px;
        margin: 0 auto;
      }

      .eyebrow {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: #e97616;
        margin-bottom: 6px;
      }

      .rule {
        height: 3px;
        width: 100%;
        background: linear-gradient(90deg, #f58a2a 0%, #ffd89b 100%);
        border-radius: 2px;
        margin-bottom: 28px;
      }

      h1 {
        font-size: 26px;
        font-weight: 700;
        line-height: 1.35;
        margin: 0 0 20px;
        color: #111;
      }

      h2 {
        font-size: 19px;
        font-weight: 700;
        line-height: 1.4;
        margin: 30px 0 12px;
        padding-inline-start: 12px;
        border-inline-start: 4px solid #f58a2a;
        color: #1a1a1a;
      }

      h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 22px 0 8px;
        color: #333;
      }

      p { margin: 0 0 14px; }

      ul, ol {
        margin: 0 0 16px;
        padding-inline-start: 24px;
      }

      li {
        margin-bottom: 7px;
        padding-inline-start: 4px;
      }

      ul li::marker { color: #f58a2a; }
      ol li::marker { color: #e97616; font-weight: 700; }

      strong { font-weight: 700; color: #111; }

      /* Avoid orphaned headings at the bottom of a printed page. */
      h1, h2, h3 { break-after: avoid; }

      /* KaTeX emits a hidden MathML copy for screen readers. Chrome renders
         MathML natively, and here KaTeX's own hiding rule doesn't take effect,
         so force it hidden to avoid a duplicate of every formula in the PDF. */
      .katex-mathml { display: none !important; }

      /* Math is inherently left-to-right; isolate it so it is not reordered by
         the surrounding RTL text flow. */
      .katex {
        direction: ltr;
        unicode-bidi: isolate;
      }

      .katex-display {
        direction: ltr;
        text-align: center;
      }
    </style>
  </head>
  <body>
   <div class="doc">
  <div class="eyebrow">AI Lecture Assistant</div>
  <div class="rule"></div>
  <main class="summary-content" dir="auto">
    ${body}
  </main>
</div>
  </body>
</html>`;
}
