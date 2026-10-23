# MD-Office

A static, local-first Markdown print studio for GitHub Pages. Write visually or edit Markdown source, open/drop `.md`, `.markdown`, or `.txt` files, customize document CSS, and print selectable text to PDF. Vite bundles the browser editor at build time; the deployed app needs no backend or runtime CDN.

## Run locally

With Node.js 22.13+ (22.x), or Node.js 24+:

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. Run `npm run build` to generate the static `dist/` directory and `npm run preview` to preview the production build. Opening `index.html` directly is not supported.

## Visual editing

The workspace uses the available viewport width with small outer gutters. The editor takes the larger column; drag the divider to change the editor/preview proportions. The divider also supports Left/Right arrows (Shift for larger steps), Home/End for limits, and Enter or double-click to reset. Both columns have a minimum usable width, and the preference is remembered locally. The preview automatically fits its new width without changing paper dimensions or pagination. Panels stack on mobile, with the divider hidden. The interface uses blue tones in light and dark modes.

The default **Visual** mode uses Milkdown/Crepe (ProseMirror), with no table-of-contents panel. Its text uses a fixed-width Consolas/Cascadia Code/monospace font stack. Headings, bold/italic/strikeout text, inline code, links, lists, quotes, and code fences show Markdown delimiter decorations. These hints are not editable source characters and do not appear in the PDF or become duplicate tokens when editing; use Markdown mode to edit the literal syntax. The formatting toolbar supports headings, bold, italic, strikeout, code, lists, tasks, links, images, blockquotes, and rules. Selecting text opens a floating formatting toolbar; `/` opens the block menu. Undo/redo and Markdown typing shortcuts are provided by the editor.

Use **Table** in the toolbar to insert a table. Hover table edges for insertion controls and row/column drag handles. Clicking a cell also reveals explicit controls for adding/deleting rows or columns, moving rows/columns, and aligning entire columns. Row movement controls keep the header first. GFM column alignment is applied to the header and data cells so it survives serialization.

**Markdown** mode edits the same source consumed by the print renderer. Switching modes without editing preserves the exact original source. Visual edits serialize standard Markdown and may normalize whitespace, list markers, and table formatting. Imported documents and multiple-document selection synchronize both modes.

Markdown and CSS source fields have syntax highlighting with native textarea editing, selection, undo, scrolling, and resizing. Visual fenced-code editors use CodeMirror language packs and a theme-aware syntax palette. Print code blocks are also tokenized, respecting the document's palette; unknown fence languages fall back to plain text.

## Local document library

Open the left drawer with the library button. Create documents and nested folders; rename, duplicate, move, or delete selected items. Folder duplication includes descendants, and deletion asks for confirmation. Drag items onto folders or My documents to move them, or use the Move dialog. The drawer overlays smaller screens and supports Escape and keyboard focus containment.

Edits autosave locally; Save and Ctrl/Cmd+S also save explicitly. The status beneath the editor reports success or storage errors. Reloading restores the active document, its style, paper settings, and imported images. A revision check rejects stale saves from another tab: export an unsaved draft before reloading that tab. This is a local library with no account or cloud sync.

## Document styles

**Document style** offers six editable CSS templates: Grayscale (modern sans), Editorial (grayscale serif), Technical (monochrome monospace), Ocean (blue serif), Indigo (sans), and Terracotta (warm serif). The default document is entirely grayscale, including links, quotes, tables, and code tokens; editor syntax colors belong to the interface and are independent of print colors. Templates use local system fonts, so no external font downloads are required. Choosing a template replaces the current CSS; typing or importing a stylesheet switches the selector to Custom CSS. Templates set `--doc-ink`, `--doc-heading`, `--doc-accent`, `--doc-tint`, and `--doc-border` on `.document`, and can be customized further with ordinary CSS rules. Paper and font changes trigger fresh pagination.

**Page break** inserts `<div class="page-break"></div>` in either mode. Block HTML is preserved verbatim as inert, selectable blocks; manual breaks have a labeled divider. Edit custom HTML in Markdown mode. It is never executed inside the visual editor, and the print renderer still sanitizes it. Unsupported Markdown dialect extensions are not guaranteed to round-trip through visual edits; retain a source copy for proprietary formats.

Paste/drop raster images into the visual editor or use its image control. Images are saved in the local browser library and referenced by filename; import matching local image files alongside the Markdown to resolve existing relative paths. Use Export Markdown for a source copy; there is no automatic write-back to local files. SVG uploads are excluded.

## Deploy

Push this directory to a GitHub repository on `main` or `master`. In **Settings → Pages → Source**, choose **GitHub Actions**. The included workflow installs locked dependencies, runs unit checks, builds the site, runs Chromium editor/pagination/PDF integration checks, and deploys `dist/`. All asset paths are relative, including editor chunks on repository Pages URLs. Publishing is not performed by local setup.

## Math and diagrams

Print preview renders fenced `mermaid` blocks as vector diagrams, and KaTeX expressions using `$…$` or `\(…\)` inline and `$$…$$` or `\[…\]` on separate lines for display equations. Write these in Markdown mode; the visual editor keeps code fences as editable source. Both libraries and the math fonts are bundled locally. Rendering and font/image loading finish before pagination. Invalid expressions retain their source with a warning. Equations and diagrams remain intact across page breaks; oversized content can require smaller typography or larger paper. Diagrams are inert SVG images; KaTeX uses its untrusted-input mode.

## Printing

Choose A3, A4, A5, Letter, Legal, Tabloid, or numeric custom dimensions in millimetres. Orientation swaps dimensions. Margins apply on every page. Smart pagination measures the rendered DOM and keeps heading chains with actual following content, including the first fragment of a long table or paragraph. Tables use available space on the current page before starting another page, repeat their header, and keep at least three data rows on both sides of a split. Only when a fresh page physically cannot accommodate that constraint is the minimum relaxed. Small tables move intact when possible; rows are never split as arbitrary text.

Compact subsections (a heading and following content up to the next heading or manual break, at most one-third of a printable page) stay together if they cannot fit at the page bottom. Longer lists split by measured item groups, keeping at least three items on both sides when physically possible, with ordered-list numbering preserved. This avoids a subsection heading stranded with just one or two bullets while still letting larger sections use remaining page space.

**Automatic scale range** calculates a lower bound from rendered font sizes, aiming for at least 9 pt prose and 8.5 pt table/code text, and allowing at most 20% reduction. Individual blocks also respect their own readability limit. These are fitting limits, not instructions to shrink everything. The engine measures natural layout first, tries the smallest necessary reduction of the overflowing block, and considers individual candidates before combining reductions. For tables that must split, a natural-size fragment is preferred over shrinking simply to squeeze in another row; targeted shrinking is a fallback when needed to keep a useful fragment with its heading. Headings and already-placed content keep their size. Page captions show any selected-block scaling. The maximum defines the document's baseline scale; additional fitting is local to individual blocks.

Edit either scale limit to switch to **Custom range**, which honors your bounds without automatic readability restrictions. Select Automatic again to recalculate after typography or page changes. Disable smart breaks to use the maximum scale consistently without targeted reductions or keep-with-next rules. CSS `zoom` is used for block fitting so its measured size participates in normal document flow; use a modern browser that supports it.

Use **Print / Save PDF**, choose **Save as PDF**, matching paper dimensions, 100% scale, and no browser headers/footers. Browser and printer support for custom `@page` sizes varies. The preview uses the same page DOM as print. If an indivisible element exceeds the available area, the app reports it and disables printing until the layout is corrected. Browser menu printing bypasses that guard.

Add `<div class="page-break"></div>` on its own line for a manual page break. Custom CSS may use `.document`, headings, paragraphs, tables, and any allowed HTML classes. Avoid changing the internal `.sheet`, `.page-body`, and `#pages` layout. Arbitrary fixed positioning, print-only rules, custom CSS that alters container geometry, and unusually complex HTML can defeat measured pagination. Multi-column layout and footnotes are not special-cased.

## Files and privacy

Multiple Markdown files are independently editable through the document selector. Import raster images alongside Markdown to resolve relative image paths by filename. Import only supported Markdown/text and image files through the main picker; use **Import CSS** for a stylesheet. SVG imports are intentionally excluded. Remote HTTP(S) images and CSS resources still make network requests. Missing or timed-out images produce a warning. Documents, CSS, paper settings, folder trees, and imported raster images persist in IndexedDB on this browser and site origin. Theme and column-width preferences are also remembered. Clearing browser site data removes the library; other devices and browsers do not share it. Export Markdown downloads source only, without CSS or image files.

Print Markdown is parsed with locally vendored Marked 17.0.5 (MIT; see `vendor/MARKED-LICENSE.md`) and rebuilt through an HTML allowlist. Scripts, event handlers, styles, embedded frames, and active URLs are removed from print output. Custom CSS is confined to a sandboxed iframe, separately from the application UI. CSS is user-controlled and can load remote resources. UI dark/light themes fade over 800 ms (instant with reduced motion); paper remains as styled for print. Milkdown/Crepe and its dependencies are bundled locally; the build includes their license notices in `dist/THIRD-PARTY-NOTICES.txt`.

The sibling `baalintnagy.github.io` project informed the browser-rendered HTML approach, typography stack, and document colors. This app adds Markdown parsing and measured pagination; it does not reproduce the sibling's JSON CV templates, MathJax, or raster PDF export.

## Structure and checks

- `src/print-extensions.js`: KaTeX and Mermaid rendering before pagination.
- `src/markdown.js`: Markdown parsing and HTML sanitation.
- `src/editor-controller.js`: mode switches and canonical source synchronization.
- `src/visual-editor.js`: Milkdown formatting, table commands, and local image integration.
- `src/raw-html.js`: safe block HTML schema and manual page-break preservation.
- `src/markdown-markers.js`: presentation-only Markdown syntax decorations.
- `src/code-highlighting.js`: escaped source highlighting and synchronized textarea layers.
- `src/css-templates.js`: default grayscale document and alternate font/color presets.
- `src/paginator.js`: DOM measurement, bounded scaling, and structural/text splits.
- `src/document-library.js`: document lifecycle, autosave, and drawer actions.
- `src/workspace-model.js`: validated nested folder and document operations.
- `src/workspace-storage.js`: atomic IndexedDB persistence and revision checks.
- `src/files.js`: file imports and object URL ownership.
- `src/settings.js`: paper presets and validation.
- `src/scaling.js`: typography-based automatic range and per-block readability limits.
- `src/app.js`: UI coordination, rendering lifecycle, and print action.
- `src/document-style.js`: document defaults and print rules.

Source style follows the applicable conventions from the sibling PermaFormula repositories:
four-space indentation, a 100-column target, single quotes, LF endings, and braces around
conditional and loop bodies. YAML uses two spaces. Run `npm run format` for formatting,
`npm run lint:fix` for supported lint fixes, and `npm run check:style` to verify both.
Prettier and ESLint exclude vendored code and generated output; license notices and
dependency lockfiles are also excluded from formatting. See [AGENTS.md](AGENTS.md) for
the conventions that remain review requirements. CI checks style before testing.

Run `npm test` for configuration and document-tree validation. For browser integration checks:

```sh
npm run build
npx playwright install chromium
npm run test:browser
```

The suites start their own production server on port 4173, which must be free. They cover editor formatting, undo, tables, HTML/page-break round trips, source synchronization, pasted/imported images, multi-document editing, responsive layout, pagination, and generated PDF page counts/dimensions. Set `TEST_MARKDOWN` to a local KamraRadar Markdown file to run the supplied-document regression, including chapter 11 and all 17 acceptance rows. The document is read locally and is not stored in the repository. `BROWSER_EXECUTABLE` can point to an installed Chromium-based browser; `PLAYWRIGHT_MODULE` can select an existing Playwright module. Set `PORT` to use another local port or `SITE_BASE=/smarter-md-pdf` to test relative assets beneath a repository Pages path.
