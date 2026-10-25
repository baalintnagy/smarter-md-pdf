import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { server } from '../scripts/serve.mjs';
import { marked } from '../vendor/marked.esm.js';
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const preview = page.frameLocator('#preview');
const ready = async () => {
    await page.waitForFunction(() => !document.getElementById('print').disabled);
};
const source = async (value) => {
    await page.locator('#markdown').fill(value);
    await ready();
};
try {
    await page.goto(`http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`);
    await ready();
    assert.ok(await preview.locator('.sheet').count());
    assert.equal(await page.locator('#documents').isVisible(), false);
    await page.locator('#mode-markdown').click();
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
    await source(
        '# Report\n\n' +
            Array.from(
                { length: 85 },
                (_, i) =>
                    `Paragraph ${i}: ` +
                    'Meaningful text with **emphasis** and a [link](https://example.com). '.repeat(
                        8,
                    ),
            ).join('\n\n'),
    );
    assert.ok((await preview.locator('.sheet').count()) > 3);
    const zoomSlider = page.getByRole('slider', { name: 'Print preview zoom', exact: true });
    await zoomSlider.fill('0');
    const grid = await preview.locator('.page-slot').evaluateAll((slots) =>
        slots.map((slot) => {
            const rect = slot.getBoundingClientRect();
            return { x: rect.x, y: rect.y };
        }),
    );
    assert.equal(grid[0].y, grid[1].y, 'Small page previews share a grid row');
    assert.ok(grid[1].x > grid[0].x, 'Page order runs left to right');
    assert.ok(
        grid.some((slot) => slot.y > grid[0].y),
        'Additional previews wrap to another row',
    );
    await zoomSlider.fill('1000');
    const column = await preview
        .locator('.page-slot')
        .evaluateAll((slots) => slots.slice(0, 2).map((slot) => slot.getBoundingClientRect().y));
    assert.ok(column[1] > column[0], 'Large previews return to a single column');
    await page.getByRole('button', { name: 'Fit vertically', exact: true }).click();
    let allText = (await preview.locator('.sheet .document').allTextContents()).join('');
    for (let i = 0; i < 85; i++) {
        assert.ok(allText.includes(`Paragraph ${i}:`), `Missing paragraph ${i}`);
    }
    const overflows = await preview
        .locator('.sheet .document')
        .evaluateAll(
            (bodies) =>
                bodies.filter(
                    (body) =>
                        body.getBoundingClientRect().bottom >
                        body.closest('.sheet').getBoundingClientRect().bottom + 1,
                ).length,
        );
    assert.equal(overflows, 0);
    await source('# Long paragraph\n\n' + 'Alpha **bold** and *italic* words. '.repeat(1500));
    allText = (await preview.locator('.sheet .document').allTextContents()).join('');
    assert.equal((allText.match(/Alpha/g) || []).length, 1500);
    assert.ok((await preview.locator('strong').count()) > 1);
    await source(
        '| Name | Value |\n|---|---|\n' +
            Array.from({ length: 140 }, (_, i) => `| Row ${i} | ${'data '.repeat(12)} |`).join(
                '\n',
            ),
    );
    assert.equal(await preview.locator('tbody tr').count(), 140);
    assert.ok((await preview.locator('thead').count()) > 1);
    await source(
        '<div>Before nested content<p>' +
            'Nested text. '.repeat(1800) +
            '</p>After nested content<p>Final nested content</p></div>',
    );
    allText = (await preview.locator('.sheet .document').allTextContents()).join('');
    assert.ok(
        allText.includes('Before nested content') &&
            allText.includes('After nested content') &&
            allText.includes('Final nested content'),
    );
    assert.equal((allText.match(/Nested text\./g) || []).length, 1800);
    await source('# Before\n\nFirst.\n\n<div class="page-break"></div>\n\n# After\n\nSecond.');
    assert.equal(await preview.locator('.sheet').count(), 2);
    await source(
        '# Safe\n\n<script>parent.hacked=true</script>\n\n<img src="x" onerror="parent.hacked=true"><a href="javascript:alert(1)">unsafe</a>',
    );
    assert.equal(await preview.locator('script,[onerror],a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    await page.locator('#width').fill('50');
    await page.locator('#margin').fill('30');
    await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert.ok(await page.locator('#print').isDisabled());
    await page.locator('#margin').fill('5');
    await ready();
    await page.locator('#preset').selectOption('Letter');
    await ready();
    assert.equal(await page.locator('#width').inputValue(), '215.9');
    await page.locator('#orientation').selectOption('landscape');
    await ready();
    assert.equal(await page.locator('#width').inputValue(), '279.4');
    await page.locator('#css').fill('.document h1 { color: rgb(200, 20, 30); }');
    await ready();
    assert.equal(
        await preview.locator('h1').evaluate((node) => getComputedStyle(node).color),
        'rgb(200, 20, 30)',
    );
    await page.locator('#theme').click();
    assert.equal(
        await page.locator('body').evaluate((node) => getComputedStyle(node).transitionDuration),
        '0.8s, 0.8s, 0.8s',
    );
    // Actual import and local image resolution, plus independent multi-document edits.
    await page.locator('#files').setInputFiles([
        {
            name: 'one.md',
            mimeType: 'text/markdown',
            buffer: Buffer.from('# One\n\n![dot](dot.png)'),
        },
        { name: 'two.md', mimeType: 'text/markdown', buffer: Buffer.from('# Two') },
        {
            name: 'dot.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
                'base64',
            ),
        },
    ]);
    await page.waitForFunction(() => document.getElementById('filename').textContent === 'one.md');
    await ready();
    assert.ok(await preview.locator('img').evaluate((node) => node.naturalWidth > 0));
    await source('# Edited One');
    await page.locator('#documents').selectOption('1');
    await ready();
    assert.equal(await preview.locator('h1').textContent(), 'Two');
    await page.locator('#documents').selectOption('0');
    await ready();
    assert.equal(await preview.locator('h1').textContent(), 'Edited One');
    await page.locator('#library-toggle').click();
    await page.locator('#library-example').click();
    await page.locator('#library-close').click();
    await ready();
    await page.locator('#preset').selectOption('A4');
    await page.locator('#orientation').selectOption('portrait');
    await ready();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    // Regression: a heading plus a multi-page table must use remaining page space.
    await page.locator('#margin').fill('18');
    await page.locator('#min-scale').fill('100');
    await ready();
    // Compact subsections should move together rather than strand a heading and one bullet.
    await page
        .locator('#css')
        .fill('.document .filler { height:900px; } .document li { min-height:32px; }');
    await ready();
    await source(
        '<div class="filler">Earlier sections</div>\n\n### Later additions\n\n' +
            Array.from({ length: 5 }, (_, i) => `- Addition ${i + 1}`).join('\n'),
    );
    assert.equal(await preview.locator('.sheet').count(), 2);
    assert.equal(
        await preview.locator('.sheet').first().locator('h3').count(),
        0,
        'Do not start a compact subsection at a page bottom',
    );
    assert.equal(
        await preview.locator('.sheet').nth(1).locator('li').count(),
        5,
        'Keep all five short-section bullets together',
    );
    await source(
        '<div class="filler">Earlier sections</div>\n\n### Short explanation\n\nFirst short paragraph.\n\nSecond short paragraph.',
    );
    assert.equal(
        await preview.locator('.sheet').first().locator('h3').count(),
        0,
        'Short prose subsections also move as a unit',
    );
    assert.equal(await preview.locator('.sheet').nth(1).locator('p').count(), 2);
    // Longer lists still use available space, with substantial fragments and intact numbering.
    await page
        .locator('#css')
        .fill('.document .filler { height:550px; } .document li { min-height:70px; }');
    await ready();
    await source(
        '<div class="filler">Earlier sections</div>\n\n### Long sequence\n\n' +
            Array.from({ length: 23 }, (_, i) => `${i + 7}. Entry ${i}`).join('\n'),
    );
    const listFragments = await preview.locator('.sheet ol').evaluateAll((lists) =>
        lists.map((list) => ({
            start: list.start,
            items: [...list.children].map((item) => item.textContent),
        })),
    );
    assert.ok(
        listFragments.length > 1 && listFragments.every((list) => list.items.length >= 3),
        'No one/two-item list fragments',
    );
    assert.ok(
        await preview.locator('.sheet').first().locator('h3').count(),
        'Long sections may start with a useful fragment',
    );
    let nextNumber = 7;
    for (const list of listFragments) {
        assert.equal(list.start, nextNumber);
        nextNumber += list.items.length;
    }
    assert.equal(nextNumber, 30);
    assert.deepEqual(
        listFragments.flatMap((list) => list.items),
        Array.from({ length: 23 }, (_, i) => `Entry ${i}`),
    );
    await page
        .locator('#css')
        .fill('.document .filler { height: 470px; } .document tr { height: 70px; }');
    await ready();
    const acceptanceTable =
        '| ID | Check | Result |\n|---|---|---|\n' +
        Array.from(
            { length: 17 },
            (_, i) => `| A${String(i + 1).padStart(2, '0')} | Check ${i + 1} | Result ${i + 1} |`,
        ).join('\n');
    await source(
        '<div class="filler">Earlier chapter</div>\n\n## 11. Acceptance criteria\n\n' +
            acceptanceTable,
    );
    assert.ok(
        await preview.locator('.sheet').first().locator('h2').count(),
        'Heading uses available space',
    );
    let rowCounts = await preview
        .locator('table')
        .evaluateAll((tables) => tables.map((table) => table.querySelectorAll('tbody tr').length));
    assert.ok(
        rowCounts.length > 1 && rowCounts.every((count) => count >= 3),
        `No orphan row fragments: ${rowCounts}`,
    );
    assert.equal(
        rowCounts.reduce((sum, count) => sum + count, 0),
        17,
    );
    for (const sheet of await preview.locator('.sheet').all()) {
        assert.ok(
            !/^H[1-6]$/.test(
                await sheet.locator('.document > :last-child').evaluate((node) => node.tagName),
            ),
            'No stranded heading',
        );
    }
    await page.locator('#table-min-rows').fill('5');
    await ready();
    const configuredRows = await preview
        .locator('table')
        .evaluateAll((tables) => tables.map((table) => table.querySelectorAll('tbody tr').length));
    assert.ok(
        configuredRows.length > 1 && configuredRows.every((count) => count >= 5),
        `Configured minimum table rows respected: ${configuredRows}`,
    );
    assert.equal(
        configuredRows.reduce((sum, count) => sum + count, 0),
        17,
    );
    await page.locator('#table-min-rows').fill('3');
    await ready();
    // A near-fit table can shrink independently; the earlier paragraph and heading stay at 100%.
    await page.locator('#min-scale').fill('80');
    await ready();
    await page
        .locator('#css')
        .fill('.document .filler { height: 620px; } .document tr { height: 70px; }');
    await ready();
    await source(
        '<p class="filler">Keep this paragraph size.</p>\n\n## Near-fit table\n\n| ID | Data |\n|---|---|\n| 1 | One |\n| 2 | Two |\n| 3 | Three |',
    );
    assert.equal(await preview.locator('.sheet').count(), 1);
    assert.ok(
        Number(await preview.locator('table').getAttribute('data-layout-scale')) < 100,
        'Table shrinks',
    );
    assert.equal(await preview.locator('h2').getAttribute('data-layout-scale'), null);
    assert.equal(await preview.locator('.filler').getAttribute('data-layout-scale'), null);
    // A single oversized table row is indivisible: diagnose it rather than splitting its text/header.
    await page.locator('#css').fill('.document tr { height: 1400px; }');
    await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert.ok(await page.locator('#print').isDisabled());
    assert.equal(await preview.locator('tbody tr').count(), 3);
    // Automatic bounds track actual typography, and editing a bound takes manual control.
    await page.locator('#css').fill('.document { font-size: 15pt; }');
    await page.locator('#scale-mode').selectOption('auto');
    await ready();
    const largeTypeFloor = Number(await page.locator('#min-scale').inputValue());
    await page
        .locator('#css')
        .fill('.document { font-size: 9pt; } .document table {font-size:9pt}');
    await ready();
    assert.ok(Number(await page.locator('#min-scale').inputValue()) > largeTypeFloor);
    await page.locator('#min-scale').fill('94');
    await ready();
    assert.equal(await page.locator('#scale-mode').inputValue(), 'manual');
    assert.equal(await page.locator('#min-scale').inputValue(), '94');
    await page.locator('#max-scale').fill('90');
    await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    await page.locator('#scale-mode').selectOption('auto');
    await ready();
    assert.equal(
        await page.locator('#max-scale').inputValue(),
        '100',
        'Automatic mode recovers from an invalid custom range',
    );
    await page.locator('#css').fill('');
    await page.locator('#scale-mode').selectOption('auto');
    await ready();
    if (process.env.TEST_MARKDOWN) {
        const original = await readFile(process.env.TEST_MARKDOWN, 'utf8');
        await source(original);
        const additions = preview.locator('h3').filter({ hasText: 'Későbbi bővítések' });
        assert.equal(
            await additions.locator('xpath=following-sibling::*[1]').locator(':scope > li').count(),
            5,
            'The screenshot subsection stays with its full five-item list',
        );
        const sourceListItems = await page
            .frames()
            .find((item) => item !== page.mainFrame())
            .evaluate(
                (html) =>
                    [
                        ...new DOMParser()
                            .parseFromString(html, 'text/html')
                            .querySelectorAll('li'),
                    ].map((item) => item.textContent.replace(/\s+/g, ' ').trim()),
                marked.parse(original),
            );
        const printedListItems = await preview
            .locator('.sheet li')
            .evaluateAll((items) =>
                items.map((item) => item.textContent.replace(/\s+/g, ' ').trim()),
            );
        assert.deepEqual(
            printedListItems,
            sourceListItems,
            'Every supplied list item survives exactly once in order',
        );
        const chapter = preview.locator('h2').filter({ hasText: '11. Elfogadási feltételek' });
        const chapterSheet = chapter.locator('xpath=ancestor::article');
        assert.ok(
            (await chapterSheet.locator('table tbody tr').count()) >= 3,
            'Chapter 11 stays with at least three acceptance rows',
        );
        const ids = await preview.locator('table tbody tr td:first-child').allTextContents();
        for (let i = 1; i <= 17; i++) {
            assert.equal(
                ids.filter((id) => id === `A${String(i).padStart(2, '0')}`).length,
                1,
                'Acceptance rows preserved once',
            );
        }
        const fragments = await preview
            .locator('table')
            .evaluateAll((tables) =>
                tables
                    .filter((table) =>
                        /Azonosító/.test(table.querySelector('thead')?.textContent || ''),
                    )
                    .map((table) => table.querySelectorAll('tbody tr').length),
            );
        assert.ok(
            fragments.every((count) => count >= 3),
            `Acceptance table balanced: ${fragments}`,
        );
        const fill = await chapterSheet
            .locator('.document')
            .evaluate(
                (node) =>
                    node.getBoundingClientRect().height /
                    ((node.closest('.sheet').getBoundingClientRect().height * (297 - 36)) / 297),
            );
        assert.ok(
            fill > 0.5,
            `Chapter 11 page uses ${(fill * 100).toFixed(1)}% of printable height`,
        );
        const sourceFrame = page.frames().find((item) => item !== page.mainFrame());
        const expectedRows = await sourceFrame.evaluate(
            (html) =>
                [
                    ...new DOMParser()
                        .parseFromString(html, 'text/html')
                        .querySelectorAll('tbody tr'),
                ].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
            marked.parse(original),
        );
        const actualRows = await preview
            .locator('tbody tr')
            .evaluateAll((rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()));
        assert.deepEqual(
            actualRows,
            expectedRows,
            'All supplied table rows survive once and in order',
        );
        const proof = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
        await proof.setContent(await sourceFrame.content());
        const proofChapter = proof
            .locator('h2')
            .filter({ hasText: '11. Elfogadási feltételek' })
            .locator('xpath=ancestor::article');
        await proofChapter.screenshot({ path: 'test-results/chapter-11.png' });
        await proof.pdf({
            path: 'test-results/kamraradar.pdf',
            preferCSSPageSize: true,
            printBackground: true,
        });
        await proof.close();
        console.log(
            `KamraRadar: ${await preview.locator('.sheet').count()} pages; chapter 11 page ${(fill * 100).toFixed(1)}% filled; acceptance fragments ${fragments.join('+')} rows.`,
        );
    }
    // Print the same iframe DOM in an isolated browser tab for an actual PDF smoke test.
    await source(
        '# Print test\n\n' +
            Array.from(
                { length: 60 },
                (_, i) => `Print paragraph ${i}: ` + 'Content preservation matters. '.repeat(25),
            ).join('\n\n'),
    );
    const frame = page.frames().find((item) => item !== page.mainFrame());
    const expectedPages = await preview.locator('.sheet').count();
    const printPage = await browser.newPage();
    await printPage.setContent(await frame.content());
    await printPage.pdf({
        path: 'test-results/print.pdf',
        preferCSSPageSize: true,
        printBackground: true,
    });
    const pdf = (await readFile('test-results/print.pdf')).toString('latin1');
    assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, expectedPages);
    const mediaBox = pdf.match(/\/MediaBox\s*\[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox, 'PDF has paper dimensions');
    assert.ok(
        Math.abs(Number(mediaBox[3]) - 595.28) < 2 && Math.abs(Number(mediaBox[4]) - 841.89) < 2,
        'PDF uses A4 dimensions',
    );
    await printPage.close();
    await frame.evaluate(() => {
        window.print = () => {
            window.printRequested = true;
        };
    });
    await page.locator('#print').click();
    assert.equal(await frame.evaluate(() => window.printRequested), true);
    assert.deepEqual(errors, []);
    console.log(
        'Browser checks passed: pagination, content preservation, table headers, manual breaks, sanitation, validation, CSS, theme, imports, images, document switching, mobile, PDF page count and dimensions, print action.',
    );
} finally {
    await browser.close();
    server.close();
}
