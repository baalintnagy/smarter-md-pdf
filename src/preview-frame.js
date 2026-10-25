import { DOCUMENT_CSS } from './document-style.js';
import { installMathStyles } from './print-extensions.js';

/** Build the isolated print document independently of application controls. */
export function initializePreviewFrame(frame) {
    const document = frame.contentDocument;
    const canvas = getComputedStyle(frame.ownerDocument.documentElement).getPropertyValue(
        '--canvas',
    );
    document.documentElement.style.cssText = `background-color:${canvas};transition:background-color 800ms ease;`;
    const base = document.createElement('style');
    base.textContent = DOCUMENT_CSS;
    document.head.append(base);
    installMathStyles(document);
    for (const id of ['custom-style', 'print-style']) {
        const style = document.createElement('style');
        style.id = id;
        document.head.append(style);
    }
    const staging = document.createElement('div');
    staging.id = 'staging';
    staging.className = 'document';
    staging.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
    document.body.append(staging);
    const root = document.createElement('div');
    root.id = 'pages';
    document.body.append(root);
    return document;
}

export function updatePreviewZoom(frame, pages, mode, syncPreviewZoom) {
    if (!pages.length) {
        return;
    }
    const available = Math.max(100, frame.clientWidth - 48);
    const pageWidth = pages[0].sheet.offsetWidth;
    const requestedScale =
        mode === 'fit-height'
            ? Math.max(1, frame.clientHeight - 62) / pages[0].sheet.offsetHeight
            : mode === 'fit-width' || mode === 'fit'
              ? available / pageWidth
              : Number(mode);
    const scale = Math.min(3, Math.max(0.05, requestedScale));
    frame.contentDocument
        .getElementById('pages')
        .style.setProperty('--preview-page-width', `${pageWidth * scale}px`);
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
