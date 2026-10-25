const template = (id, name, font, ink, heading, accent, tint, border) => ({
    id,
    name,
    css: `/* ${name} — customize any document rule below. */
.document {
  font-family: ${font};
  text-align: justify;
  --doc-ink: ${ink};
  --doc-heading: ${heading};
  --doc-accent: ${accent};
  --doc-tint: ${tint};
  --doc-border: ${border};
}

.document table {
  text-align: left;
}

/* Manual break: <div class="page-break"></div> */`,
});
export const CSS_TEMPLATES = Object.freeze([
    template(
        'grayscale',
        'Grayscale · modern sans',
        'Arial, Helvetica, sans-serif',
        '#333333',
        '#181818',
        '#555555',
        '#f3f3f3',
        '#d9d9d9',
    ),
    template(
        'editorial',
        'Editorial · grayscale serif',
        "Georgia, 'Times New Roman', serif",
        '#303030',
        '#111111',
        '#505050',
        '#f5f5f5',
        '#d6d6d6',
    ),
    template(
        'technical',
        'Technical · monochrome mono',
        "Consolas, 'Liberation Mono', monospace",
        '#303030',
        '#151515',
        '#555555',
        '#f2f2f2',
        '#d0d0d0',
    ),
    template(
        'ocean',
        'Ocean · blue serif',
        "Georgia, 'Times New Roman', serif",
        '#283a4b',
        '#153c62',
        '#28688a',
        '#edf5fa',
        '#c9dce9',
    ),
    template(
        'indigo',
        'Indigo · clean sans',
        "'Segoe UI', Arial, sans-serif",
        '#34374a',
        '#33366b',
        '#65589a',
        '#f1eff8',
        '#d9d5eb',
    ),
    template(
        'terracotta',
        'Terracotta · warm serif',
        'Cambria, Georgia, serif',
        '#463b34',
        '#6b3e2b',
        '#975b40',
        '#faf3ed',
        '#e4d4c8',
    ),
]);
export const DEFAULT_TEMPLATE = CSS_TEMPLATES[0];
