import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, parserCtx, remarkCtx, serializerCtx } from '@milkdown/kit/core';
import { $prose, replaceAll, callCommand } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { deleteRow, deleteColumn } from '@milkdown/kit/prose/tables';
import { remarkHtmlTransformer, headingIdGenerator } from '@milkdown/kit/preset/commonmark';
import {
    addRowAfterCommand,
    addColAfterCommand,
    moveRowCommand,
    moveColCommand,
    selectColCommand,
    setAlignCommand,
} from '@milkdown/kit/preset/gfm';
import { rawHTML, PAGE_BREAK } from './raw-html.js';
import { visualMath } from './visual-math.js';
import { markdownMarkers } from './markdown-markers.js';
import { preserveVisualSource } from './visual-source.js';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/code-mirror.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/common/top-bar.css';
import '@milkdown/crepe/theme/classic.css';
import './visual-editor.css';

/** Owns rich document state. The app receives standard Markdown, never editor DOM. */
export class VisualEditor {
    constructor({ root, source, onChange, onTableSelection, onUpload, resolveImage }) {
        this.root = root;
        this.source = source;
        this.suppressChanges = true;
        this.crepe = new Crepe({
            root,
            defaultValue: source,
            features: {
                [Crepe.Feature.TopBar]: true,
                [Crepe.Feature.Latex]: false,
                [Crepe.Feature.Placeholder]: false,
            },
            featureConfigs: {
                [Crepe.Feature.ImageBlock]: {
                    onUpload,
                    inlineOnUpload: onUpload,
                    blockOnUpload: onUpload,
                    proxyDomURL: resolveImage,
                },
                [Crepe.Feature.CodeMirror]: {
                    languages,
                    extensions: [
                        syntaxHighlighting(
                            HighlightStyle.define([
                                { tag: [tags.keyword, tags.operator], class: 'syntax-keyword' },
                                { tag: [tags.string, tags.attributeValue], class: 'syntax-string' },
                                { tag: tags.comment, class: 'syntax-comment' },
                                { tag: [tags.number, tags.bool], class: 'syntax-number' },
                                {
                                    tag: [tags.propertyName, tags.tagName, tags.typeName],
                                    class: 'syntax-name',
                                },
                            ]),
                        ),
                    ],
                },
            },
        });
        const changes = $prose(
            (ctx) =>
                new Plugin({
                    view: () => ({
                        update: (view, previous) => {
                            if (!this.suppressChanges && !previous.doc.eq(view.state.doc)) {
                                const source = preserveVisualSource(
                                    this.source,
                                    previous.doc,
                                    view.state.doc,
                                    {
                                        parse: ctx.get(parserCtx),
                                        blocks: ctx.get(remarkCtx).parse(this.source).children,
                                        serialize: ctx.get(serializerCtx),
                                    },
                                );
                                if (source !== this.source) {
                                    this.source = source;
                                    onChange(source);
                                }
                            }
                            onTableSelection(this.tableContext(view));
                        },
                    }),
                }),
        );
        this.crepe.editor
            .config((ctx) => {
                const generate = ctx.get(headingIdGenerator.key);
                ctx.set(headingIdGenerator.key, (node) => 'md-content-' + generate(node));
            })
            .use(rawHTML)
            .use(visualMath)
            .use(markdownMarkers)
            .use(changes);
    }

    async create() {
        // Replace the preset's inline-only HTML workaround with our preserved block schema.
        await this.crepe.editor.remove(remarkHtmlTransformer);
        await this.crepe.create();
        this.crepe.editor.action((ctx) => {
            ctx.get(editorViewCtx).dom.setAttribute('aria-label', 'Visual Markdown document');
            ctx.get(editorViewCtx).dom.setAttribute('role', 'textbox');
            ctx.get(editorViewCtx).dom.setAttribute('aria-multiline', 'true');
        });
        // Crepe can recreate its toolbar on a document-state reset. Keep accessible names
        // on these upstream icon-only buttons, including after switching source documents.
        const labelToolbar = () => {
            const toolbar = this.root.querySelector('.milkdown-top-bar');
            toolbar?.setAttribute('role', 'toolbar');
            toolbar?.setAttribute('aria-label', 'Document formatting');
            const labels = [
                'Bold',
                'Italic',
                'Strikethrough',
                'Inline code',
                'Bullet list',
                'Numbered list',
                'Task list',
                'Link',
                'Image',
                'Table',
                'Code block',
                'Blockquote',
                'Horizontal rule',
            ];
            toolbar?.querySelectorAll('.top-bar-item').forEach((button, index) => {
                button.setAttribute('aria-label', labels[index]);
                button.title = labels[index];
            });
            toolbar
                ?.querySelector('.top-bar-heading-button')
                ?.setAttribute('aria-label', 'Text style');
        };
        this.toolbarObserver = new MutationObserver(labelToolbar);
        this.toolbarObserver.observe(this.root, { childList: true, subtree: true });
        labelToolbar();
        this.suppressChanges = false;
    }

    setSource(source) {
        if (source === this.source) {
            return;
        }
        this.suppressChanges = true;
        try {
            this.crepe.editor.action(replaceAll(source, true));
            this.source = source;
        } finally {
            this.suppressChanges = false;
        }
    }

    tableContext(view) {
        const { $from } = view.state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
            const table = $from.node(depth);
            if (table.type.name === 'table') {
                return {
                    pos: $from.before(depth),
                    row: $from.index(depth),
                    column: $from.index(depth + 1),
                    rows: table.childCount,
                    columns: table.firstChild.childCount,
                };
            }
        }
        return null;
    }

    tableCommand(command) {
        this.crepe.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx),
                table = this.tableContext(view);
            if (!table) {
                return;
            }
            const commands = { 'add-row': addRowAfterCommand, 'add-column': addColAfterCommand };
            if (commands[command]) {
                callCommand(commands[command].key)(ctx);
            } else if (command === 'delete-row' || command === 'delete-column') {
                (command === 'delete-row' ? deleteRow : deleteColumn)(view.state, view.dispatch);
            } else if (command.startsWith('align-')) {
                callCommand(selectColCommand.key, { index: table.column })(ctx);
                callCommand(setAlignCommand.key, command.slice(6))(ctx);
            } else if (command === 'row-up' && table.row > 1) {
                callCommand(moveRowCommand.key, { from: table.row, to: table.row - 1 })(ctx);
            } else if (command === 'row-down' && table.row > 0 && table.row < table.rows - 1) {
                callCommand(moveRowCommand.key, { from: table.row, to: table.row + 1 })(ctx);
            } else if (command === 'column-left' && table.column > 0) {
                callCommand(moveColCommand.key, { from: table.column, to: table.column - 1 })(ctx);
            } else if (command === 'column-right' && table.column < table.columns - 1) {
                callCommand(moveColCommand.key, { from: table.column, to: table.column + 1 })(ctx);
            }
            view.focus();
        });
    }

    insertPageBreak() {
        this.crepe.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            view.dispatch(
                view.state.tr
                    .replaceSelectionWith(
                        view.state.schema.nodes.raw_html_block.create({ value: PAGE_BREAK }),
                    )
                    .scrollIntoView(),
            );
            view.focus();
        });
    }
}
