const PX_PER_PT = 96 / 72;

/** Absolute output scale needed to preserve readable type; preview zoom is irrelevant. */
export function readableFloor(node, document) {
    const dense = /^(TABLE|PRE)$/.test(node.tagName);
    const samples = dense ? [node, ...node.querySelectorAll('td, th, code')] : [node];
    const sizes = samples
        .map((item) => parseFloat(document.defaultView.getComputedStyle(item).fontSize))
        .filter(Number.isFinite);
    return Math.min(1, ((dense ? 8.5 : 9) * PX_PER_PT) / Math.min(...sizes));
}

export function automaticScaleRange(nodes, document) {
    const candidates = nodes.filter(
        (node) => node.nodeType === 1 && /^(P|TABLE|PRE|UL|OL|BLOCKQUOTE)$/.test(node.tagName),
    );
    const floors = candidates.map((node) => readableFloor(node, document));
    return {
        minScale: Math.ceil(100 * Math.max(0.8, floors.length ? Math.min(...floors) : 0.9)),
        maxScale: 100,
    };
}
