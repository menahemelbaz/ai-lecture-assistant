const puppeteer = require("puppeteer");
const escapeHtml = require("../utils/escapeHtml");

// Build a PDF file from the generated lecture summary.
async function buildSummaryPdf(summary) {
  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Escape the summary content before injecting it into HTML.
    const safeSummary = escapeHtml(summary).replace(/\n/g, "<br>");

    // Create the HTML template that will be rendered into a PDF.
    const html = `
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8" />
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
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Generate and return the PDF as a buffer.
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });
  } finally {
    // Always close the browser after PDF generation.
    await browser.close();
  }
}

module.exports = {
  buildSummaryPdf,
};
