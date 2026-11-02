const PX_PER_PT = 96 / 72;

/** Absolute output scale needed to preserve readable type; preview zoom is irrelevant. */
export function readableFloor(node, document) {
    const dense = /^(TABLE|PRE)$/.test(node.tagName);
    const samples = [node, ...node.querySelectorAll('*')].filter((item) =>
        [...item.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()),
    );
    const sizes = samples
        .map((item) => parseFloat(document.defaultView.getComputedStyle(item).fontSize))
        .filter(Number.isFinite);
    return Math.min(1, ((dense ? 8.5 : 9) * PX_PER_PT) / Math.min(...sizes, Infinity));
}

export function automaticScaleRange(nodes, document) {
    const candidates = nodes.filter(
        (node) =>
            node.nodeType === 1 &&
            /^(P|TABLE|PRE|UL|OL|BLOCKQUOTE|DIV|SECTION|FIGURE)$/.test(node.tagName) &&
            node.textContent.trim(),
    );
    const floors = candidates.map((node) => readableFloor(node, document));
    return {
        minScale: Math.ceil(100 * Math.max(0.8, floors.length ? Math.min(...floors) : 0.9)),
        maxScale: 100,
    };
}
