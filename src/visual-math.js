import { $node, $remark } from '@milkdown/kit/utils';
import remarkMath from 'remark-math';

const parseMath = $remark('preserve-math-source', () => remarkMath);

// Keep TeX out of Markdown prose parsing so unrelated edits cannot escape its syntax.
const mathNode = (name, markdownType, block) =>
    $node(name, () => ({
        group: block ? 'block' : 'inline',
        inline: !block,
        atom: true,
        selectable: true,
        attrs: { value: { default: '' } },
        toDOM: (node) => [
            block ? 'div' : 'span',
            {
                class: 'preserved-math',
                'data-math-source': node.attrs.value,
                'data-math-display': String(block),
                contenteditable: 'false',
                title: 'Edit formula in Markdown mode',
            },
            block ? `$$\n${node.attrs.value}\n$$` : `$${node.attrs.value}$`,
        ],
        parseDOM: [
            {
                tag: `${block ? 'div' : 'span'}[data-math-source][data-math-display="${block}"]`,
                getAttrs: (element) => ({ value: element.dataset.mathSource }),
            },
        ],
        parseMarkdown: {
            match: (node) => node.type === markdownType,
            runner: (state, node, type) => state.addNode(type, { value: node.value }),
        },
        toMarkdown: {
            match: (node) => node.type.name === name,
            runner: (state, node) => state.addNode(markdownType, undefined, node.attrs.value),
        },
    }));

export const visualMath = [
    parseMath,
    mathNode('preserved_inline_math', 'inlineMath', false),
    mathNode('preserved_block_math', 'math', true),
].flat();
