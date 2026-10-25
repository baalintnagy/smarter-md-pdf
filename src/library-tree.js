import { Wunderbaum } from 'wunderbaum';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'wunderbaum/dist/wunderbaum.css';
import './library-tree.css';

const ROOT = 'library-root';
const idOf = (node) => (node.key === ROOT ? null : node.key);

/** Adapts the tree component to the persisted workspace model. */
export class LibraryTree {
    constructor(element, handlers) {
        this.tree = new Wunderbaum({
            element,
            source: [],
            debugLevel: 1,
            header: false,
            checkbox: false,
            emptyChildListExpandable: true,
            activate: ({ node }) => {
                if (!this.syncing) {
                    handlers.select(idOf(node));
                }
            },
            expand: ({ node }) => {
                if (!this.syncing) {
                    handlers.expand(idOf(node), node.expanded);
                }
            },
            render: ({ node, nodeElem }) => {
                // Decorate native indentation cells without changing their size or position.
                const path = node.getParentList(false, true);
                const indents = nodeElem.querySelectorAll('.wb-indent:not(.wb-expander)');
                indents.forEach((indent, index) => {
                    const branch = index === indents.length - 1;
                    indent.classList.toggle('tree-line-branch', branch);
                    indent.classList.toggle('tree-line-last', branch && node.isLastSibling());
                    indent.classList.toggle(
                        'tree-line-through',
                        !branch && Boolean(path[index + 1].getNextSibling()),
                    );
                });
                const row = nodeElem.parentElement;
                const root = node.key === ROOT;
                row.dataset.id = root ? '' : node.key;
                row.dataset.kind = node.data.kind;
                row.setAttribute(
                    'aria-label',
                    root
                        ? 'Root'
                        : `${node.data.kind === 'folder' ? 'Select folder' : 'Open'} ${node.title}`,
                );
                row.classList.toggle('open-document', node.key === this.activeId);
                if (node.key === this.activeId) {
                    row.setAttribute('aria-current', 'page');
                } else {
                    row.removeAttribute('aria-current');
                }
            },
            dnd: {
                preventForeignNodes: true,
                preventNonNodes: true,
                preventRecursion: true,
                effectAllowed: 'move',
                dropEffectDefault: 'move',
                guessDropEffect: false,
                dragStart: ({ node }) => {
                    this.dragged = node.key === ROOT ? null : node.key;
                    return Boolean(this.dragged);
                },
                dragEnter: ({ node }) => (node.data.kind === 'folder' ? 'over' : false),
                drop: ({ node, sourceNode }) => handlers.move(sourceNode.key, idOf(node)),
                dragEnd: () => {
                    this.dragged = null;
                    element.classList.remove('root-drop-target');
                },
            },
        });
        // The blank part of the library is also a destination for root-level items.
        element.addEventListener('dragover', (event) => {
            if (this.dragged && !event.target.closest('.wb-row')) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                element.classList.add('root-drop-target');
            } else {
                element.classList.remove('root-drop-target');
            }
        });
        element.addEventListener('dragleave', (event) => {
            if (!element.contains(event.relatedTarget)) {
                element.classList.remove('root-drop-target');
            }
        });
        element.addEventListener('drop', (event) => {
            if (this.dragged && !event.target.closest('.wb-row')) {
                event.preventDefault();
                event.stopPropagation();
                handlers.move(this.dragged, null);
                element.classList.remove('root-drop-target');
            }
        });
    }

    present(model, selectedId, expanded) {
        const branch = (parentId) =>
            model.children(parentId).map((node) => ({
                key: node.id,
                title: node.name,
                kind: node.kind,
                tooltip: model.path(node.id),
                expanded: model.expanded.has(node.id),
                ...(node.kind === 'folder' ? { children: branch(node.id) } : {}),
            }));
        const source = [
            {
                key: ROOT,
                title: 'Root',
                kind: 'folder',
                classes: 'library-root',
                expanded,
                children: branch(null),
            },
        ];
        const signature = JSON.stringify(source, (key, value) =>
            key === 'expanded' ? undefined : value,
        );
        this.syncing = true;
        this.activeId = model.activeId;
        this.tree.enableUpdate(false);
        try {
            if (signature !== this.signature) {
                this.tree.root.removeChildren();
                this.tree.addChildren(source);
                this.signature = signature;
            }
            this.tree.findKey(selectedId || ROOT)?.setActive(true, { noEvents: true });
            this.tree.update('data');
        } finally {
            this.tree.enableUpdate(true);
            this.syncing = false;
        }
    }
}
