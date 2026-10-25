import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
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
page.on('pageerror', (error) => errors.push(error.message));
const rich = page.locator('#visual-editor .ProseMirror');
const preview = page.frameLocator('#preview');
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
    assert.equal(
        await page
            .locator('.app-header')
            .evaluate((header) => getComputedStyle(header).backdropFilter),
        'blur(18px)',
        'Production CSS preserves the standard header backdrop blur',
    );
    const editorWidth = (await page.locator('.controls').boundingBox()).width;
    const previewWidth = (await page.locator('.preview-panel').boundingBox()).width;
    assert.ok(
        editorWidth > previewWidth && Math.abs(editorWidth / previewWidth - 1.1 / 0.9) < 0.05,
        'Editor and preview proportions are swapped',
    );
    assert.ok(
        (await page.locator('main').boundingBox()).width === 1275,
        'Desktop workspace uses 85% of the viewport width',
    );
    assert.ok(
        Math.abs((await page.locator('main').boundingBox()).x - 112.5) < 1,
        'Narrower workspace stays centered',
    );
    const splitter = page.getByRole('separator', { name: 'Resize editor and preview' });
    const handle = await splitter.boundingBox();
    const work = await page.locator('.workspace').boundingBox();
    const originalScroll = await page.evaluate(() => scrollY);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
    await page.mouse.down();
    assert.equal(
        await page.evaluate(() => scrollY),
        originalScroll,
        'Grabbing the splitter does not scroll the page',
    );
    let previousEditorWidth = editorWidth;
    for (let step = 1; step <= 24; step++) {
        const start = handle.x + handle.width / 2;
        const end = work.x + work.width + 150;
        await page.mouse.move(start + ((end - start) * step) / 24, handle.y + 40);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const editor = await page.locator('.controls').boundingBox();
        const panelWidths = await page
            .locator('.controls > .panel')
            .evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().width));
        assert.ok(
            editor.width >= previousEditorWidth - 0.5,
            `Editor does not jump backward while dragging right: ${previousEditorWidth} → ${editor.width}`,
        );
        assert.ok(
            panelWidths.every((width) => Math.abs(width - editor.width) < 1),
            'Editor cards keep the column width throughout the drag',
        );
        assert.ok(
            Math.abs(editor.x - work.x) < 1,
            'Editor stays anchored to the workspace left edge',
        );
        previousEditorWidth = editor.width;
    }
    const rightLimit = await page.locator('.preview-panel').boundingBox();
    assert.ok(
        rightLimit.width >= 299 && rightLimit.width <= 301,
        'Dragging beyond the right edge keeps a stable preview minimum',
    );
    assert.equal(
        await page.evaluate(() => scrollY),
        originalScroll,
        'Dragging to the right limit does not jump vertically',
    );
    assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Dragging to the right limit does not overflow the workspace',
    );
    await page.mouse.move(work.x + work.width * 0.68, handle.y + 40, { steps: 8 });
    await page.mouse.up();
    assert.ok(
        (await page.locator('.controls').boundingBox()).width > editorWidth + 100,
        'Dragging widens the editor',
    );
    assert.equal(
        await page.locator('body').evaluate((node) => node.classList.contains('resizing-columns')),
        false,
    );
    const savedShare = await splitter.getAttribute('aria-valuenow');
    await page.reload();
    await page.locator('#visual-editor[data-state=ready]').waitFor();
    await ready();
    assert.equal(
        await splitter.getAttribute('aria-valuenow'),
        savedShare,
        'Column preference survives reload',
    );
    await splitter.focus();
    await page.keyboard.press('ArrowLeft');
    assert.ok(
        Number(await splitter.getAttribute('aria-valuenow')) < Number(savedShare),
        'Keyboard resizes columns',
    );
    await page.keyboard.press('End');
    assert.ok(
        (await page.locator('.preview-panel').boundingBox()).width >= 299,
        'Preview minimum width is enforced',
    );
    await page.keyboard.press('Enter');
    assert.equal(await splitter.getAttribute('aria-valuenow'), '55', 'Enter resets proportions');
    await page.locator('#library-toggle').click();
    const openWork = await page.locator('.workspace').boundingBox();
    const openHandle = await splitter.boundingBox();
    let openWidth = (await page.locator('.controls').boundingBox()).width;
    await page.mouse.move(openHandle.x + openHandle.width / 2, openHandle.y + 40);
    await page.mouse.down();
    for (let step = 1; step <= 16; step++) {
        const start = openHandle.x + openHandle.width / 2;
        await page.mouse.move(
            start + ((openWork.x + openWork.width + 100 - start) * step) / 16,
            openHandle.y + 40,
        );
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const width = (await page.locator('.controls').boundingBox()).width;
        assert.ok(
            width >= openWidth - 0.5,
            'Right-edge drag stays monotonic with the library open',
        );
        openWidth = width;
    }
    await page.mouse.up();
    await page.locator('#library-toggle').click();
    await splitter.focus();
    await page.keyboard.press('Enter');
    assert.ok(
        (await rich.evaluate((node) => getComputedStyle(node).fontFamily)).includes('Consolas'),
    );
    assert.equal(await page.locator('#css-template').inputValue(), 'grayscale');
    for (const selector of ['h1', 'p', 'a', 'blockquote', 'th']) {
        const color = await preview
            .locator(selector)
            .first()
            .evaluate((node) => getComputedStyle(node).color);
        const channels = color.match(/\d+/g).map(Number);
        assert.ok(
            channels[0] === channels[1] && channels[1] === channels[2],
            `${selector} uses neutral grayscale`,
        );
    }
    assert.ok(
        await page.locator('#css').locator('xpath=..').locator('.hljs-selector-class').count(),
        'CSS source has highlighted selectors',
    );
    await source(
        '# Markers\n\n**Bold** and *italic* and ~~gone~~ and `code` and [link](https://example.com).\n\n> Quote\n\n- Item\n\n```javascript\nconst answer = 42; // comment\n```',
    );
    assert.ok(
        await page.locator('#markdown').locator('xpath=..').locator('.hljs-section').count(),
        'Markdown source is highlighted',
    );
    await page.locator('#mode-visual').click();
    const markers = await rich.locator('.markdown-marker').allTextContents();
    for (const marker of [
        '# ',
        '**',
        '*',
        '~~',
        '`',
        '[',
        '](https://example.com)',
        '> ',
        '- ',
        '```javascript',
        '```',
    ]) {
        assert.ok(markers.includes(marker), `Visible Markdown marker: ${marker}`);
    }
    await rich.locator('.cm-content .syntax-keyword').first().waitFor();
    assert.ok(
        await rich.locator('.cm-content .syntax-number').count(),
        'Visual fenced editor highlights numbers',
    );
    assert.ok(
        await preview.locator('pre code .hljs-keyword').count(),
        'Printed code has syntax token spans',
    );
    assert.equal(
        await preview.locator('.markdown-marker').count(),
        0,
        'Visual delimiters stay out of print',
    );
    await rich.locator('h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await ready();
    const markdown = await page.locator('#markdown').inputValue();
    assert.ok(
        markdown.startsWith('# Markers edited') && !markdown.includes('## Markers'),
        'Decorations do not become duplicate source tokens',
    );
    await page.locator('#css-template').selectOption('ocean');
    await ready();
    assert.equal(
        await preview.locator('h1').evaluate((node) => getComputedStyle(node).color),
        'rgb(21, 60, 98)',
    );
    assert.ok(
        (
            await preview
                .locator('.sheet .document')
                .first()
                .evaluate((node) => getComputedStyle(node).fontFamily)
        ).includes('Georgia'),
    );
    await page.locator('#css-template').selectOption('technical');
    await ready();
    assert.ok(
        (
            await preview
                .locator('.sheet .document')
                .first()
                .evaluate((node) => getComputedStyle(node).fontFamily)
        ).includes('Consolas'),
    );
    await page.locator('#css').fill('.document h1 { color: #123456; }');
    await ready();
    assert.equal(await page.locator('#css-template').inputValue(), 'custom');
    assert.equal(
        await preview.locator('h1').evaluate((node) => getComputedStyle(node).color),
        'rgb(18, 52, 86)',
    );
    await page.locator('#css-template').selectOption('grayscale');
    await ready();
    await page.locator('#library-toggle').click();
    await page.locator('#library-example').click();
    await page.locator('#library-close').click();
    await ready();
    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/blue-studio.png', fullPage: true });
    await page.locator('#theme').click();
    await page.waitForFunction(
        () => getComputedStyle(document.body).backgroundColor === 'rgb(22, 29, 41)',
    );
    await page.waitForFunction(
        () =>
            getComputedStyle(document.querySelector('#visual-editor .ProseMirror')).color ===
            'rgb(213, 222, 235)',
    );
    await page.screenshot({ path: 'test-results/blue-studio-dark.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
        await splitter.isVisible(),
        false,
        'Mobile keeps stacked panels without a splitter',
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'test-results/blue-studio-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
        'Appearance checks passed: widths, monospace, visible syntax markers, source/fence highlighting, grayscale default, CSS templates/customization, dark/mobile layout.',
    );
} finally {
    await browser.close();
    server.close();
}
