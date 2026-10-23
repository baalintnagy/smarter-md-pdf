export const DOCUMENT_CSS = `
* { box-sizing:border-box; }
html, body { margin:0; padding:0; }
body { background:transparent; }
#pages { display:flex; flex-direction:column; align-items:center; gap:24px; padding:8px 20px 30px; }
.page-slot { flex:none; position:relative; }
.sheet { background:white; color:#222222; box-shadow:0 3px 18px #20365017; position:relative; overflow:hidden; }
.page-body { position:absolute; overflow:visible; }
.document { display:flow-root; font:11pt/1.65 Arial, Helvetica, sans-serif; overflow-wrap:anywhere; color:var(--doc-ink, #333333); }
.document > :first-child { margin-top:0; }.document > :last-child { margin-bottom:0; }
.document h1,.document h2,.document h3,.document h4 { line-height:1.25; color:var(--doc-heading, #181818); break-after:avoid; }
.document h1 { font-size:29pt; letter-spacing:-1.2px; margin:0 0 18pt; font-weight:650; }
.document h2 { font-size:17pt; margin:22pt 0 10pt; letter-spacing:-.4px; }
.document h3 { font-size:13pt; margin:16pt 0 7pt; }
.document p { margin:0 0 11pt; }.document a { color:var(--doc-accent, #555555); text-decoration-thickness:1px; text-underline-offset:2px; }
.document blockquote { margin:18pt 0; padding:10pt 16pt; border-left:3px solid var(--doc-border, #d9d9d9); background:var(--doc-tint, #f3f3f3); color:var(--doc-ink, #333333); }
.document blockquote p:last-child { margin-bottom:0; }
.document ul,.document ol { padding-left:21pt; margin:8pt 0 13pt; }.document li { margin:4pt 0; }
.document table { width:100%; border-collapse:collapse; margin:15pt 0; font-size:10pt; table-layout:fixed; }
.document th { background:var(--doc-tint, #f3f3f3); font-weight:600; text-align:left; }.document th,.document td { border:1px solid var(--doc-border, #d9d9d9); padding:8pt 10pt; vertical-align:top; }
.document pre { background:var(--doc-tint, #f3f3f3); border:1px solid var(--doc-border, #d9d9d9); padding:13pt; white-space:pre-wrap; overflow-wrap:anywhere; border-radius:5px; font:9pt/1.6 Consolas,monospace; }
.document code { font-family:Consolas,monospace; font-size:.9em; background:var(--doc-tint, #f3f3f3); padding:1px 4px; border-radius:3px; }.document pre code { padding:0; background:none; font-size:inherit; }
.document img { max-width:100%; height:auto; }.document hr { border:0; border-top:1px solid var(--doc-border, #d9d9d9); margin:22pt 0; }
.document .diagram { margin:14pt 0; text-align:center; break-inside:avoid; }
.document .mermaid-diagram { display:block; margin:auto; }
.document .math-display { margin:14pt 0; break-inside:avoid; }
.document .math-display .katex-display { margin:0; }
.document .render-error { border-bottom:1px dashed #a33; }
.document input { accent-color:var(--doc-accent, #555555); }.document .page-break { height:0; margin:0; padding:0; }
.document .hljs-keyword,.document .hljs-selector-tag,.document .hljs-title { color:var(--doc-heading,#181818); font-weight:600; }
.document .hljs-string,.document .hljs-number,.document .hljs-attribute,.document .hljs-selector-class,.document .hljs-literal { color:var(--doc-accent,#555555); }
.document .hljs-comment { color:var(--doc-accent,#777777); font-style:italic; }
.page-number { position:absolute; bottom:6mm; left:0; width:100%; text-align:center; color:#999999; font:8pt 'Segoe UI',sans-serif; }
.page-caption { text-align:center; font:10px/22px 'Segoe UI',sans-serif; color:#78879c; }
@media print {
 html,body { background:white; width:auto!important; }
 #pages { display:block; padding:0; }
 .page-slot { width:auto!important; height:auto!important; margin:0!important; }
 .sheet { transform:none!important; box-shadow:none; margin:0; break-after:page; page-break-after:always; }
 .page-slot:last-child .sheet { break-after:auto; page-break-after:auto; }
 .page-caption { display:none; }
 * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
}
`;
