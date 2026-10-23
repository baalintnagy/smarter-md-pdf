import { $node, $remark } from '@milkdown/kit/utils';

export const PAGE_BREAK = '<div class="page-break"></div>';
export const isPageBreak = (value) =>
    /^<div\s+class=["']page-break["']\s*>\s*<\/div>\s*$/i.test(value.trim());

// Block HTML must remain a block atom, not an inline node dropped by the schema.
// Never inject its HTML into the editable DOM; retain the exact source as an attribute.
const preserveBlockHTML = $remark('preserve-block-html', () => () => (tree) => {
    const visit = (parent) => {
        for (const node of parent.children || []) {
            if (node.type === 'html' && parent.type !== 'paragraph') {
                node.type = 'rawHtmlBlock';
            } else {
                visit(node);
            }
        }
    };
    visit(tree);
});

export const rawHTMLNode = $node('raw_html_block', () => ({
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { value: { default: '' } },
    toDOM: (node) => [
        'div',
        {
            class: `preserved-html${isPageBreak(node.attrs.value) ? ' manual-page-break' : ''}`,
            'data-raw-html': node.attrs.value,
            contenteditable: 'false',
        },
        isPageBreak(node.attrs.value)
            ? 'PAGE BREAK'
            : `HTML · edit in Markdown\n${node.attrs.value}`,
    ],
    parseDOM: [
        { tag: 'div[data-raw-html]', getAttrs: (element) => ({ value: element.dataset.rawHtml }) },
    ],
    parseMarkdown: {
        match: (node) => node.type === 'rawHtmlBlock',
        runner: (state, node, type) => state.addNode(type, { value: node.value }),
    },
    toMarkdown: {
        match: (node) => node.type.name === 'raw_html_block',
        runner: (state, node) => state.addNode('html', undefined, node.attrs.value),
    },
}));

export const rawHTML = [preserveBlockHTML, rawHTMLNode].flat();
