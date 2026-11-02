const escapeHTML = (value) =>
    value.replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );

function inlineMath(source) {
    const parenthesized = source.match(/^\\\(([\s\S]+?)\\\)/);
    if (parenthesized) {
        return { type: 'inlineMath', raw: parenthesized[0], text: parenthesized[1] };
    }
    const opening = source.match(/^(\${1,2})(?!\$)/);
    if (!opening) {
        return;
    }
    const delimiter = opening[1];
    const literal = () => ({ type: 'text', raw: delimiter, text: delimiter });
    if (delimiter === '$' && /\s/.test(source[1] ?? '')) {
        return literal();
    }
    for (let index = delimiter.length; index < source.length; index++) {
        if (source[index] === '\n' || source[index] === '\r') {
            return literal();
        }
        if (source[index] === '\\') {
            index++;
            continue;
        }
        if (source[index] !== '$') {
            continue;
        }
        const run = source.slice(index).match(/^\$+/)[0];
        if (run === delimiter) {
            const text = source.slice(delimiter.length, index);
            if (!text.trim()) {
                return literal();
            }
            if (delimiter === '$' && (/\s$/.test(text) || /\d/.test(source[index + 1] ?? ''))) {
                return literal();
            }
            return {
                type: 'inlineMath',
                raw: source.slice(0, index + delimiter.length),
                text: text.trim(),
            };
        }
        index += run.length - 1;
    }
    return literal();
}

/** Block hints must start on a line, never inside prose or a backtick code span. */
export const mathExtensions = [
    {
        name: 'displayMath',
        level: 'block',
        start(source) {
            // Marked passes source.slice(1) to block start hints. Its first character
            // is therefore not a line start; only an actual newline can introduce one.
            const index = source.search(/\n {0,3}(?:\$\$(?!\$)|\\\[)/);
            return index < 0 ? -1 : index + 1;
        },
        tokenizer(source) {
            const match = source.match(
                /^ {0,3}\$\$(?!\$)[ \t]*\n?([\s\S]+?)\n?\$\$(?!\$)[ \t]*(?:\n|$)|^ {0,3}\\\[([\s\S]+?)\\\](?:\n|$)/,
            );
            if (match) {
                return { type: 'displayMath', raw: match[0], text: match[1] ?? match[2] };
            }
        },
        renderer: (token) =>
            `<div class="math-source math-display">${escapeHTML(token.text)}</div>`,
    },
    {
        name: 'inlineMath',
        level: 'inline',
        start: (source) => source.search(/(?<!\$)\${1,2}(?!\$)|\\\(/),
        tokenizer: inlineMath,
        renderer: (token) => `<span class="math-source">${escapeHTML(token.text)}</span>`,
    },
];
