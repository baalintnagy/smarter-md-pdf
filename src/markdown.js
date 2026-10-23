import { Marked } from '../vendor/marked.esm.js';
import { highlightCode } from './code-highlighting.js';

// Tokens preserve TeX backslashes before ordinary Markdown escaping takes place.
const escapeHTML = (value) =>
    value.replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
const mathToken = (name, level, pattern, start) => ({
    name,
    level,
    start,
    tokenizer(source) {
        const match = source.match(pattern);
        if (match) {
            return { type: name, raw: match[0], text: match[1] ?? match[2] };
        }
    },
    renderer(token) {
        return `<${level === 'block' ? 'div' : 'span'} class="math-source${level === 'block' ? ' math-display' : ''}">${escapeHTML(token.text)}</${level === 'block' ? 'div' : 'span'}>`;
    },
});
const marked = new Marked({
    extensions: [
        mathToken(
            'displayMath',
            'block',
            /^ {0,3}\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)|^ {0,3}\\\[([\s\S]+?)\\\](?:\n|$)/,
            (source) => source.search(/\$\$|\\\[/),
        ),
        mathToken(
            'inlineMath',
            'inline',
            /^\$(?!\$)([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)|^\\\(([\s\S]+?)\\\)/,
            (source) => source.search(/\$(?!\$)|\\\(/),
        ),
    ],
});

const ALLOWED = new Set(
    'A ABBR B BLOCKQUOTE BR CAPTION CODE COL COLGROUP DD DEL DETAILS DIV DL DT EM FIGCAPTION FIGURE H1 H2 H3 H4 H5 H6 HR I IMG INPUT KBD LI MARK OL P PRE S SAMP SECTION SMALL SPAN STRONG SUB SUMMARY SUP TABLE TBODY TD TFOOT TH THEAD TR U UL'.split(
        ' ',
    ),
);
const ATTRIBUTES = new Set([
    'class',
    'title',
    'alt',
    'colspan',
    'rowspan',
    'start',
    'reversed',
    'align',
    'open',
]);
const REMOVE = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'SVG',
    'MATH',
    'TEMPLATE',
    'LINK',
    'META',
    'BASE',
    'FORM',
]);

function safeURL(value, image) {
    if (/^[\u0000-\u0020]*#/.test(value)) {
        return !image;
    }
    try {
        const url = new URL(value, 'https://local.invalid/');
        return (
            image ? ['https:', 'http:', 'blob:'] : ['https:', 'http:', 'mailto:', 'tel:']
        ).includes(url.protocol);
    } catch {
        return false;
    }
}

/** Rebuild an allowlisted tree; imported HTML never enters the live DOM unsanitized. */
export class MarkdownRenderer {
    render(source, document, assets = new Map()) {
        const parsed = new DOMParser().parseFromString(
            marked.parse(source, { gfm: true }),
            'text/html',
        );
        let missingImages = 0;
        const clean = (node) => {
            if (node.nodeType === 3) {
                return document.createTextNode(node.textContent);
            }
            if (node.nodeType !== 1 || REMOVE.has(node.tagName)) {
                return document.createDocumentFragment();
            }
            const result = ALLOWED.has(node.tagName)
                ? document.createElement(node.tagName.toLowerCase())
                : document.createDocumentFragment();
            if (result.nodeType === 1) {
                for (const attr of node.attributes) {
                    if (ATTRIBUTES.has(attr.name)) {
                        result.setAttribute(attr.name, attr.value);
                    }
                }
                if (node.tagName === 'A' && safeURL(node.getAttribute('href') || '', false)) {
                    result.href = node.getAttribute('href');
                    result.target = '_blank';
                    result.rel = 'noopener noreferrer';
                }
                if (node.tagName === 'IMG') {
                    const original = node.getAttribute('src') || '';
                    let key = original;
                    try {
                        key = decodeURIComponent(original).replace(/^\.\//, '');
                    } catch {
                        /* Keep malformed paths as visible missing images. */
                    }
                    const src = assets.get(key) || assets.get(key.split('/').at(-1)) || original;
                    if (
                        safeURL(src, true) &&
                        (!src.startsWith('blob:') || [...assets.values()].includes(src))
                    ) {
                        if (
                            !assets.has(key) &&
                            !/^https?:/i.test(src) &&
                            !src.startsWith('blob:')
                        ) {
                            missingImages++;
                        } else {
                            result.src = src;
                        }
                    } else {
                        missingImages++;
                    }
                }
                if (node.tagName === 'INPUT') {
                    result.type = 'checkbox';
                    result.disabled = true;
                    result.checked = node.hasAttribute('checked');
                }
            }
            for (const child of node.childNodes) {
                result.append(clean(child));
            }
            return result;
        };
        const fragment = document.createDocumentFragment();
        for (const node of parsed.body.childNodes) {
            if (node.nodeType === 3 && !node.textContent.trim()) {
                continue;
            }
            fragment.append(clean(node));
        }
        for (const code of fragment.querySelectorAll('pre > code')) {
            const language =
                [...code.classList].find((name) => name.startsWith('language-'))?.slice(9) ||
                'plaintext';
            code.innerHTML = highlightCode(code.textContent, language);
        }
        return { fragment, missingImages };
    }
}
