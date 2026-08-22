/**
 * Print example-flow HTML stories to A4 PDFs (GitHub inline preview).
 * Usage: node scripts/print-example-flow-pdfs.mjs
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'example-flows');

const jobs = [
  { html: '01-indiasat-validation.html', pdf: '01-indiasat-validation.pdf' },
  { html: '02-tessera-tree-species.html', pdf: '02-tessera-tree-species.pdf' },
];

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
else launchOpts.channel = 'chrome';

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
page.setViewportSize({ width: 1200, height: 1600 });

for (const job of jobs) {
  const url = pathToFileURL(join(root, job.html)).href;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() =>
    [...document.images].every((img) => img.complete && img.naturalWidth > 0)
  );
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: join(root, job.pdf),
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; font-size: 8px; color: #8a8699; width: 100%; padding: 0 18mm; display: flex; justify-content: space-between;">
        <span>Fields · field stories</span>
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
    margin: { top: '12mm', bottom: '16mm', left: '0', right: '0' },
  });
  console.log('wrote', job.pdf);
}

await browser.close();
