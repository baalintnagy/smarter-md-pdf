import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { server } from '../scripts/serve.mjs';
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const url = `http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`;
const saved = (target) =>
    target.waitForFunction(
        () => document.getElementById('save-state').textContent === 'Saved on this device',
    );
const ready = (target) => target.waitForFunction(() => !document.getElementById('print').disabled);
const action = (name) => page.locator(`[data-library-action="${name}"]`).click();
const nameAction = async (actionName, name) => {
    await action(actionName);
    await page.locator('#library-name').fill(name);
    await page.locator('#library-submit').click();
};
const open = (name) => page.getByRole('row', { name: `Open ${name}`, exact: true }).click();
const folder = (name) =>
    page.getByRole('row', { name: `Select folder ${name}`, exact: true }).click();
try {
    await page.goto(url);
    await saved(page);
    await ready(page);
    assert.equal(await page.locator('#library-panel').isVisible(), false);
    await page.locator('#library-toggle').click();
    const root = page.getByRole('row', { name: 'Root', exact: true });
    await root.locator('.wb-expander').click();
    await page
        .getByRole('row', { name: 'Open example.md', exact: true })
        .waitFor({ state: 'hidden' });
    await root.locator('.wb-expander').click();
    await root.click();
    await page.getByRole('row', { name: 'Open example.md', exact: true }).waitFor();
    assert.equal(await page.locator('[data-library-action="delete"]').isDisabled(), true);
    assert.equal(await page.locator('#export-markdown').isDisabled(), true);
    await page.locator('#library-tree').press('ArrowLeft');
    await page.waitForFunction(
        () => document.querySelector('.library-root')?.getAttribute('aria-expanded') === 'false',
    );
    assert.equal(await root.getAttribute('aria-expanded'), 'false');
    await page.locator('#library-tree').press('ArrowRight');
    await page.waitForFunction(
        () => document.querySelector('.library-root')?.getAttribute('aria-expanded') === 'true',
    );
    assert.equal(await root.getAttribute('aria-expanded'), 'true');
    await page.locator('#library-tree').press('ArrowDown');
    await page.waitForFunction(
        () =>
            document.querySelector('.wb-row.wb-active')?.getAttribute('aria-label') ===
            'Open example.md',
    );
    await root.click();
    await nameAction('new-folder', 'Projects');
    assert.equal(await page.locator('#export-markdown').isDisabled(), true);
    await nameAction('new-folder', 'Notes');
    await nameAction('new-document', 'Plan.md');
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill('# Plan\n\nPersistent text');
    await page.locator('#css-template').selectOption('ocean');
    await page.keyboard.press('Control+s');
    await saved(page);
    await ready(page);
    await nameAction('rename', 'Roadmap.md');
    assert.equal(await page.locator('#filename').textContent(), 'Roadmap.md');
    await action('duplicate');
    await ready(page);
    assert.equal(await page.locator('#filename').textContent(), 'Roadmap copy.md');
    await page.locator('#markdown').fill('# Independent copy');
    await saved(page);
    await ready(page);
    await open('Roadmap.md');
    assert.equal(await page.locator('#markdown').inputValue(), '# Plan\n\nPersistent text');
    await action('move');
    await page.locator('#library-destination').selectOption({ label: 'Projects' });
    await page.locator('#library-submit').click();
    assert.equal(
        await page.locator('.wb-row.wb-active .wb-title').getAttribute('title'),
        'Projects / Roadmap.md',
    );
    const row = page.getByRole('row', { name: 'Open Roadmap.md', exact: true });
    await row.dragTo(page.locator('#library-tree'), {
        targetPosition: {
            x: 10,
            y: (await page.locator('#library-tree').boundingBox()).height - 5,
        },
    });
    await saved(page);
    assert.equal(
        await page.locator('.wb-row.wb-active .wb-title').getAttribute('title'),
        'Roadmap.md',
        'Drag to root updates parent',
    );
    assert.equal(await page.locator('#export-markdown').isEnabled(), true);
    assert.equal(await row.locator('.wb-icon.bi-file-earmark').count(), 1);
    assert.equal(await row.locator('.tree-line-branch.tree-line-last').count(), 1);
    assert.equal(
        await row
            .locator('.tree-line-branch')
            .evaluate((node) => getComputedStyle(node, '::after').pointerEvents),
        'none',
        'Tree lines do not intercept clicks or dragging',
    );
    assert.equal(await root.locator('.wb-icon.bi-folder2-open').count(), 1);
    const projects = page.getByRole('row', { name: 'Select folder Projects', exact: true });
    await row.dragTo(projects);
    await page.waitForFunction(
        () =>
            document.querySelector('.wb-row.wb-active .wb-title')?.title ===
            'Projects / Roadmap.md',
    );
    await row.dragTo(root);
    await page.waitForFunction(
        () => document.querySelector('.wb-row.wb-active .wb-title')?.title === 'Roadmap.md',
    );
    await mkdir('test-results', { recursive: true });
    await page
        .locator('#library-panel')
        .screenshot({ path: 'test-results/library-tree-light.png', animations: 'disabled' });
    await page.locator('#theme').click();
    await page.locator('#library-panel').screenshot({
        path: 'test-results/library-tree-dark.png',
        animations: 'disabled',
    });
    await page.locator('#theme').click();
    const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
    await page.locator('#markdown').fill('# With local image\n\n![dot](photo.png)');
    await page.locator('#files').setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.waitForFunction(
        () =>
            document.getElementById('preview').contentDocument.querySelector('.sheet img')
                ?.naturalWidth === 1,
    );
    await saved(page);
    await page.reload();
    await saved(page);
    await ready(page);
    assert.equal(
        await page.locator('#filename').textContent(),
        'Roadmap.md',
        'Active document restored',
    );
    assert.equal(
        await page.locator('#markdown').inputValue(),
        '# With local image\n\n![dot](photo.png)',
    );
    assert.equal(
        await page.locator('#css-template').inputValue(),
        'ocean',
        'Document style restored',
    );
    assert.equal(
        await page
            .frameLocator('#preview')
            .locator('.sheet img')
            .evaluate((node) => node.naturalWidth),
        1,
        'Imported image survives reload',
    );
    await page.locator('#library-toggle').click();
    await folder('Projects');
    await action('duplicate');
    assert.equal(
        await page.locator('.wb-row.wb-active .wb-title').getAttribute('title'),
        'Projects copy',
    );
    await folder('Projects copy');
    const copiedFolder = page.getByRole('row', {
        name: 'Select folder Projects copy',
        exact: true,
    });
    if ((await copiedFolder.getAttribute('aria-expanded')) === 'false') {
        await copiedFolder.locator('.wb-expander').click();
    }
    await page.locator('.wb-title[title="Projects copy / Notes / Roadmap copy.md"]').waitFor();
    assert.ok(
        await page.getByRole('row', { name: 'Open Roadmap copy.md', exact: true }).count(),
        'Folder duplication includes descendants',
    );
    await action('delete');
    await page.locator('#library-cancel').click();
    assert.ok(
        await page.getByRole('row', { name: 'Select folder Projects copy', exact: true }).count(),
        'Delete can be cancelled',
    );
    await action('delete');
    await page.locator('#library-submit').click();
    await saved(page);
    assert.equal(
        await page.getByRole('row', { name: 'Select folder Projects copy', exact: true }).count(),
        0,
    );
    await folder('Projects');
    await action('delete');
    await page.locator('#library-submit').click();
    await saved(page);
    assert.equal(
        await page.getByRole('row', { name: 'Open Roadmap copy.md', exact: true }).count(),
        0,
        'Folder deletion removes nested documents',
    );
    assert.equal(
        await page.locator('#filename').textContent(),
        'Roadmap.md',
        'Deleting another folder keeps the open document',
    );
    await open('Roadmap.md');
    const download = page.waitForEvent('download');
    await page.locator('#export-markdown').click();
    const file = await download;
    assert.equal(
        await readFile(await file.path(), 'utf8'),
        '# With local image\n\n![dot](photo.png)',
    );
    await open('Roadmap.md');
    await action('delete');
    await page.locator('#library-submit').click();
    await saved(page);
    await ready(page);
    assert.equal(await page.locator('#filename').textContent(), 'example.md');
    assert.ok(
        (await page.locator('#markdown').inputValue()).includes(
            'From a rough note to a finished page',
        ),
        'Deleting active file does not overwrite the fallback document',
    );
    await page.reload();
    await saved(page);
    await page.locator('#library-toggle').click();
    assert.equal(
        await page.getByRole('row', { name: 'Open Roadmap.md', exact: true }).count(),
        0,
        'Deletion persists',
    );
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/document-library.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#library-panel').isVisible());
    await page.locator('#library-close').click();
    assert.equal(await page.locator('#library-panel').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1500, height: 1100 });
    // A stale tab must not erase documents saved by another tab.
    const other = await page.context().newPage();
    await other.goto(url);
    await saved(other);
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill('# First tab wins');
    await saved(page);
    await other.locator('#mode-markdown').click();
    await other.locator('#markdown').fill('# Keep this unsaved draft');
    await other.waitForFunction(() =>
        document.getElementById('save-state').classList.contains('error'),
    );
    assert.ok((await other.locator('#save-state').textContent()).includes('another tab'));
    await other.close();
    await page.reload();
    await saved(page);
    assert.equal(await page.locator('#markdown').inputValue(), '# First tab wins');
    // Storage failure is visible without disabling editing or silently claiming success.
    const unavailable = await browser.newPage();
    await unavailable.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
            get: () => {
                throw new Error('Storage denied');
            },
        });
    });
    await unavailable.goto(url);
    await unavailable.waitForFunction(() =>
        document.getElementById('save-state').classList.contains('error'),
    );
    await unavailable.locator('#mode-markdown').click();
    await unavailable.locator('#markdown').fill('# Still editable');
    assert.equal(await unavailable.locator('#markdown').inputValue(), '# Still editable');
    await unavailable.close();
    assert.deepEqual(errors, []);
    console.log(
        'Library checks passed: nested folders, create/rename/duplicate/move/drag/delete, autosave/Ctrl+S, image/style/reload recovery, export, mobile, stale-tab protection, storage errors.',
    );
} finally {
    await browser.close();
    server.close();
}
