import { positionFromZoom, zoomFromPosition } from './zoom-scale.js';

/** Per-panel display magnification; document styles and print geometry are untouched. */
function control(label, value, onChange, min = 5, max = 300) {
    const root = document.createElement('div');
    root.className = 'zoom-control';
    const text = document.createElement('span');
    text.textContent = 'Zoom';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1000';
    input.step = '1';
    input.setAttribute('aria-label', label);
    const output = document.createElement('output');
    const setValue = (zoom) => {
        input.value = String(positionFromZoom(zoom, min, max));
        output.textContent = Math.round(zoom) + '%';
        input.setAttribute('aria-valuetext', output.textContent);
    };
    setValue(value);
    input.addEventListener('input', () => {
        const zoom = zoomFromPosition(Number(input.value), min, max);
        output.textContent = zoom + '%';
        input.setAttribute('aria-valuetext', output.textContent);
        onChange(zoom);
    });
    root.append(text, input, output);
    return { root, setValue };
}
export function initializePanelZoom(updatePreview) {
    const visual = document.getElementById('visual-editor');
    const markdown = document.getElementById('markdown').closest('.code-editor');
    const editor = document.createElement('div');
    editor.className = 'editor-zoom-content';
    visual.before(editor);
    editor.append(visual, markdown);
    attach(editor, 'Markdown');
    attach(document.getElementById('css').closest('.code-editor'), 'CSS');
    function attach(body, name) {
        const key = 'md-pdf-zoom-' + name;
        let value = 100;
        try {
            const saved = Number(localStorage.getItem(key));
            if (Number.isFinite(saved) && saved > 0) {
                value = Math.min(250, Math.max(20, Math.round(saved)));
            }
        } catch {}
        const apply = (next) => {
            if (name === 'Markdown') {
                visual.style.setProperty('--markdown-content-zoom', next / 100);
                markdown.style.zoom = next / 100;
            } else {
                body.style.zoom = next / 100;
            }
            try {
                localStorage.setItem(key, String(next));
            } catch {}
        };
        const slider = control(name + ' zoom', value, apply, 20, 250);
        body.before(slider.root);
        apply(value);
    }
    const select = document.getElementById('zoom');
    const slider = control('Print preview zoom', 100, (value) => {
        select.value = String(value / 100);
        updatePreview();
    });
    const fitButtons = new Map();
    for (const [mode, label, path] of [
        ['fit-width', 'Fit horizontally', 'M4 4v16M20 4v16M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3'],
        ['fit-height', 'Fit vertically', 'M4 4h16M4 20h16M12 5v14M9 8l3-3 3 3M9 16l3 3 3-3'],
    ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'zoom-fit';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(select.value === mode));
        button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}" /></svg>`;
        button.addEventListener('click', () => {
            select.value = mode;
            updatePreview();
        });
        fitButtons.set(mode, button);
        slider.root.append(button);
    }
    document.querySelector('.preview-toolbar').after(slider.root);
    return (scale) => {
        for (const [mode, button] of fitButtons) {
            button.setAttribute('aria-pressed', String(select.value === mode));
        }
        slider.setValue(scale * 100);
    };
}
