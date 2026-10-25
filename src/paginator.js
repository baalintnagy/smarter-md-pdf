import { automaticScaleRange, readableFloor } from './scaling.js';
import { DEFAULT_PAGE_NUMBER_FORMAT, formatPageNumber } from './page-numbers.js';

const MM = 96 / 25.4;
const heading = (node) => /^H[1-6]$/.test(node?.tagName);
const manualBreak = (node) => node?.classList?.contains('page-break');
const scalable = (node) =>
    /^(P|TABLE|PRE|UL|OL|BLOCKQUOTE|FIGURE|IMG|DIV|SECTION)$/.test(node?.tagName);

/** Measure candidate block adjustments without changing surrounding typography. */
export class Paginator {
    constructor(document) {
        this.document = document;
    }

    paginate(fragment, settings) {
        const doc = this.document;
        const root = doc.getElementById('pages');
        root.replaceChildren();
        const queue = [...fragment.childNodes];
        const probe = doc.createElement('div');
        probe.className = 'document';
        probe.style.cssText = `position:absolute;visibility:hidden;left:-100000px;width:${settings.width - 2 * settings.margin}mm`;
        root.append(probe);
        probe.append(...queue);
        const range =
            settings.scaleMode === 'auto'
                ? automaticScaleRange(queue, doc)
                : { minScale: settings.minScale, maxScale: settings.maxScale };
        const floors = new WeakMap();
        for (const node of queue) {
            if (node.nodeType === 1) {
                floors.set(node, readableFloor(node, doc));
            }
        }
        probe.replaceChildren();
        probe.remove();
        const width = (settings.width - 2 * settings.margin) * MM;
        const footerSpace = settings.pageNumbers ? Math.max(0, 12 - settings.margin) : 0;
        const height = (settings.height - 2 * settings.margin - footerSpace) * MM;
        const base = range.maxScale / 100;
        const pages = [];
        const warnings = new Set();
        let page;
        const createPage = () => {
            const slot = doc.createElement('div');
            slot.className = 'page-slot';
            const sheet = doc.createElement('article');
            sheet.className = 'sheet';
            sheet.style.width = `${settings.width}mm`;
            sheet.style.height = `${settings.height}mm`;
            const body = doc.createElement('div');
            body.className = 'page-body';
            body.style.left = body.style.top = `${settings.margin}mm`;
            const content = doc.createElement('div');
            content.className = 'document';
            content.style.width = `${width / base}px`;
            content.style.transformOrigin = 'top left';
            content.style.transform = `scale(${base})`;
            body.append(content);
            sheet.append(body);
            slot.append(sheet);
            root.append(slot);
            page = { slot, sheet, content, scale: base };
            pages.push(page);
        };
        const fits = () =>
            page.content.getBoundingClientRect().height <= height + 0.25 &&
            page.content.scrollWidth * base <= width + 1;
        const reset = (node) => {
            if (node.nodeType === 1) {
                node.style.removeProperty('zoom');
                delete node.dataset.layoutScale;
            }
        };
        const minimum = (node) => {
            if (!settings.smart) {
                return 1;
            }
            const legible =
                settings.scaleMode === 'auto' ? (floors.get(node) ?? readableFloor(node, doc)) : 0;
            return Math.min(1, Math.max(range.minScale / 100, legible) / base);
        };
        const applyScale = (node, scale) => {
            node.style.zoom = String(scale);
            node.dataset.layoutScale = String(Math.round(scale * base * 100));
        };
        const fitGroup = (group) => {
            group.forEach(reset);
            if (fits()) {
                return true;
            }
            if (!settings.smart) {
                return false;
            }
            const candidates = group
                .filter(scalable)
                .sort(
                    (a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height,
                );
            // Try individual elements before combinations. Existing content never shrinks to fit a new block.
            for (const combination of [
                ...candidates.map((node) => [node]),
                ...(candidates.length > 1 ? [candidates] : []),
            ]) {
                for (
                    let percent = 99;
                    percent >= Math.floor(Math.min(...combination.map(minimum)) * 100);
                    percent--
                ) {
                    for (const node of combination) {
                        applyScale(node, Math.max(percent / 100, minimum(node)));
                    }
                    if (fits()) {
                        return true;
                    }
                }
                combination.forEach(reset);
            }
            return false;
        };
        const freshHeight = (group) => {
            const probe = page.content.cloneNode(false);
            probe.style.position = 'absolute';
            probe.style.visibility = 'hidden';
            probe.style.left = '-100000px';
            probe.append(...group.map((node) => node.cloneNode(true)));
            page.sheet.append(probe);
            const measured = probe.getBoundingClientRect().height;
            probe.remove();
            return measured;
        };
        const splitCollection = (container, group, count, parts, minimumCount = 3) => {
            if (count < 2) {
                return null;
            }
            const before = [...page.content.childNodes].slice(0, -group.length);
            const fresh = before.length === 0;
            // Relax the configured minimum only when a fresh page cannot accommodate it.
            const rowFloors = settings.smart
                ? fresh
                    ? Array.from({ length: minimumCount }, (_, index) => minimumCount - index)
                    : [minimumCount]
                : [1];
            for (const rowFloor of rowFloors) {
                if (count < rowFloor * 2) {
                    continue;
                }
                // Prefer a natural-size split over shrinking a fragment just to squeeze in one more row.
                // Targeted shrinking is worthwhile when it avoids an otherwise orphaned heading/table.
                for (const allowShrink of settings.smart ? [false, true] : [false]) {
                    let low = rowFloor,
                        high = count - rowFloor,
                        best = 0;
                    let shown = container;
                    while (low <= high) {
                        const cut = Math.floor((low + high) / 2);
                        const [first] = parts(container, cut);
                        shown.replaceWith(first);
                        shown = first;
                        const fitsHere = allowShrink
                            ? fitGroup([...group.slice(0, -1), first])
                            : fits();
                        if (fitsHere) {
                            best = cut;
                            low = cut + 1;
                        } else {
                            high = cut - 1;
                        }
                    }
                    shown.replaceWith(container);
                    if (best) {
                        const [first, rest] = parts(container, best);
                        container.replaceWith(first);
                        if (allowShrink) {
                            fitGroup([...group.slice(0, -1), first]);
                        }
                        return rest;
                    }
                }
            }
            return null;
        };
        createPage();
        let operations = 0;
        while (queue.length) {
            if (++operations > 20000) {
                throw new Error(
                    'Document is too complex to paginate. Reduce its size or simplify the CSS.',
                );
            }
            const node = queue.shift();
            if (manualBreak(node)) {
                if (page.content.childNodes.length) {
                    createPage();
                }
                continue;
            }
            const group = [node];
            if (settings.smart) {
                while (heading(group.at(-1)) && queue.length && !manualBreak(queue[0])) {
                    group.push(queue.shift());
                }
            }
            // A compact subsection should travel as a unit, not just its heading and first item.
            // Stop at any following heading or explicit break; larger sections remain splittable.
            let shortSection = false;
            if (settings.smart && heading(node)) {
                const following = [];
                for (const candidate of queue) {
                    if (heading(candidate) || manualBreak(candidate)) {
                        break;
                    }
                    following.push(candidate);
                }
                if (freshHeight([...group, ...following]) <= height / 3) {
                    group.push(...queue.splice(0, following.length));
                    shortSection = true;
                }
            }
            const previousCount = page.content.childNodes.length;
            page.content.append(...group);
            if (fitGroup(group)) {
                continue;
            }
            if (shortSection && previousCount) {
                group.forEach((item) => item.remove());
                group.forEach(reset);
                queue.unshift(...group);
                createPage();
                continue;
            }
            const tail = group.at(-1);
            if (tail.tagName === 'TABLE') {
                const rest = splitCollection(
                    tail,
                    group,
                    this.tableRows(tail).length,
                    (table, cut) => this.tableParts(table, cut),
                    settings.minTableRows ?? 3,
                );
                if (rest) {
                    queue.unshift(rest);
                    createPage();
                    continue;
                }
            }
            if (['UL', 'OL'].includes(tail.tagName)) {
                const rest = splitCollection(tail, group, tail.children.length, (list, cut) =>
                    this.listParts(list, cut),
                );
                if (rest) {
                    queue.unshift(rest);
                    createPage();
                    continue;
                }
                // Never degrade to one-item wrappers in the remaining space at a page bottom.
                if (previousCount) {
                    group.forEach((item) => item.remove());
                    group.forEach(reset);
                    queue.unshift(...group);
                    createPage();
                    continue;
                }
            }
            const pieces = this.splitContainer(tail);
            if (pieces) {
                group.forEach((item) => item.remove());
                queue.unshift(...group.slice(0, -1), ...pieces);
                continue;
            }
            if (previousCount) {
                group.forEach((item) => item.remove());
                group.forEach(reset);
                queue.unshift(...group);
                createPage();
                continue;
            }
            // On an empty page, split oversized text beneath its heading rather than stranding the heading.
            reset(tail);
            const remainder = this.splitText(tail, fits);
            if (remainder) {
                queue.unshift(remainder);
                createPage();
                continue;
            }
            warnings.add(
                'A block exceeds the printable area at the minimum scale. Increase paper size, reduce margins/scale, or adjust its CSS.',
            );
            fitGroup(group);
            page.sheet.style.overflow = 'visible';
            if (queue.length) {
                createPage();
            }
        }
        if (pages.length > 1 && !pages.at(-1).content.childNodes.length) {
            pages.pop().slot.remove();
        }
        pages.forEach((item, index) => {
            if (settings.pageNumbers) {
                const number = doc.createElement('div');
                number.className = 'page-number';
                number.textContent = formatPageNumber(
                    settings.pageNumberFormat ?? DEFAULT_PAGE_NUMBER_FORMAT,
                    index + 1,
                    pages.length,
                );
                item.sheet.append(number);
            }
            const scales = [...item.content.querySelectorAll('[data-layout-scale]')].map((node) =>
                Number(node.dataset.layoutScale),
            );
            item.minScale = scales.length ? Math.min(range.maxScale, ...scales) : range.maxScale;
            const caption = doc.createElement('div');
            caption.className = 'page-caption';
            caption.textContent = `PAGE ${index + 1} / ${pages.length} · ${item.minScale < range.maxScale ? `${item.minScale}–${range.maxScale}%` : `${range.maxScale}%`}`;
            item.slot.append(caption);
        });
        return { pages, warnings: [...warnings], scaleRange: range };
    }

    tableRows(table) {
        return [...table.querySelectorAll(':scope > tbody > tr')];
    }

    tableParts(table, cut) {
        const first = table.cloneNode(true),
            rest = table.cloneNode(true);
        for (const part of [first, rest]) {
            part.style.removeProperty('zoom');
            delete part.dataset.layoutScale;
        }
        this.tableRows(first)
            .slice(cut)
            .forEach((row) => row.remove());
        this.tableRows(rest)
            .slice(0, cut)
            .forEach((row) => row.remove());
        first.querySelectorAll(':scope > tfoot').forEach((footer) => footer.remove());
        rest.querySelectorAll(':scope > caption').forEach((caption) => caption.remove());
        return [first, rest];
    }

    listParts(list, cut) {
        const first = list.cloneNode(true),
            rest = list.cloneNode(true);
        for (const part of [first, rest]) {
            part.style.removeProperty('zoom');
            delete part.dataset.layoutScale;
        }
        [...first.children].slice(cut).forEach((item) => item.remove());
        [...rest.children].slice(0, cut).forEach((item) => item.remove());
        if (list.tagName === 'OL') {
            const direction = list.reversed ? -1 : 1;
            const start = list.hasAttribute('start')
                ? list.start
                : list.reversed
                  ? list.children.length
                  : 1;
            first.start = start;
            let next = start;
            for (const item of [...list.children].slice(0, cut)) {
                next = (item.hasAttribute('value') ? item.value : next) + direction;
            }
            rest.start = next;
        }
        return [first, rest];
    }

    splitContainer(node) {
        if (
            node.nodeType !== 1 ||
            !['UL', 'OL', 'BLOCKQUOTE', 'DIV', 'SECTION'].includes(node.tagName) ||
            node.children.length <= 1
        ) {
            return null;
        }
        let itemIndex = 0;
        return [...node.childNodes]
            .filter((child) => child.nodeType !== 3 || child.textContent.trim())
            .map((child) => {
                const wrapper = node.cloneNode(false);
                wrapper.style.removeProperty('zoom');
                delete wrapper.dataset.layoutScale;
                if (node.tagName === 'OL') {
                    wrapper.start = (node.start || 1) + itemIndex;
                }
                if (child.nodeName === 'LI') {
                    itemIndex++;
                }
                wrapper.append(child.cloneNode(true));
                return wrapper;
            });
    }

    splitText(node, fits) {
        if (
            node.nodeType === 1 &&
            (node.matches('.math-source,.diagram') || node.querySelector('.katex'))
        ) {
            return null;
        }
        if (
            node.nodeType !== 1 ||
            heading(node) ||
            /^(TABLE|IMG)$/.test(node.tagName) ||
            node.querySelector('img,table,input') ||
            node.textContent.length < 2
        ) {
            return null;
        }
        const original = node.cloneNode(true);
        const text = original.textContent;
        const boundaries = [...text.matchAll(/\s+/g)].map((match) => match.index + match[0].length);
        if (!boundaries.length) {
            for (let i = 1; i < text.length; i++) {
                boundaries.push(i);
            }
        }
        const rangePart = (start, end) => {
            const walker = this.document.createTreeWalker(original, 4);
            let current;
            let offset = 0;
            let startNode;
            let endNode;
            let startOffset;
            let endOffset;
            while ((current = walker.nextNode())) {
                const next = offset + current.length;
                if (!startNode && start <= next) {
                    startNode = current;
                    startOffset = start - offset;
                }
                if (end <= next) {
                    endNode = current;
                    endOffset = end - offset;
                    break;
                }
                offset = next;
            }
            const range = this.document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range.cloneContents();
        };
        let low = 0;
        let high = boundaries.length - 1;
        let best = 0;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const position = boundaries[middle];
            node.replaceChildren(rangePart(0, position));
            if (fits()) {
                best = position;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        if (!best || best >= text.length) {
            node.replaceChildren(...original.childNodes);
            return null;
        }
        node.replaceChildren(rangePart(0, best));
        const rest = original.cloneNode(false);
        rest.append(rangePart(best, text.length));
        return rest;
    }
}
