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
// Builds the printable summary document. The template (RTL layout, title, and
// styles) is ported from the former server/services/pdfService.js. The summary
// is escaped first, then newlines become <br> - the same order as the server.
export function buildSummaryHtml(summary) {
    const safeSummary = escapeHtml(summary).replace(/\n/g, "<br>");
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>סיכום הרצאה</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        direction: rtl;
        text-align: right;
        margin: 40px;
        line-height: 1.8;
        font-size: 14px;
        color: #111;
      }

      h1 {
        font-size: 24px;
        margin-bottom: 24px;
      }

      .content {
        white-space: normal;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <h1>סיכום הרצאה</h1>
    <div class="content">${safeSummary}</div>
  </body>
</html>`;
}
