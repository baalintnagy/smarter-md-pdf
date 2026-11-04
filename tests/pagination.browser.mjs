import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    assert.equal(await page.getByText('Minimum rows per fragment', { exact: false }).count(), 1);
    await page.route('**/src/*.js', async (route) => {
        const filename = new URL(route.request().url()).pathname.split('/').at(-1);
        await route.fulfill({
            contentType: 'text/javascript',
            body: await readFile(new URL('../src/' + filename, import.meta.url), 'utf8'),
        });
    });
    const checkFragments = async (minimum, smart = true, count = 14) =>
        page.evaluate(
            async ({ minimum, smart, count }) => {
                const { Paginator } = await import('/src/paginator.js');
                const doc = document.createElement('div');
                doc.innerHTML = '<div id="pages"></div>';
                document.body.append(doc);
                const style = document.createElement('style');
                style.textContent = '#pages .test-prose { font: 20px/20px monospace; margin: 0; }';
                doc.append(style);
                // One word per rendered line, with inline markup retained across splits.
                const fragment = document.createDocumentFragment();
                const filler = document.createElement('div');
                filler.style.height = '100px';
                filler.textContent = 'Earlier text';
                const paragraph = document.createElement('p');
                paragraph.className = 'test-prose';
                paragraph.innerHTML = Array.from(
                    { length: count },
                    () => '<strong>abcdefgh</strong> ',
                ).join('');
                fragment.append(filler, paragraph);
                const result = new Paginator(document).paginate(fragment, {
                    width: 50,
                    height: 80,
                    margin: 10,
                    minScale: 100,
                    maxScale: 100,
                    scaleMode: 'manual',
                    smart,
                    minTableRows: minimum,
                });
                const parts = result.pages.map(({ content }) =>
                    [...content.querySelectorAll('p')].map((p) => ({
                        words: p.textContent.trim().split(/\s+/).length,
                        lines: Math.round(p.getBoundingClientRect().height / 20),
                        strong: !!p.querySelector('strong'),
                    })),
                );
                doc.remove();
                return { parts, warnings: result.warnings };
            },
            { minimum, smart, count },
        );
    const five = await checkFragments(5);
    assert.equal(five.parts[0][0].lines, 6, 'Paragraph uses remaining page space');
    assert.ok(five.parts.flat().every((part) => part.lines >= 5 && part.strong));
    assert.equal(
        five.parts.flat().reduce((sum, part) => sum + part.words, 0),
        14,
    );
    const seven = await checkFragments(7);
    assert.equal(seven.parts[0].length, 0, 'Insufficient space moves paragraph to a fresh page');
    assert.deepEqual(
        seven.parts
            .slice(1)
            .flat()
            .map((part) => part.lines),
        [7, 7],
    );
    const relaxed = await checkFragments(100, true, 30);
    assert.deepEqual(relaxed.warnings, [], 'Impossible minimum relaxes on fresh pages');
    assert.equal(
        relaxed.parts.flat().reduce((sum, part) => sum + part.words, 0),
        30,
    );
    const plain = await checkFragments(7, false);
    assert.equal(plain.parts[0][0].lines, 6, 'Smart minimum is disabled with smart breaks');
    assert.deepEqual(errors, []);
    console.log(
        'Pagination checks passed: live scale recalculation, nested type, H1–H6 keep-with-next.',
    );
} finally {
    await browser.close();
    server.close();
}
