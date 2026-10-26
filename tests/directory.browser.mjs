import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { positionFromZoom } from '../src/zoom-scale.js';
import { server } from '../scripts/serve.mjs';

const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
// Exercise real writable handles and IndexedDB handle persistence without an OS picker in CI.
await context.addInitScript(() => {
    const query = FileSystemDirectoryHandle.prototype.queryPermission;
    FileSystemDirectoryHandle.prototype.queryPermission = function (options) {
        return localStorage.getItem('test-denied')
            ? Promise.resolve('prompt')
            : query.call(this, options);
    };
    FileSystemDirectoryHandle.prototype.requestPermission = async function () {
        localStorage.removeItem('test-denied');
        return 'granted';
    };
    window.showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('test-documents', {
            create: true,
        });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const url = `http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`;
const saved = (text) =>
    page.waitForFunction(
        (expected) => document.getElementById('save-state').textContent === expected,
        text,
    );
const folderSaved = () => saved('Saved to folder: test-documents');
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
    'base64',
);
const diskFile = (name) =>
    page.evaluate(async (path) => {
        let dir = await (
            await navigator.storage.getDirectory()
        ).getDirectoryHandle('test-documents');
        const parts = path.split('/');
        const file = parts.pop();
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }
        return (await (await dir.getFileHandle(file)).getFile()).text();
    }, name);
const editDisk = (name, content) =>
    page.evaluate(
        async ({ name, content }) => {
            const dir = await (
                await navigator.storage.getDirectory()
            ).getDirectoryHandle('test-documents');
            const stream = await (await dir.getFileHandle(name, { create: true })).createWritable();
            await stream.write(content);
            await stream.close();
        },
        { name, content },
    );
try {
    await page.goto(url);
    await saved('Saved on this device');
    assert.equal(await page.locator('#zoom').inputValue(), 'fit-height');
    await page.evaluate(async () => {
        const database = await new Promise((resolve) => {
            const request = indexedDB.open('smarter-md-pdf-library');
            request.onsuccess = () => resolve(request.result);
        });
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('workspace', 'readwrite');
            const store = transaction.objectStore('workspace');
            const request = store.get('local');
            request.onsuccess = () => {
                const record = request.result;
                record.snapshot.nodes.find(
                    (node) => node.id === record.snapshot.activeId,
                ).settings.zoom = '100';
                record.revision++;
                store.put(record, 'local');
            };
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    });
    await page.reload();
    await saved('Saved on this device');
    await page.waitForFunction(() => !document.getElementById('print').disabled);
    assert.equal(await page.locator('#zoom').inputValue(), 'fit-height');
    const vertical = page.getByRole('button', { name: 'Fit vertically', exact: true });
    const horizontal = page.getByRole('button', { name: 'Fit horizontally', exact: true });
    assert.equal(await vertical.getAttribute('aria-pressed'), 'true');
    assert.ok(
        await page.evaluate(() => {
            const frame = document.getElementById('preview');
            return (
                frame.contentDocument.querySelector('.sheet').getBoundingClientRect().height <=
                frame.clientHeight - 61
            );
        }),
    );
    await horizontal.click();
    assert.equal(await page.locator('#zoom').inputValue(), 'fit-width');
    assert.equal(await horizontal.getAttribute('aria-pressed'), 'true');
    assert.ok(
        await page.evaluate(() => {
            const frame = document.getElementById('preview');
            return (
                frame.contentDocument.querySelector('.sheet').getBoundingClientRect().width <=
                frame.clientWidth - 47
            );
        }),
    );
    await page
        .getByRole('slider', { name: 'Print preview zoom', exact: true })
        .fill(String(positionFromZoom(125)));
    assert.equal(await page.locator('#zoom').inputValue(), '1.25');
    assert.equal(await horizontal.getAttribute('aria-pressed'), 'false');
    assert.equal(await vertical.getAttribute('aria-pressed'), 'false');
    await vertical.click();
    assert.equal(await page.locator('#zoom').inputValue(), 'fit-height');
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill('# Browser original');
    await saved('Saved on this device');
    await page.locator('#library-toggle').click();
    await page.locator('[data-library-action="new-folder"]').click();
    await page.locator('#library-name').fill('Browser notes');
    await page.locator('#library-submit').click();
    await page.locator('[data-library-action="new-document"]').click();
    await page.locator('#library-name').fill('With image.md');
    await page.locator('#library-submit').click();
    await page
        .locator('#files')
        .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await page.locator('#markdown').fill('# Browser image\n\n![Image](pixel.png)');
    await saved('Saved on this device');
    await page.getByRole('row', { name: 'Open example.md', exact: true }).click();
    await saved('Saved on this device');
    await page.locator('#copy-directory').click();
    await folderSaved();
    assert.equal(await diskFile('example.md'), '# Browser original');
    assert.equal(
        await diskFile('Browser notes/With image.md'),
        '# Browser image\n\n![Image](pixel.png)',
    );
    assert.equal(
        await page.evaluate(async () => {
            const root = await (
                await navigator.storage.getDirectory()
            ).getDirectoryHandle('test-documents');
            const notes = await root.getDirectoryHandle('Browser notes');
            return (await (await notes.getFileHandle('pixel.png')).getFile()).size;
        }),
        png.length,
    );
    await page.locator('#markdown').fill('# Saved on disk');
    await page.locator('#css-template').selectOption('ocean');
    await page.locator('#table-min-rows').fill('5');
    await page.locator('#page-numbers').check();
    await page.locator('#page-number-format').fill('Page {page} of {pages}');
    await page.keyboard.press('Control+s');
    await folderSaved();
    assert.equal(await diskFile('example.md'), '# Saved on disk');
    const metadata = JSON.parse(await diskFile('.md-pdf.json'));
    assert.equal(metadata.documents['example.md'].template, 'ocean');
    assert.equal(metadata.documents['example.md'].settings['table-min-rows'], '5');
    assert.equal(metadata.documents['example.md'].settings['page-numbers'], true);
    assert.equal(
        metadata.documents['example.md'].settings['page-number-format'],
        'Page {page} of {pages}',
    );
    await page.reload();
    await folderSaved();
    assert.equal(await page.locator('#markdown').inputValue(), '# Saved on disk');
    assert.equal(await page.locator('#css-template').inputValue(), 'ocean');
    assert.equal(await page.locator('#table-min-rows').inputValue(), '5');
    assert.equal(await page.locator('#page-numbers').isChecked(), true);
    assert.equal(await page.locator('#page-number-format').inputValue(), 'Page {page} of {pages}');
    await page.locator('#mode-markdown').click();
    await page.locator('#library-toggle').click();
    await page.locator('[data-library-action="new-folder"]').click();
    await page.locator('#library-name').fill('Notes');
    await page.locator('#library-submit').click();
    await folderSaved();
    await page.locator('[data-library-action="new-document"]').click();
    await page.locator('#library-name').fill('Nested.md');
    await page.locator('#library-submit').click();
    await page.locator('#markdown').fill('# Nested');
    await folderSaved();
    assert.equal(await diskFile('Notes/Nested.md'), '# Nested');
    await page
        .locator('#files')
        .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await page.locator('#markdown').fill('# Nested\n\n![Local image](pixel.png)');
    await folderSaved();
    assert.equal(await diskFile('Notes/Nested.md'), '# Nested\n\n![Local image](pixel.png)');
    assert.equal(
        await page.evaluate(async () => {
            const root = await (
                await navigator.storage.getDirectory()
            ).getDirectoryHandle('test-documents');
            const notes = await root.getDirectoryHandle('Notes');
            return (await (await notes.getFileHandle('pixel.png')).getFile()).size;
        }),
        png.length,
    );
    await page.waitForFunction(
        () =>
            document.getElementById('preview').contentDocument.querySelector('.sheet img')
                ?.naturalWidth === 1,
    );
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/local-folder.png', fullPage: true });
    await page.getByRole('row', { name: 'Open example.md', exact: true }).click();
    await folderSaved();
    await editDisk('example.md', '# Changed externally');
    await page.locator('#markdown').fill('# Unsaved conflicting edit');
    await page.waitForFunction(() =>
        document.getElementById('save-state').textContent.includes('changed outside'),
    );
    assert.equal(await diskFile('example.md'), '# Changed externally');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#reload-directory').click();
    await folderSaved();
    assert.equal(await page.locator('#markdown').inputValue(), '# Changed externally');
    await page.evaluate(() => localStorage.setItem('test-denied', 'yes'));
    await page.reload();
    await saved('Saved on this device');
    assert.equal(await page.locator('#markdown').inputValue(), '# Browser original');
    await page.locator('#library-toggle').click();
    assert.equal(await page.locator('#reconnect-directory').isVisible(), true);
    await page.locator('#reconnect-directory').click();
    await folderSaved();
    assert.equal(await page.locator('.library-root .wb-title').textContent(), 'test-documents');
    assert.equal(await page.locator('.library-root').getAttribute('aria-label'), 'test-documents');
    assert.equal(await page.locator('#markdown').inputValue(), '# Changed externally');
    await page.evaluate(() => {
        window.testDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async () => {
            throw new DOMException('Cancelled', 'AbortError');
        };
    });
    await page.locator('#open-directory').click();
    await page.waitForFunction(() => !document.body.inert);
    assert.equal(await page.locator('#markdown').inputValue(), '# Changed externally');
    await page.evaluate(() => {
        window.showDirectoryPicker = window.testDirectoryPicker;
    });
    await page.locator('#browser-library').click();
    await saved('Saved on this device');
    assert.equal(await page.locator('#markdown').inputValue(), '# Browser original');
    await page.locator('#open-directory').click();
    await folderSaved();
    assert.equal(await page.locator('#markdown').inputValue(), '# Changed externally');
    await page.locator('#browser-library').click();
    await saved('Saved on this device');
    assert.equal(
        await page.getByRole('row', { name: 'Select folder Notes', exact: true }).count(),
        0,
    );
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (key === 'directory') {
                throw new DOMException('Handle persistence unavailable', 'DataCloneError');
            }
            return put.call(this, value, key);
        };
    });
    await page.locator('#open-directory').click();
    await page.waitForFunction(() =>
        document.getElementById('save-state').textContent.includes('could not remember'),
    );
    assert.equal(
        await page.locator('#storage-location').textContent(),
        'Storage: local folder “test-documents”',
    );
    assert.equal(
        await page.getByRole('row', { name: 'Select folder Notes', exact: true }).count(),
        1,
    );
    assert.equal(await page.locator('#markdown').inputValue(), '# Changed externally');
    await page.locator('#mode-markdown').click();
    await page.locator('#markdown').fill('# Saved without remembering the folder');
    await folderSaved();
    assert.equal(await diskFile('example.md'), '# Saved without remembering the folder');
    assert.deepEqual(errors, []);
    const unsupported = await browser.newContext();
    await unsupported.addInitScript(() => {
        window.showDirectoryPicker = undefined;
        Object.defineProperty(navigator, 'brave', { value: { isBrave: async () => true } });
    });
    const fallback = await unsupported.newPage();
    await fallback.goto(url);
    await fallback.waitForFunction(
        () => document.getElementById('save-state').textContent === 'Saved on this device',
    );
    await fallback.locator('#library-toggle').click();
    assert.equal(await fallback.locator('#open-directory').isDisabled(), true);
    assert.equal(await fallback.locator('#directory-support').isVisible(), true);
    assert.match(
        await fallback.locator('#directory-support').textContent(),
        /Enable local folder access/,
    );
    assert.equal(
        await fallback.locator('#directory-settings').textContent(),
        'Copy link to Brave settings',
    );
    assert.equal(
        await fallback.locator('#directory-settings').getAttribute('href'),
        'brave://flags/#file-system-access-api',
    );
    await unsupported.grantPermissions(['clipboard-read', 'clipboard-write']);
    await fallback.locator('#directory-settings').click();
    await fallback.waitForFunction(
        () => document.getElementById('directory-settings').getAnimations().length > 0,
    );
    assert.equal(await fallback.locator('#directory-settings-status').count(), 0);
    assert.match(
        await fallback.locator('#directory-settings').getAttribute('title'),
        /block websites from opening internal settings/,
    );
    assert.equal(
        await fallback.evaluate(() => navigator.clipboard.readText()),
        'brave://flags/#file-system-access-api',
    );
    await unsupported.close();
    console.log(
        'Directory browser checks passed: migration, disk autosave, metadata, reconnect, nested files, conflicts and browser fallback.',
    );
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}
