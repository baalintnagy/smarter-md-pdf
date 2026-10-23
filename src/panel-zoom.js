/** Per-panel display magnification; document styles and print geometry are untouched. */
function control(label, value, onChange) {
    const root = document.createElement('label');
    root.className = 'zoom-control';
    const text = document.createElement('span');
    text.textContent = 'Zoom';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '10';
    input.max = '1000';
    input.step = '10';
    input.value = value;
    input.setAttribute('aria-label', label);
    const output = document.createElement('output');
    output.textContent = value + '%';
    input.addEventListener('input', () => {
        output.textContent = input.value + '%';
        onChange(Number(input.value));
    });
    root.append(text, input, output);
    return { root, input, output };
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
        const key = 'md-office-zoom-' + name;
        let value = 100;
        try {
            const saved = Number(localStorage.getItem(key));
            if (saved >= 10 && saved <= 1000) {
                value = saved;
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
        const slider = control(name + ' zoom', value, apply);
        body.before(slider.root);
        apply(value);
    }
    const select = document.getElementById('zoom');
    const slider = control('Print preview zoom', 100, (value) => {
        select.value = String(value / 100);
        select.dispatchEvent(new Event('change'));
        updatePreview();
    });
    document.querySelector('.preview-toolbar').after(slider.root);
    return (scale) => {
        slider.input.value = String(Math.round(scale * 100));
        slider.output.textContent = Math.round(scale * 100) + '%';
    };
}
