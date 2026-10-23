import katexCSS from 'katex/dist/katex.min.css?inline';

let diagramId = 0;
export function installMathStyles(document) {
    const style = document.createElement('style');
    style.textContent = katexCSS;
    document.head.append(style);
}

/** Render only sanitized source nodes, before measuring pagination. */
export async function renderPrintExtensions(root) {
    const warnings = [];
    const math = [...root.querySelectorAll('.math-source')];
    if (math.length) {
        const { default: katex } = await import('katex');
        for (const node of math) {
            const source = node.textContent;
            try {
                katex.render(source, node, {
                    displayMode: node.classList.contains('math-display'),
                    trust: false,
                    throwOnError: true,
                    maxExpand: 1000,
                    maxSize: 20,
                });
            } catch {
                node.textContent = source;
                node.classList.add('render-error');
                warnings.push('A math expression could not be rendered. Its source is shown.');
            }
        }
    }
    const diagrams = [...root.querySelectorAll('pre > code.language-mermaid')];
    if (diagrams.length) {
        const { default: mermaid } = await import('mermaid');
        const style = root.ownerDocument.defaultView.getComputedStyle(root);
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: 'base',
            themeVariables: {
                primaryColor: style.getPropertyValue('--doc-tint').trim() || '#f3f3f3',
                primaryTextColor: style.color,
                lineColor: style.color,
                primaryBorderColor: '#888888',
                fontFamily: 'Arial, sans-serif',
            },
            flowchart: { htmlLabels: false },
            secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering'],
            maxTextSize: 50000,
        });
        for (const code of diagrams) {
            const container = document.createElement('div');
            container.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
            document.body.append(container);
            try {
                const { svg } = await mermaid.render(
                    'mdOfficeDiagram' + ++diagramId,
                    code.textContent,
                    container,
                );
                const svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
                const svgRoot = svgDocument.documentElement;
                const bounds = svgRoot
                    .getAttribute('viewBox')
                    ?.trim()
                    .split(/[\s,]+/)
                    .map(Number);
                if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
                    svgRoot.setAttribute('width', String(bounds[2]));
                    svgRoot.setAttribute('height', String(bounds[3]));
                }
                const image = root.ownerDocument.createElement('img');
                image.alt = 'Mermaid diagram';
                image.className = 'mermaid-diagram';
                // SVG is an inert image, never an active subtree of either document.
                image.src =
                    'data:image/svg+xml;charset=utf-8,' +
                    encodeURIComponent(new XMLSerializer().serializeToString(svgRoot));
                const figure = root.ownerDocument.createElement('figure');
                figure.className = 'diagram';
                figure.append(image);
                code.parentElement.replaceWith(figure);
            } catch {
                code.parentElement.classList.add('render-error');
                warnings.push('A Mermaid diagram could not be rendered. Its source is shown.');
            } finally {
                container.remove();
            }
        }
    }
    return [...new Set(warnings)];
}
