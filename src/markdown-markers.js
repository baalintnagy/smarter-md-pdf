import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

/** Presentation-only Markdown delimiters: never part of source, clipboard, or print DOM. */
export const markdownMarkers = $prose(() => {
    const identities = new WeakMap();
    let nextIdentity = 0;
    let cachedDoc;
    let cachedDecorations;
    return new Plugin({
        props: {
            decorations: (state) => {
                if (state.doc === cachedDoc) {
                    return cachedDecorations;
                }
                const decorations = [];
                let owner;
                let origin;
                const marker = (pos, text, side = -1, block = false) =>
                    decorations.push(
                        Decoration.widget(
                            pos,
                            () => {
                                const span = document.createElement('span');
                                span.className = `markdown-marker${block ? ' code-fence' : ''}`;
                                span.textContent = text;
                                span.setAttribute('aria-hidden', 'true');
                                span.contentEditable = 'false';
                                return span;
                            },
                            {
                                side,
                                ignoreSelection: true,
                                key: JSON.stringify([
                                    identities.get(owner),
                                    pos - origin,
                                    text,
                                    side,
                                    block,
                                ]),
                            },
                        ),
                    );
                state.doc.descendants((node, pos, parent, index) => {
                    if (!identities.has(node)) {
                        identities.set(node, nextIdentity++);
                    }
                    owner = node;
                    origin = pos;
                    if (node.type.name === 'heading') {
                        marker(pos + 1, '#'.repeat(node.attrs.level) + ' ');
                    }
                    if (node.type.name === 'code_block') {
                        marker(pos, '```' + (node.attrs.language || ''), -1, true);
                        marker(pos + node.nodeSize, '```', 1, true);
                    }
                    if (node.type.name === 'hr') {
                        marker(pos, '---', -1, true);
                    }
                    if (node.type.name === 'blockquote') {
                        marker(pos + 2, '> ');
                    }
                    if (node.type.name === 'list_item') {
                        const ordered = parent?.type.name === 'ordered_list';
                        const prefix = ordered ? `${(parent.attrs.order ?? 1) + index}. ` : '- ';
                        marker(pos + 2, prefix);
                    }
                });
                // Group contiguous text with the same mark, so nested marks do not duplicate delimiters.
                state.doc.descendants((parent, pos) => {
                    if (!parent.isTextblock || parent.type.name === 'code_block') {
                        return;
                    }
                    owner = parent;
                    origin = pos;
                    const active = new Map();
                    let offset = 0;
                    const close = (key, end) => {
                        const run = active.get(key);
                        if (!run) {
                            return;
                        }
                        const type = run.mark.type.name;
                        let open = '',
                            shut = '';
                        if (type === 'strong') {
                            open = shut = (run.mark.attrs.marker || '*').repeat(2);
                        }
                        if (type === 'emphasis') {
                            open = shut = run.mark.attrs.marker || '*';
                        }
                        if (type === 'strike_through') {
                            open = shut = '~~';
                        }
                        if (type === 'inlineCode') {
                            open = shut = '`';
                        }
                        if (type === 'link') {
                            open = '[';
                            shut = `](${run.mark.attrs.href})`;
                        }
                        if (open) {
                            marker(run.start, open, -1);
                            marker(end, shut, 1);
                        }
                        active.delete(key);
                    };
                    parent.forEach((child) => {
                        const point = pos + 1 + offset;
                        const marks = new Map(
                            child.marks.map((mark) => [JSON.stringify(mark.toJSON()), mark]),
                        );
                        for (const key of active.keys()) {
                            if (!marks.has(key)) {
                                close(key, point);
                            }
                        }
                        for (const [key, mark] of marks) {
                            if (!active.has(key)) {
                                active.set(key, { mark, start: point });
                            }
                        }
                        offset += child.nodeSize;
                    });
                    for (const key of active.keys()) {
                        close(key, pos + 1 + offset);
                    }
                });
                cachedDoc = state.doc;
                cachedDecorations = DecorationSet.create(state.doc, decorations);
                return cachedDecorations;
            },
        },
    });
});
