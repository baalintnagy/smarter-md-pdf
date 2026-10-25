// Generated heading anchors can be read back from DOM without changing Markdown.
const markdownJSON = (_, value) =>
    value?.type === 'heading' ? { ...value, attrs: { ...value.attrs, id: '' } } : value;
const sameMarkdown = (left, right) =>
    left.eq(right) ||
    JSON.stringify(left.toJSON(), markdownJSON) === JSON.stringify(right.toJSON(), markdownJSON);
const mappings = new WeakMap();

/** Keep original Markdown outside the top-level blocks changed by a visual edit. */
export function preserveVisualSource(source, previous, next, { parse, blocks, serialize }) {
    const definitions = blocks.filter((block) => block.type === 'definition');
    const references = definitions
        .map((block) => source.slice(block.position.start.offset, block.position.end.offset))
        .join('\n\n');
    const cached = mappings.get(previous);
    const segments = cached?.source === source ? cached.segments : [];
    let index = 0;
    for (const block of segments.length
        ? []
        : blocks.filter((item) => item.type !== 'definition')) {
        const from = block.position.start.offset;
        const to = block.position.end.offset;
        const parsed = parse(source.slice(from, to) + (references ? '\n\n' + references : ''));
        if (!parsed) {
            return serialize(next);
        }
        const start = index;
        for (let child = 0; child < parsed.childCount; child++) {
            if (
                index >= previous.childCount ||
                !sameMarkdown(parsed.child(child), previous.child(index))
            ) {
                return serialize(next);
            }
            index++;
        }
        segments.push({ from, to, start, end: index });
    }
    // Crepe adds an editable trailing paragraph after a final code block or atom.
    index = segments.at(-1)?.end ?? 0;
    while (
        index < previous.childCount &&
        previous.child(index).type.name === 'paragraph' &&
        previous.child(index).content.size === 0
    ) {
        segments.push({ from: source.length, to: source.length, start: index, end: index + 1 });
        index++;
    }
    if (index !== previous.childCount) {
        return serialize(next);
    }
    let prefix = 0;
    while (
        prefix < previous.childCount &&
        prefix < next.childCount &&
        sameMarkdown(previous.child(prefix), next.child(prefix))
    ) {
        prefix++;
    }
    let suffix = 0;
    while (
        suffix < previous.childCount - prefix &&
        suffix < next.childCount - prefix &&
        sameMarkdown(
            previous.child(previous.childCount - suffix - 1),
            next.child(next.childCount - suffix - 1),
        )
    ) {
        suffix++;
    }
    if (prefix === previous.childCount && prefix === next.childCount) {
        mappings.set(next, { source, segments });
        return source;
    }
    // A Markdown paragraph can become several editor nodes (for example, block images).
    const first = segments.find((segment) => segment.end > prefix);
    const last = segments.findLast((segment) => segment.start < previous.childCount - suffix);
    const start = first ? Math.min(prefix, first.start) : prefix;
    const end = last ? Math.max(previous.childCount - suffix, last.end) : start;
    const nextEnd = next.childCount - (previous.childCount - end);
    const offset = (doc, count) => {
        let result = 0;
        for (let child = 0; child < count; child++) {
            result += doc.child(child).nodeSize;
        }
        return result;
    };
    const replacement = serialize(
        next.copy(next.content.cut(offset(next, start), offset(next, nextEnd))),
    ).replace(/\n+$/, '');
    const from = first?.from ?? source.length;
    const to = end === start ? from : (last?.to ?? from);
    const retainedDefinitions = definitions
        .filter((block) => block.position.start.offset >= from && block.position.end.offset <= to)
        .map((block) => source.slice(block.position.start.offset, block.position.end.offset));
    const content = [replacement, ...retainedDefinitions].filter(Boolean).join('\n\n');
    const before = source.slice(0, from);
    const after = source.slice(to);
    const leading = content && before.trim() && !/\n\s*\n$/.test(before) ? '\n\n' : '';
    const trailing = content && after.trim() && !/^\n\s*\n/.test(after) ? '\n\n' : '';
    const result = before + leading + content + trailing + after;
    const delta = result.length - source.length;
    const nodeDelta = next.childCount - previous.childCount;
    mappings.set(next, {
        source: result,
        segments: [
            ...segments.filter((segment) => segment.end <= start),
            ...(nextEnd > start
                ? [
                      {
                          from: from + leading.length,
                          to: from + leading.length + content.length,
                          start,
                          end: nextEnd,
                      },
                  ]
                : []),
            ...segments
                .filter((segment) => segment.start >= end)
                .map((segment) => ({
                    from: segment.from + delta,
                    to: segment.to + delta,
                    start: segment.start + nodeDelta,
                    end: segment.end + nodeDelta,
                })),
        ],
    });
    return result;
}
