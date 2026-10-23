import { initializePanelZoom } from './panel-zoom.js';
import { installMathStyles, renderPrintExtensions } from './print-extensions.js';
import { PRESETS, validateSettings } from './settings.js';
import { MarkdownRenderer } from './markdown.js';
import { Paginator } from './paginator.js';
import { DOCUMENT_CSS } from './document-style.js';
import { FileLibrary } from './files.js';
import { SAMPLE } from './sample.js';
import { EditorController } from './editor-controller.js';
import { CSS_TEMPLATES, DEFAULT_TEMPLATE } from './css-templates.js';
import { HighlightedSource } from './code-highlighting.js';
import './code-editors.css';
import { initializeColumnSplitter } from './column-splitter.js';
import { DocumentLibrary } from './document-library.js';

const $ = (id) => document.getElementById(id);
const frame = $('preview');
const library = new FileLibrary();
const renderer = new MarkdownRenderer();
initializeColumnSplitter(document.querySelector('.workspace'), $('column-splitter'));
let activeDocument = { name: 'example.md', source: SAMPLE };
let revision = 0;
let timer;
let previewDocument;
let pages = [];
let rendering = false;
let rerender = false;
let importing = false;
let documentLibrary;
let syncPreviewZoom;

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('theme').title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
    $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    try {
        localStorage.setItem('smarter-theme', theme);
    } catch {
        /* Storage is optional. */
    }
    if (previewDocument) {
        previewDocument.documentElement.style.backgroundColor = getComputedStyle(
            document.documentElement,
        ).getPropertyValue('--canvas');
    }
}
let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
try {
    theme = localStorage.getItem('smarter-theme') || theme;
} catch {
    /* Use OS preference. */
}
setTheme(theme);
$('theme').addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
);

function settings() {
    const scaleMode = $('scale-mode').value;
    return validateSettings({
        width: $('width').valueAsNumber,
        height: $('height').valueAsNumber,
        margin: $('margin').valueAsNumber,
        minScale: scaleMode === 'auto' ? 90 : $('min-scale').valueAsNumber,
        maxScale: scaleMode === 'auto' ? 100 : $('max-scale').valueAsNumber,
        scaleMode,
        smart: $('smart').checked,
    });
}
function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
}
function schedule() {
    codeEditors.forEach((editor) => editor.sync());
    documentLibrary?.changed();
    revision++;
    $('print').disabled = true;
    status('Updating pages…');
    clearTimeout(timer);
    timer = setTimeout(render, 220);
}
async function waitForImages(root) {
    let failures = 0;
    await Promise.all(
        [...root.querySelectorAll('img')].map(
            (image) =>
                new Promise((resolve) => {
                    let finished = false;
                    const done = (failed) => {
                        if (finished) {
                            return;
                        }
                        finished = true;
                        clearTimeout(timeout);
                        if (failed) {
                            failures++;
                        } else {
                            image.width = image.naturalWidth;
                            image.height = image.naturalHeight;
                        }
                        image.removeEventListener('load', loaded);
                        image.removeEventListener('error', errored);
                        resolve();
                    };
                    const loaded = () => done(false);
                    const errored = () => done(true);
                    const timeout = setTimeout(() => {
                        image.removeAttribute('src');
                        done(true);
                    }, 5000);
                    if (image.complete) {
                        done(!image.naturalWidth);
                    } else {
                        image.addEventListener('load', loaded);
                        image.addEventListener('error', errored);
                    }
                }),
        ),
    );
    return failures;
}
async function render() {
    if (!previewDocument || importing) {
        return;
    }
    if (rendering) {
        rerender = true;
        return;
    }
    rendering = true;
    const version = revision;
    $('print').disabled = true;
    try {
        const options = settings();
        const doc = previewDocument;
        doc.getElementById('custom-style').textContent = $('css').value;
        doc.getElementById('print-style').textContent =
            `@page { size:${options.width}mm ${options.height}mm; margin:0; }`;
        const { fragment, missingImages } = renderer.render(
            $('markdown').value,
            doc,
            library.assets,
        );
        // Measure in the frame, after fonts and local/remote images settle.
        const staging = doc.getElementById('staging');
        staging.style.width = `${options.width - 2 * options.margin}mm`;
        staging.replaceChildren(fragment);
        const extensionWarnings = await renderPrintExtensions(staging);
        await doc.fonts.ready;
        const failedImages = await waitForImages(staging);
        if (version !== revision) {
            return;
        }
        const content = doc.createDocumentFragment();
        content.append(...staging.childNodes);
        const result = new Paginator(doc).paginate(content, options);
        if (options.scaleMode === 'auto') {
            $('min-scale').value = result.scaleRange.minScale;
            $('max-scale').value = result.scaleRange.maxScale;
        }
        $('scale-help').textContent =
            `${options.scaleMode === 'auto' ? 'Calculated readable range' : 'Custom range'}: ${result.scaleRange.minScale}–${result.scaleRange.maxScale}%. Selected blocks shrink only when needed. Tables split with at least 3 rows per fragment when space permits.`;
        await waitForImages(doc.getElementById('pages'));
        if (version !== revision) {
            return;
        }
        pages = result.pages;
        updateZoom();
        $('page-count').textContent = `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`;
        const warnings = [...result.warnings, ...extensionWarnings];
        if (missingImages || failedImages) {
            warnings.push(
                `${missingImages + failedImages} image(s) unavailable. Import matching image files or check their URLs.`,
            );
        }
        status(
            warnings.length
                ? warnings.join(' ')
                : `${options.width} × ${options.height} mm · ${options.margin} mm margins · Ready to print`,
            warnings.length > 0,
        );
        // Impossible layouts require a correction before printing, preventing silent content loss.
        $('print').disabled = result.warnings.length > 0;
        activeDocument.source = $('markdown').value;
        $('word-count').textContent =
            `${$('markdown').value.trim().split(/\s+/).filter(Boolean).length} words`;
    } catch (error) {
        status(error.message, true);
        $('page-count').textContent = 'Check settings';
    } finally {
        rendering = false;
        if (rerender || version !== revision) {
            rerender = false;
            clearTimeout(timer);
            timer = setTimeout(render, 0);
        }
    }
}

function updateZoom() {
    if (!pages.length) {
        return;
    }
    const available = Math.max(100, frame.clientWidth - 48);
    const pageWidth = pages[0].sheet.offsetWidth;
    const scale =
        $('zoom').value === 'fit' ? Math.min(1, available / pageWidth) : Number($('zoom').value);
    syncPreviewZoom?.(scale);
    for (const page of pages) {
        page.sheet.style.transformOrigin = 'top left';
        page.sheet.style.transform = `scale(${scale})`;
        page.slot.style.width = `${page.sheet.offsetWidth * scale}px`;
        page.slot.style.height = `${page.sheet.offsetHeight * scale + 24}px`;
        page.slot.querySelector('.page-caption').style.cssText =
            `position:absolute;top:${page.sheet.offsetHeight * scale}px;width:100%`;
    }
}

frame.addEventListener('load', () => {
    previewDocument = frame.contentDocument;
    previewDocument.documentElement.style.cssText = `background-color:${getComputedStyle(document.documentElement).getPropertyValue('--canvas')};transition:background-color 800ms ease;`;
    const base = previewDocument.createElement('style');
    base.textContent = DOCUMENT_CSS;
    previewDocument.head.append(base);
    installMathStyles(previewDocument);
    for (const id of ['custom-style', 'print-style']) {
        const style = previewDocument.createElement('style');
        style.id = id;
        previewDocument.head.append(style);
    }
    const staging = previewDocument.createElement('div');
    staging.id = 'staging';
    staging.className = 'document';
    staging.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
    previewDocument.body.append(staging);
    const root = previewDocument.createElement('div');
    root.id = 'pages';
    previewDocument.body.append(root);
    render();
});
frame.srcdoc =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Markdown document</title></head><body></body></html>';

$('markdown').value = SAMPLE;
$('css').value = DEFAULT_TEMPLATE.css;
$('filename').textContent = activeDocument.name;
for (const template of [...CSS_TEMPLATES, { id: 'custom', name: 'Custom CSS' }]) {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    $('css-template').append(option);
}
$('css-template').value = DEFAULT_TEMPLATE.id;
const codeEditors = [
    new HighlightedSource($('markdown'), 'markdown'),
    new HighlightedSource($('css'), 'css'),
];
$('css-template').addEventListener('change', () => {
    const template = CSS_TEMPLATES.find((item) => item.id === $('css-template').value);
    if (template) {
        $('css').value = template.css;
        schedule();
    }
});
$('css').addEventListener('input', () => {
    $('css-template').value = 'custom';
});
const editor = new EditorController({
    source: $('markdown'),
    root: $('visual-editor'),
    onChange: schedule,
    onUpload: async (file) => {
        if (!file.type.startsWith('image/') || /svg/i.test(file.type)) {
            throw new Error('Choose a raster image such as PNG, JPEG, or WebP.');
        }
        await library.import([file]);
        schedule();
        return file.name;
    },
    resolveImage: (url) => {
        let key = url;
        try {
            key = decodeURIComponent(url).replace(/^\.\//, '');
        } catch {
            /* Retain the original path. */
        }
        const asset = library.assets.get(key) || library.assets.get(key.split('/').at(-1));
        if (asset) {
            return asset;
        }
        try {
            return ['https:', 'http:'].includes(new URL(url).protocol) ? url : '';
        } catch {
            return '';
        }
    },
});
const savedFields = [
    'preset',
    'orientation',
    'width',
    'height',
    'margin',
    'min-scale',
    'max-scale',
    'smart',
    'scale-mode',
    'zoom',
];
const captureDocument = () => ({
    source: $('markdown').value,
    css: $('css').value,
    template: $('css-template').value,
    settings: Object.fromEntries(
        savedFields.map((id) => [id, id === 'smart' ? $(id).checked : $(id).value]),
    ),
});
documentLibrary = new DocumentLibrary({
    assets: library,
    initial: { name: 'example.md', ...captureDocument() },
    capture: captureDocument,
    onTreeChange: (model) => {
        library.documents = library.documents.filter((item) => model.get(item.id));
        $('documents').replaceChildren();
        library.documents.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = model.get(item.id).name;
            $('documents').append(option);
        });
        $('documents').hidden = library.documents.length < 2;
        const selected = library.documents.findIndex((item) => item.id === model.activeId);
        $('documents').value = selected < 0 ? '' : String(selected);
    },
    onOpen: (file) => {
        activeDocument = file;
        editor.setSource(file.source);
        $('css').value = file.css ?? DEFAULT_TEMPLATE.css;
        $('css-template').value = CSS_TEMPLATES.some((template) => template.id === file.template)
            ? file.template
            : 'custom';
        for (const [id, value] of Object.entries(file.settings || {})) {
            if (savedFields.includes(id)) {
                if (id === 'smart') {
                    $(id).checked = value;
                } else {
                    $(id).value = value;
                }
            }
        }
        $('filename').textContent = file.name;
        const importedIndex = library.documents.findIndex((item) => item.id === file.id);
        $('documents').value = importedIndex < 0 ? '' : String(importedIndex);
        schedule();
    },
});
for (const id of [
    'markdown',
    'css',
    'width',
    'height',
    'margin',
    'min-scale',
    'max-scale',
    'smart',
    'scale-mode',
]) {
    $(id).addEventListener('input', () => {
        if (['width', 'height'].includes(id)) {
            $('preset').value = 'Custom';
        }
        if (['min-scale', 'max-scale'].includes(id)) {
            $('scale-mode').value = 'manual';
        }
        schedule();
    });
}
$('preset').addEventListener('change', () => {
    const dimensions = PRESETS[$('preset').value];
    if (dimensions) {
        const [w, h] =
            $('orientation').value === 'landscape' ? [...dimensions].reverse() : dimensions;
        $('width').value = w;
        $('height').value = h;
    }
    schedule();
});
$('orientation').addEventListener('change', () => {
    const w = $('width').value;
    $('width').value = $('height').value;
    $('height').value = w;
    schedule();
});
$('zoom').addEventListener('change', updateZoom);
new ResizeObserver(updateZoom).observe(frame);
const loadExample = async () => {
    await documentLibrary.initialized;
    documentLibrary.addDocument('example.md', SAMPLE);
};
$('sample').addEventListener('click', loadExample);
$('library-example').addEventListener('click', loadExample);
async function importFiles(files) {
    importing = true;
    revision++;
    clearTimeout(timer);
    $('print').disabled = true;
    status('Reading local files…');
    try {
        await documentLibrary.initialized;
        activeDocument.source = $('markdown').value;
        const imported = await library.import(files);
        for (const item of imported) {
            const saved = documentLibrary.model.create(
                'document',
                item.name,
                documentLibrary.destination(),
                { ...captureDocument(), source: item.source },
            );
            Object.assign(item, saved);
        }
        $('documents').replaceChildren();
        library.documents.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = item.name;
            $('documents').append(option);
        });
        $('documents').hidden = library.documents.length < 2;
        if (imported.length) {
            documentLibrary.activate(imported[0].id);
        }
        schedule();
    } catch (error) {
        status(`Could not read files: ${error.message}`, true);
    } finally {
        importing = false;
    }
}
$('files').addEventListener('change', async (event) => {
    await importFiles(event.target.files);
    event.target.value = '';
});
$('documents').addEventListener('change', () => {
    const item = library.documents[Number($('documents').value)];
    if (item) {
        documentLibrary.activate(item.id);
    }
});
$('css-file').addEventListener('change', async (event) => {
    try {
        if (event.target.files[0]) {
            $('css').value = await event.target.files[0].text();
            $('css-template').value = 'custom';
            schedule();
        }
    } catch (error) {
        status(error.message, true);
    }
    event.target.value = '';
});
document.addEventListener('dragover', (event) => {
    if (
        event.defaultPrevented ||
        !event.dataTransfer.types.includes('Files') ||
        event.target.closest('#visual-editor')
    ) {
        return;
    }
    event.preventDefault();
    document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) {
        document.body.classList.remove('dragging');
    }
});
document.addEventListener('drop', (event) => {
    document.body.classList.remove('dragging');
    if (event.defaultPrevented || !event.dataTransfer.types.includes('Files')) {
        return;
    }
    if (
        event.target.closest('#visual-editor') &&
        ![...event.dataTransfer.files].some((file) => /\.(md|markdown|txt)$/i.test(file.name))
    ) {
        return;
    }
    event.preventDefault();
    importFiles(event.dataTransfer.files);
});
$('print').addEventListener('click', () => {
    previewDocument.title = activeDocument.name.replace(/\.(md|markdown|txt)$/i, '') || 'document';
    status(
        'Choose Save as PDF, use the matching paper size, 100% scale, and disable browser headers and footers.',
    );
    frame.contentWindow.focus();
    frame.contentWindow.print();
});
window.addEventListener('pagehide', () => library.dispose());

syncPreviewZoom = initializePanelZoom(updateZoom);

// Keep sticky content below the header as its height changes on smaller screens.
new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty(
        '--header-height',
        entry.target.getBoundingClientRect().height + 'px',
    );
}).observe(document.querySelector('.app-header'));
