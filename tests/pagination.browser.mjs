import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { server } from '../scripts/serve.mjs';

const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const page = await browser.newPage();
const preview = page.frameLocator('#preview');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const ready = () => page.waitForFunction(() => !document.getElementById('print').disabled);
const source = async (value) => {
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill(value);
    await ready();
};

try {
    await page.goto(`http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`);
    await page.locator('#visual-editor[data-state=ready]').waitFor();
    await ready();
    await page
        .locator('#css')
        .fill('.document p { font-size:15pt; } .document strong { font-size:9pt; }');
    await source('Large prose');
    assert.equal(await page.locator('#min-scale').inputValue(), '80');
    await source('**Small prose**');
    assert.equal(await page.locator('#min-scale').inputValue(), '100', 'Inline type is measured');
    await source('<section><div><p><strong>Nested prose</strong></p></div></section>');
    assert.equal(await page.locator('#min-scale').inputValue(), '100', 'Nested type is measured');
    await source('**Small prose**');
    await page.locator('#mode-visual').click();
    const rich = page.locator('#visual-editor .ProseMirror');
    await rich.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Large prose');
    await page.waitForFunction(
        () => document.getElementById('markdown').value.trim() === 'Large prose',
    );
    await ready();
    assert.equal(await page.locator('#min-scale').inputValue(), '80', 'Visual edits recalculate');
    await page.keyboard.press('ControlOrMeta+a');
    await page
        .getByRole('toolbar', { name: 'Document formatting' })
        .getByRole('button', { name: 'Bold', exact: true })
        .click();
    await page.waitForFunction(() => document.getElementById('markdown').value.includes('**'));
    await ready();
    assert.equal(await page.locator('#min-scale').inputValue(), '100', 'Formatting recalculates');
    await page.locator('#min-scale').fill('92');
    await source('Large prose again');
    assert.equal(
        await page.locator('#min-scale').inputValue(),
        '92',
        'Custom bounds are preserved',
    );

    await page.locator('#min-scale').fill('100');
    await page.locator('#css').fill('.document .filler { height:900px; }');
    await ready();
    const paragraph = 'Following <strong>paragraph</strong> content. '.repeat(160);
    for (let level = 1; level <= 6; level++) {
        for (const nested of [false, true]) {
            const section = `<h${level}>Heading ${level}</h${level}><div></div><p>${paragraph}</p>`;
            await source(
                '<div class="filler">Earlier text</div>\n\n' +
                    (nested ? `<section><p>Introduction.</p>${section}</section>` : section),
            );
            const sheets = await preview.locator('.sheet').evaluateAll((items) =>
                items.map((sheet) => ({
                    heading: !!sheet.querySelector('h1,h2,h3,h4,h5,h6'),
                    text: sheet.textContent,
                    overflow:
                        sheet.querySelector('.document').getBoundingClientRect().bottom >
                        sheet.getBoundingClientRect().bottom + 1,
                })),
            );
            assert.ok(sheets.length > 1);
            assert.equal(sheets[0].heading, false, 'Heading moves with following content');
            assert.ok(sheets.find((sheet) => sheet.heading).text.includes('Following paragraph'));
            assert.ok(
                sheets.every((sheet) => !sheet.overflow),
                'No clipped content',
            );
            assert.equal(
                sheets.map((sheet) => sheet.text).join(''),
                'Earlier text' +
                    (nested ? 'Introduction.' : '') +
                    `Heading ${level}` +
                    'Following paragraph content. '.repeat(160),
                'All text survives once and in order',
            );
        }
    }
    assert.deepEqual(errors, []);
    console.log(
        'Pagination checks passed: live scale recalculation, nested type, H1–H6 keep-with-next.',
    );
} finally {
    await browser.close();
    server.close();
}
