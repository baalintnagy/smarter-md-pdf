import hljs from 'highlight.js/lib/common';

/** Escapes source and adds token spans; unknown fence languages remain plain text. */
export function highlightCode(source, language) {
    return hljs.getLanguage(language)
        ? hljs.highlight(source, { language, ignoreIllegals: true }).value
        : hljs.highlight(source, { language: 'plaintext' }).value;
}

/** Native textarea editing with a synchronized, non-interactive syntax layer. */
export class HighlightedSource {
    constructor(textarea, language) {
        this.textarea = textarea;
        this.language = language;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-editor';
        textarea.before(wrapper);
        wrapper.append(textarea);
        this.layer = document.createElement('pre');
        this.layer.className = 'source-highlight';
        this.layer.setAttribute('aria-hidden', 'true');
        wrapper.prepend(this.layer);
        textarea.addEventListener('input', () => this.sync());
        textarea.addEventListener('scroll', () => this.scroll());
        new ResizeObserver(() => this.scroll()).observe(textarea);
        new MutationObserver(() => this.sync()).observe(textarea, {
            attributes: true,
            attributeFilter: ['hidden'],
        });
        this.sync();
    }
    sync() {
        if (this.last !== this.textarea.value) {
            this.last = this.textarea.value;
            this.layer.innerHTML = highlightCode(this.last, this.language) + '\n';
        }
        this.layer.parentElement.hidden = this.textarea.hidden;
        this.scroll();
    }
    scroll() {
        this.layer.scrollTop = this.textarea.scrollTop;
        this.layer.scrollLeft = this.textarea.scrollLeft;
    }
}
