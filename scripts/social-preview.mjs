import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Use the same optional installed-browser override as the integration suites.
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
try {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 630 },
        deviceScaleFactor: 1,
    });
    const svg = await readFile(new URL('../public/social-preview.svg', import.meta.url), 'utf8');
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'public/social-preview.png' });
} finally {
    await browser.close();
}
