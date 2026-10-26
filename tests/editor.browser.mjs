import { pathToFileURL } from 'node:url';
import { positionFromZoom } from '../src/zoom-scale.js';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { server } from '../scripts/serve.mjs';
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
});
const rich = page.locator('#visual-editor .ProseMirror');
const preview = page.frameLocator('#preview');
const ready = () => page.waitForFunction(() => !document.getElementById('print').disabled);
const cleanText = (locator) =>
    locator.evaluate((node) => {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('.markdown-marker').forEach((marker) => marker.remove());
        return copy.textContent;
    });
async function setSource(value) {
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill(value);
    await ready();
    await page.locator('#mode-visual').click();
    await rich.waitFor();
}
try {
    await page.goto(`http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`);
    await page.locator('#visual-editor[data-state=ready]').waitFor();
    await ready();
    assert.equal(await rich.isVisible(), true);
    assert.equal(await page.locator('#markdown').isVisible(), false);
    assert.equal(await page.locator('[aria-label="Table of contents"]').count(), 0);
    // Clicking text must place the caret at the same character at every editor zoom.
    const original = await page.locator('#markdown').inputValue();
    const toolbar = page.getByRole('toolbar', { name: 'Document formatting' });
    const toolbarHeight = (await toolbar.boundingBox()).height;
    for (const zoom of [50, 100, 150, 200, 250]) {
        await setSource('ABCDEFGHIJKLM');
        await page
            .getByRole('slider', { name: 'Markdown zoom', exact: true })
            .fill(String(positionFromZoom(zoom, 20, 250)));
        const point = await rich
            .locator('p')
            .first()
            .evaluate((node) => {
                const text = [...node.childNodes].find(
                    (child) => child.nodeType === Node.TEXT_NODE,
                );
                const range = document.createRange();
                range.setStart(text, 5);
                range.setEnd(text, 6);
                const rect = range.getBoundingClientRect();
                return { x: rect.left + 1, y: rect.top + rect.height / 2 };
            });
        await page.mouse.click(point.x, point.y);
        await page.keyboard.type('X');
        assert.equal(
            (await page.locator('#markdown').inputValue()).trim(),
            'ABCDEXFGHIJKLM',
            'Caret and typing at ' + zoom + '%',
        );
        assert.equal((await toolbar.boundingBox()).height, toolbarHeight, 'Toolbar stays unscaled');
        assert.equal(
            await rich.evaluate((node) => getComputedStyle(node).zoom),
            '1',
            'Editable surface is untransformed',
        );
    }
    await page
        .getByRole('slider', { name: 'Markdown zoom', exact: true })
        .fill(String(positionFromZoom(100, 20, 250)));
    const beforeEdit =
        '# Preserve this heading #\n\n' +
        'An __unchanged__ [reference][product].\n\n' +
        '*   Keep this list spacing\n*   And this item\n\n' +
        Array.from({ length: 12 }, (_, index) => `Distant paragraph ${index}.\n\n`).join('');
    const afterEdit =
        '\n\n~~~mermaid\ngraph TD\n    A --> B\n~~~\n\n' +
        '[product]: https://example.com/product "Original title"\n';
    await setSource(beforeEdit + 'Edit only this paragraph.' + afterEdit);
    const distantHeading = await rich.locator('h1 .markdown-marker').elementHandle();
    const target = rich.locator('p').filter({ hasText: 'Edit only this paragraph.' });
    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Local change');
    assert.equal(
        await page.locator('#markdown').inputValue(),
        beforeEdit + 'Edit only this paragraph. Local change' + afterEdit,
        'Typing preserves distant Markdown, reference definitions and code fences exactly',
    );
    assert.ok(
        await distantHeading.evaluate((node) => node.isConnected),
        'Typing reuses untouched marker DOM',
    );
    await page.keyboard.press('Backspace');
    assert.equal(
        await page.locator('#markdown').inputValue(),
        beforeEdit + 'Edit only this paragraph. Local chang' + afterEdit,
        'Deleting near the caret preserves the rest of a long document',
    );
    await page.keyboard.press('Control+z');
    assert.ok((await page.locator('#markdown').inputValue()).startsWith(beforeEdit));
    assert.ok((await page.locator('#markdown').inputValue()).endsWith(afterEdit));
    await setSource(beforeEdit + 'Edit only this paragraph.' + afterEdit);
    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('New paragraph');
    assert.equal(
        await page.locator('#markdown').inputValue(),
        beforeEdit + 'Edit only this paragraph.\n\nNew paragraph' + afterEdit,
        'Splitting a paragraph preserves distant source',
    );
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    assert.equal(
        await page.locator('#markdown').inputValue(),
        beforeEdit + 'Edit only this paragraph.New paragraph' + afterEdit,
        'Joining paragraphs preserves distant source',
    );
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill('New source wins over a stale hidden visual edit.');
    await target.evaluate((node) => {
        node.textContent = 'Late update from the previous visual document';
    });
    await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(
        await page.locator('#markdown').inputValue(),
        'New source wins over a stale hidden visual edit.',
        'Hidden visual updates cannot overwrite source-mode edits',
    );
    await setSource(original);
    await rich.locator('h1').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await ready();
    assert.ok((await page.locator('#markdown').inputValue()).includes('edited'));
    const editedSource = await page.locator('#markdown').inputValue();
    const mathBlocks = (source) =>
        [...source.matchAll(/\$\$\s*\n([\s\S]*?)\n\$\$/g)].map((match) => match[1]);
    assert.deepEqual(
        mathBlocks(editedSource),
        mathBlocks(original),
        'Unrelated edits preserve TeX',
    );
    assert.equal(await preview.locator('.render-error').count(), 0);
    assert.ok((await preview.locator('h1').first().textContent()).includes('edited'));
    await rich.locator('p').first().click();
    await rich
        .locator('p')
        .first()
        .evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
    await page.locator('.milkdown-toolbar[data-show=true]').waitFor();
    await page
        .getByRole('toolbar', { name: 'Document formatting' })
        .getByRole('button', { name: 'Bold', exact: true })
        .click();
    await ready();
    assert.ok(await rich.locator('p strong').count());
    await page.keyboard.press('Control+z');
    await ready();
    const html = '<div class="note">Retain <strong>custom HTML</strong></div>';
    const manual =
        '# Before\n\n<div class="page-break"></div>\n\n## After\n\nText after the break.\n\n' +
        html;
    await setSource(manual);
    assert.equal(await rich.locator('.manual-page-break').count(), 1);
    assert.equal(await rich.locator('.preserved-html').count(), 2);
    assert.equal(
        await page.locator('#markdown').inputValue(),
        manual,
        'Opening visual mode preserves unedited source exactly',
    );
    await rich.locator('h1').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' changed');
    await ready();
    const changed = await page.locator('#markdown').inputValue();
    assert.ok(
        changed.includes('<div class="page-break"></div>') && changed.includes(html),
        'Visual edits retain HTML and breaks',
    );
    for (let i = 0; i < 3; i++) {
        await page.locator('#mode-markdown').click();
        await page.locator('#mode-visual').click();
    }
    assert.equal(await rich.locator('.manual-page-break').count(), 1);
    assert.equal(await preview.locator('.sheet').count(), 2);
    await setSource(
        '# Tables\n\n| Name | Value |\n|---|---|\n| Apple | One |\n| Banana | Two |\n| Cherry | Three |',
    );
    const cell = rich.locator('td').filter({ hasText: 'Apple' }).first();
    await cell.click();
    await page.locator('#table-controls').waitFor();
    await page.locator('[data-table-command="row-down"]').click();
    await ready();
    let values = await rich.locator('tr').allTextContents();
    assert.ok(values[1].includes('Banana') && values[2].includes('Apple'), 'Move table row');
    await rich.locator('td').filter({ hasText: 'Apple' }).first().click();
    await page.locator('[data-table-command="add-row"]').click();
    await ready();
    assert.equal(await rich.locator('tr').count(), 5);
    await rich.locator('tr').nth(3).locator('td').first().click();
    await page.locator('[data-table-command="delete-row"]').click();
    await ready();
    assert.equal(await rich.locator('tr').count(), 4);
    await rich.locator('td').filter({ hasText: 'Banana' }).first().click();
    await page.locator('[data-table-command="add-column"]').click();
    await ready();
    assert.equal(await rich.locator('tr').first().locator('th,td').count(), 3);
    await rich.locator('tr').nth(1).locator('td').nth(1).click();
    await page.locator('[data-table-command="delete-column"]').click();
    await ready();
    assert.equal(await rich.locator('tr').first().locator('th,td').count(), 2);
    await rich.locator('td').filter({ hasText: 'Banana' }).first().click();
    await page.locator('[data-table-command="column-right"]').click();
    await ready();
    assert.ok(
        (await rich.locator('tr').first().textContent()).indexOf('Value') <
            (await rich.locator('tr').first().textContent()).indexOf('Name'),
        'Reorder entire column including its header',
    );
    await rich.locator('td').filter({ hasText: 'Banana' }).first().click();
    await page.locator('[data-table-command="align-center"]').click();
    await ready();
    assert.ok(
        /:-+:/.test(await page.locator('#markdown').inputValue()),
        'Column alignment serializes to GFM',
    );
    assert.equal(await preview.locator('tbody tr').count(), 3);
    await setSource('# Insert a table\n\nStart here.');
    await rich.locator('p').first().click();
    await page
        .getByRole('toolbar', { name: 'Document formatting' })
        .getByRole('button', { name: 'Table', exact: true })
        .click();
    await ready();
    assert.equal(
        await rich.locator('.milkdown-table-block').count(),
        1,
        'Formatting toolbar inserts one editable table block',
    );
    assert.ok(await preview.locator('table').count());
    await setSource('# Break insertion\n\nBefore and after.');
    await rich.locator('p').first().click();
    await page.keyboard.press('End');
    await page.locator('#insert-page-break').click();
    await ready();
    assert.ok(
        (await page.locator('#markdown').inputValue()).includes('<div class="page-break"></div>'),
    );
    await setSource(
        '# Inert HTML\n\n<script>parent.compromised=true</script>\n\n<div onclick="parent.compromised=true">Raw block</div>',
    );
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await rich.locator('script,[onclick]').count(), 0);
    await rich.locator('h1').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await ready();
    assert.ok(
        (await page.locator('#markdown').inputValue()).includes(
            '<script>parent.compromised=true</script>',
        ),
        'Inert HTML is preserved verbatim',
    );
    await setSource('# Images\n\nPaste an image here.');
    await rich.locator('p').first().click();
    await page.keyboard.press('End');
    const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
    await rich.evaluate((node, base64) => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const clipboard = new DataTransfer();
        clipboard.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
        node.dispatchEvent(
            new ClipboardEvent('paste', {
                clipboardData: clipboard,
                bubbles: true,
                cancelable: true,
            }),
        );
    }, png);
    await page.waitForFunction(() =>
        document.getElementById('markdown').value.includes('pasted.png'),
    );
    await ready();
    assert.ok(
        await preview.locator('img').evaluate((node) => node.naturalWidth === 1),
        'Pasted image resolves in print',
    );
    await page.locator('#files').setInputFiles([
        {
            name: 'one.md',
            mimeType: 'text/markdown',
            buffer: Buffer.from('# Visual One\n\n![dot](dot.png)'),
        },
        { name: 'two.md', mimeType: 'text/markdown', buffer: Buffer.from('# Visual Two') },
        { name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    ]);
    await page.waitForFunction(() => document.getElementById('filename').textContent === 'one.md');
    await ready();
    assert.equal(await cleanText(rich.locator('h1')), 'Visual One');
    await page.waitForFunction(() =>
        [...document.querySelectorAll('#visual-editor img')].some(
            (image) => image.naturalWidth === 1,
        ),
    );
    await rich.locator('h1').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' saved');
    await ready();
    await page.locator('#documents').selectOption('1');
    await ready();
    assert.equal(await cleanText(rich.locator('h1')), 'Visual Two');
    await page.locator('#documents').selectOption('0');
    await ready();
    assert.equal(await cleanText(rich.locator('h1')), 'Visual One saved');
    if (process.env.TEST_MARKDOWN) {
        await setSource(await readFile(process.env.TEST_MARKDOWN, 'utf8'));
        await rich.locator('h1').first().click();
        await page.keyboard.press('End');
        await page.keyboard.type(' edited visually');
        await ready();
        const ids = await preview.locator('table tbody tr td:first-child').allTextContents();
        for (let i = 1; i <= 17; i++) {
            assert.equal(
                ids.filter((id) => id === `A${String(i).padStart(2, '0')}`).length,
                1,
                'KamraRadar acceptance rows survive visual serialization',
            );
        }
    }
    await page.locator('#library-toggle').click();
    await page.locator('#library-example').click();
    await page.locator('#library-close').click();
    await ready();
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/visual-editor.png', fullPage: true });
    await page.locator('#theme').click();
    await page.waitForFunction(
        () => getComputedStyle(document.body).backgroundColor === 'rgb(25, 32, 44)',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
    );
    await page.screenshot({ path: 'test-results/visual-editor-mobile.png', fullPage: true });
    // Edits made in source mode while the lazy visual module is loading must win.
    const startup = await browser.newPage();
    await startup.route(/visual-editor-.*\.js$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 350));
        await route.continue();
    });
    await startup.goto(
        `http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`,
        { waitUntil: 'domcontentloaded' },
    );
    await startup.locator('#mode-markdown').click();
    await startup.locator('#markdown').fill('# Source wins during startup');
    await startup.locator('#visual-editor[data-state=ready]').waitFor({ state: 'attached' });
    assert.equal(await startup.locator('#markdown').inputValue(), '# Source wins during startup');
    await startup.locator('#mode-visual').click();
    assert.equal(
        await cleanText(startup.locator('#visual-editor h1')),
        'Source wins during startup',
    );
    await startup.close();
    assert.deepEqual(errors, []);
    console.log(
        'Visual editor checks passed: editing/preview sync, formatting, undo, raw HTML, manual breaks, mode round trips, table rows/columns/reordering/alignment, mobile.',
    );
} catch (error) {
    console.error('Editor state:', await page.locator('#editor-message').textContent());
    throw error;
} finally {
    await browser.close();
    server.close();
}
