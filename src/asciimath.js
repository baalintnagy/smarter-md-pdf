/** Balanced inline delimiters allow AsciiMath groups such as @{sqrt({x + 1})}. */
export function inlineAsciiMath(source) {
    if (!source.startsWith('@{')) {
        return;
    }
    let depth = 1;
    let quoted = false;
    for (let index = 2; index < source.length; index++) {
        const character = source[index];
        if (character === '\n' || character === '\r') {
            return;
        }
        if (character === '\\') {
            if (source[index + 1] === '\n' || source[index + 1] === '\r') {
                return;
            }
            index++;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (!quoted && character === '{') {
            depth++;
        } else if (!quoted && character === '}') {
            depth--;
            if (!depth) {
                const text = source.slice(2, index);
                if (text.trim()) {
                    return { type: 'inlineAsciiMath', raw: source.slice(0, index + 1), text };
                }
                return;
            }
        }
    }
}
