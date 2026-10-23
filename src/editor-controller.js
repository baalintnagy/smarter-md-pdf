import { PAGE_BREAK } from './raw-html.js';

/** Coordinates editing modes while the textarea remains the canonical Markdown source. */
export class EditorController {
    constructor({ source, root, onChange, onUpload, resolveImage }) {
        this.source = source;
        this.root = root;
        this.onChange = onChange;
        this.onUpload = onUpload;
        this.resolveImage = resolveImage;
        this.mode = 'visual';
        this.buttons = {
            visual: document.getElementById('mode-visual'),
            markdown: document.getElementById('mode-markdown'),
        };
        this.message = document.getElementById('editor-message');
        this.tableControls = document.getElementById('table-controls');
        for (const [mode, button] of Object.entries(this.buttons)) {
            button.addEventListener('click', () => this.setMode(mode));
        }
        this.tableControls.addEventListener('mousedown', (event) => event.preventDefault());
        this.tableControls.addEventListener('click', (event) => {
            const button = event.target.closest('[data-table-command]');
            if (button) {
                this.editor?.tableCommand(button.dataset.tableCommand);
            }
        });
        document
            .getElementById('insert-page-break')
            .addEventListener('mousedown', (event) => event.preventDefault());
        document
            .getElementById('insert-page-break')
            .addEventListener('click', () => this.insertPageBreak());
        this.setMode('visual');
    }

    async ensureReady() {
        if (!this.loading) {
            this.loading = (async () => {
                const { VisualEditor } = await import('./visual-editor.js');
                const editor = new VisualEditor({
                    root: this.root,
                    source: this.source.value,
                    onUpload: this.onUpload,
                    resolveImage: this.resolveImage,
                    onChange: (markdown) => {
                        this.source.value = markdown;
                        this.onChange();
                    },
                    onTableSelection: (table) => {
                        this.tableControls.hidden = this.mode !== 'visual' || !table;
                        if (table) {
                            for (const button of this.tableControls.querySelectorAll('button')) {
                                const cmd = button.dataset.tableCommand;
                                button.disabled =
                                    (cmd === 'row-up' && table.row <= 1) ||
                                    (cmd === 'row-down' &&
                                        (table.row === 0 || table.row === table.rows - 1)) ||
                                    (cmd === 'column-left' && table.column === 0) ||
                                    (cmd === 'column-right' && table.column === table.columns - 1);
                            }
                        }
                    },
                });
                await editor.create();
                editor.setSource(this.source.value);
                this.editor = editor;
                this.root.dataset.state = 'ready';
                return editor;
            })();
        }
        return this.loading;
    }

    async setMode(mode) {
        this.mode = mode;
        for (const [name, button] of Object.entries(this.buttons)) {
            button.setAttribute('aria-pressed', String(name === mode));
        }
        this.source.hidden = mode !== 'markdown';
        this.root.hidden = mode !== 'visual';
        this.tableControls.hidden = true;
        document.getElementById('editing-label').textContent =
            mode === 'visual' ? 'VISUAL EDITOR' : 'MARKDOWN';
        this.message.textContent =
            mode === 'visual'
                ? 'Loading visual editor…'
                : 'Markdown source · HTML and manual page breaks are preserved.';
        if (mode === 'markdown') {
            return;
        }
        try {
            const editor = await this.ensureReady();
            if (this.mode !== 'visual') {
                return;
            }
            editor.setSource(this.source.value);
            this.message.textContent = '';
        } catch (error) {
            this.loading = null;
            await this.setMode('markdown');
            this.message.textContent = `Visual editor unavailable: ${error.message}. Your Markdown is still editable.`;
        }
    }

    setSource(value) {
        this.source.value = value;
        if (this.mode === 'visual') {
            this.editor?.setSource(value);
        }
    }

    insertPageBreak() {
        if (this.mode === 'visual') {
            this.editor?.insertPageBreak();
            return;
        }
        const start = this.source.selectionStart,
            end = this.source.selectionEnd;
        this.source.setRangeText(`\n\n${PAGE_BREAK}\n\n`, start, end, 'end');
        this.source.focus();
        this.onChange();
    }
}
