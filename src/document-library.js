import { WorkspaceModel } from './workspace-model.js';
import { WorkspaceStorage } from './workspace-storage.js';
import './document-library.css';

const $ = (id) => document.getElementById(id);
const MIME = 'application/x-smarter-document';

/** Local document lifecycle and drawer UI, independent of Markdown rendering and pagination. */
export class DocumentLibrary {
    constructor({ capture, onOpen, onTreeChange, assets, initial }) {
        this.capture = capture;
        this.onOpen = onOpen;
        this.assets = assets;
        this.initial = initial;
        this.onTreeChange = onTreeChange;
        this.storage = new WorkspaceStorage();
        this.model = new WorkspaceModel();
        this.generation = 0;
        this.dirty = false;
        this.ready = false;
        this.dbRevision = 0;
        this.selectedId = null;
        this.opening = false;
        this.saveError = false;
        this.bind();
        this.initialized = this.initialize();
    }
    async initialize() {
        try {
            const loaded = await this.storage.load();
            this.dbRevision = loaded.revision;
            this.model = new WorkspaceModel(loaded.snapshot);
            this.assets.restoreAssets(loaded.assets);
            if (!this.model.nodes.some((node) => node.kind === 'document')) {
                this.model.activeId = this.model.create(
                    'document',
                    this.initial.name,
                    null,
                    this.initial,
                ).id;
            }
            if (!this.model.activeId) {
                this.model.activeId = this.model.nodes.find((node) => node.kind === 'document').id;
            }
            const live = this.capture();
            if (live.source !== this.initial.source || live.css !== this.initial.css) {
                this.model.activeId = this.model.create(
                    'document',
                    'Recovered draft.md',
                    null,
                    live,
                ).id;
            }
            this.ready = true;
            this.activate(this.model.activeId, false);
            if (
                !loaded.snapshot ||
                live.source !== this.initial.source ||
                live.css !== this.initial.css
            ) {
                this.touch();
                await this.flush();
            } else {
                this.message('Saved on this device');
            }
        } catch (error) {
            // Do not overwrite a failed/corrupt database with an empty workspace.
            this.ready = true;
            this.unavailable = true;
            this.model = new WorkspaceModel();
            this.model.activeId = this.model.create('document', this.initial.name, null, {
                ...this.initial,
                ...this.capture(),
            }).id;
            this.selectedId = this.model.activeId;
            this.present();
            this.message(`Not saved locally: ${error.message}`, true);
        }
    }
    message(text, error = false) {
        $('save-state').textContent = text;
        $('save-state').classList.toggle('error', error);
    }
    captureCurrent() {
        const active = this.model.get(this.model.activeId);
        if (active) {
            Object.assign(active, this.capture());
        }
    }
    changed() {
        if (!this.ready || this.opening) {
            return;
        }
        this.captureCurrent();
        this.touch();
    }
    touch() {
        this.generation++;
        this.dirty = true;
        if (this.unavailable || this.saveError) {
            return;
        }
        this.message('Saving locally…');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), 150);
    }
    async flush() {
        clearTimeout(this.timer);
        if (!this.ready) {
            await this.initialized;
            return;
        }
        if (this.unavailable) {
            this.message(
                'Local storage is unavailable. Export your Markdown to keep a copy.',
                true,
            );
            return false;
        }
        if (this.saving) {
            await this.saving;
            if (this.saveError) {
                return false;
            }
            return this.dirty ? this.flush() : true;
        }
        if (!this.dirty) {
            return true;
        }
        this.captureCurrent();
        const generation = this.generation,
            snapshot = this.model.snapshot(),
            pending = new Map(this.assets.pendingAssets);
        this.message('Saving locally…');
        this.saving = this.storage
            .save(snapshot, this.dbRevision, pending)
            .then((revision) => {
                this.dbRevision = revision;
                this.saveError = false;
                this.dirty = generation !== this.generation;
                for (const [key, blob] of pending) {
                    if (this.assets.pendingAssets.get(key) === blob) {
                        this.assets.pendingAssets.delete(key);
                    }
                }
                this.message(this.dirty ? 'Saving locally…' : 'Saved on this device');
                return true;
            })
            .catch((error) => {
                this.saveError = true;
                this.message(`Not saved: ${error.message}`, true);
                return false;
            })
            .finally(() => {
                this.saving = null;
            });
        const saved = await this.saving;
        return saved && this.dirty ? this.flush() : saved;
    }
    activate(id, persist = true) {
        const file = this.model.get(id);
        if (file?.kind !== 'document') {
            return;
        }
        if (this.selectedId) {
            this.captureCurrent();
        }
        this.model.activeId = id;
        this.selectedId = id;
        this.opening = true;
        try {
            this.onOpen(file);
        } finally {
            this.opening = false;
        }
        this.present();
        if (persist) {
            this.touch();
        }
    }
    addDocument(name, source, data = {}) {
        this.captureCurrent();
        const node = this.model.create('document', name, this.destination(), {
            ...this.capture(),
            ...data,
            source,
        });
        this.activate(node.id);
        return node;
    }
    destination() {
        const selected = this.model.get(this.selectedId);
        return selected?.kind === 'folder' ? selected.id : selected?.parentId || null;
    }
    toggle(open) {
        $('library-panel').hidden = !open;
        $('library-backdrop').hidden = !open;
        $('library-toggle').setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('library-open', open);
        this.updateDrawerSemantics();
        if (open) {
            $('library-close').focus();
        } else {
            $('library-toggle').focus();
        }
    }
    updateDrawerSemantics() {
        const panel = $('library-panel'),
            modal = !panel.hidden && window.matchMedia('(max-width:1099px)').matches;
        if (modal) {
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
        } else {
            panel.removeAttribute('role');
            panel.removeAttribute('aria-modal');
        }
    }
    present() {
        const tree = $('library-tree');
        tree.replaceChildren();
        const branch = (parentId) => {
            const ul = document.createElement('ul');
            for (const node of this.model.children(parentId)) {
                const li = document.createElement('li'),
                    row = document.createElement('div');
                row.className = `library-row${node.id === this.selectedId ? ' selected' : ''}${node.id === this.model.activeId ? ' active' : ''}`;
                row.dataset.id = node.id;
                row.dataset.kind = node.kind;
                row.draggable = true;
                if (node.kind === 'folder') {
                    const expand = document.createElement('button');
                    expand.type = 'button';
                    expand.className = 'folder-expand';
                    expand.textContent = this.model.expanded.has(node.id) ? '▾' : '▸';
                    expand.setAttribute('aria-label', `Toggle folder ${node.name}`);
                    expand.setAttribute('aria-expanded', String(this.model.expanded.has(node.id)));
                    expand.addEventListener('click', () => {
                        if (this.model.expanded.has(node.id)) {
                            this.model.expanded.delete(node.id);
                        } else {
                            this.model.expanded.add(node.id);
                        }
                        this.present();
                        this.touch();
                    });
                    row.append(expand);
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'library-item';
                button.textContent = `${node.kind === 'folder' ? '▱' : '▤'} ${node.name}`;
                button.title = this.model.path(node.id);
                button.setAttribute(
                    'aria-label',
                    `${node.kind === 'folder' ? 'Select folder' : 'Open'} ${node.name}`,
                );
                if (node.id === this.model.activeId) {
                    button.setAttribute('aria-current', 'page');
                }
                button.addEventListener('click', () => {
                    if (node.kind === 'document') {
                        this.activate(node.id);
                    } else {
                        this.selectedId = node.id;
                        this.model.expanded.add(node.id);
                        this.present();
                        this.touch();
                    }
                });
                row.append(button);
                li.append(row);
                if (node.kind === 'folder' && this.model.expanded.has(node.id)) {
                    li.append(branch(node.id));
                }
                ul.append(li);
            }
            return ul;
        };
        tree.append(branch(null));
        $('library-selection').textContent = this.selectedId
            ? this.model.path(this.selectedId)
            : 'My documents';
        for (const button of document.querySelectorAll('[data-library-action]')) {
            if (!button.dataset.libraryAction.startsWith('new-')) {
                button.disabled = !this.model.get(this.selectedId);
            }
        }
        this.onTreeChange?.(this.model);
    }
    bind() {
        $('library-toggle').addEventListener('click', () => this.toggle($('library-panel').hidden));
        $('library-close').addEventListener('click', () => this.toggle(false));
        $('library-backdrop').addEventListener('click', () => this.toggle(false));
        $('library-root').addEventListener('click', () => {
            this.selectedId = null;
            this.present();
        });
        $('save-document').addEventListener('click', () => {
            this.captureCurrent();
            this.dirty = true;
            this.flush();
        });
        window.addEventListener('resize', () => this.updateDrawerSemantics());
        document.addEventListener('keydown', (event) => {
            const panel = $('library-panel');
            if (
                event.key === 'Tab' &&
                panel.getAttribute('aria-modal') === 'true' &&
                !$('library-dialog').open
            ) {
                const focusable = [
                    ...panel.querySelectorAll('button:not(:disabled),a[href],input,select'),
                ].filter((node) => node.getClientRects().length);
                const first = focusable[0],
                    last = focusable.at(-1);
                if (
                    event.shiftKey &&
                    (document.activeElement === first || !panel.contains(document.activeElement))
                ) {
                    event.preventDefault();
                    last?.focus();
                } else if (
                    !event.shiftKey &&
                    (document.activeElement === last || !panel.contains(document.activeElement))
                ) {
                    event.preventDefault();
                    first?.focus();
                }
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                this.captureCurrent();
                this.dirty = true;
                this.flush();
            }
            if (event.key === 'Escape' && !$('library-panel').hidden && !$('library-dialog').open) {
                this.toggle(false);
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.dirty) {
                this.flush();
            }
        });
        window.addEventListener('beforeunload', (event) => {
            if (this.dirty) {
                this.flush();
                event.preventDefault();
                event.returnValue = '';
            }
        });
        document
            .querySelectorAll('[data-library-action]')
            .forEach((button) =>
                button.addEventListener('click', () => this.request(button.dataset.libraryAction)),
            );
        $('library-cancel').addEventListener('click', () => $('library-dialog').close());
        $('library-form').addEventListener('submit', (event) => {
            event.preventDefault();
            this.submit();
        });
        $('export-markdown').addEventListener('click', () => this.export());
        const panel = $('library-panel');
        panel.addEventListener('dragstart', (event) => {
            const row = event.target.closest('.library-row');
            if (row) {
                event.dataTransfer.setData(MIME, row.dataset.id);
                event.dataTransfer.effectAllowed = 'move';
            }
        });
        const target = (event) =>
            event.target.closest('.library-row[data-kind=folder],#library-root');
        panel.addEventListener('dragover', (event) => {
            if (!event.dataTransfer.types.includes(MIME) || !target(event)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            target(event).classList.add('drop-target');
        });
        panel.addEventListener('dragleave', (event) =>
            target(event)?.classList.remove('drop-target'),
        );
        panel.addEventListener('drop', (event) => {
            const folder = target(event),
                id = event.dataTransfer.getData(MIME);
            if (!folder || !id) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            try {
                this.captureCurrent();
                this.model.move(id, folder.dataset.id || null);
                this.present();
                this.touch();
            } catch (error) {
                this.message(error.message, true);
            } finally {
                folder.classList.remove('drop-target');
            }
        });
    }
    request(action) {
        if (!this.ready) {
            return;
        }
        this.captureCurrent();
        const node = this.model.get(this.selectedId);
        this.action = action;
        if (action === 'duplicate') {
            const copy = this.model.duplicate(node.id);
            if (copy.kind === 'document') {
                this.activate(copy.id);
            } else {
                this.selectedId = copy.id;
                this.present();
                this.touch();
            }
            return;
        }
        const names = {
            'new-document': 'New document',
            'new-folder': 'New folder',
            rename: 'Rename',
            move: 'Move',
            delete: 'Delete',
        };
        $('library-dialog-title').textContent = names[action];
        $('library-dialog-description').textContent =
            action === 'delete'
                ? `Delete “${node.name}”${node.kind === 'folder' ? ` and its ${this.model.nodes.filter((item) => this.model.descendants(node.id).has(item.id) && item.kind === 'document').length} document(s)` : ''}? This removes the local copy.`
                : action === 'move'
                  ? `Choose a folder for “${node.name}”.`
                  : 'Choose a name. Your document stays on this browser and device.';
        const naming = ['new-document', 'new-folder', 'rename'].includes(action);
        $('library-name-label').hidden = !naming;
        $('library-name').required = naming;
        $('library-name').value =
            action === 'rename'
                ? node.name
                : action === 'new-folder'
                  ? 'New folder'
                  : 'Untitled.md';
        $('library-destination-label').hidden = action !== 'move';
        $('library-destination').replaceChildren();
        if (action === 'move') {
            const blocked = this.model.descendants(node.id);
            for (const folder of [
                { id: '', name: 'My documents' },
                ...this.model.nodes.filter(
                    (item) => item.kind === 'folder' && !blocked.has(item.id),
                ),
            ]) {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.id ? this.model.path(folder.id) : folder.name;
                $('library-destination').append(option);
            }
            $('library-destination').value = node.parentId || '';
        }
        $('library-submit').textContent =
            action === 'delete' ? 'Delete' : action === 'move' ? 'Move' : 'Save';
        $('library-dialog-error').textContent = '';
        $('library-dialog').showModal();
        if (naming) {
            $('library-name').select();
        }
    }
    submit() {
        try {
            const action = this.action,
                name = $('library-name').value;
            if (action === 'new-document') {
                this.addDocument(name, '');
            }
            if (action === 'new-folder') {
                this.selectedId = this.model.create('folder', name, this.destination()).id;
            }
            if (action === 'rename') {
                this.model.rename(this.selectedId, name);
                this.opening = true;
                try {
                    this.onOpen(this.model.get(this.model.activeId));
                } finally {
                    this.opening = false;
                }
            }
            if (action === 'move') {
                this.model.move(this.selectedId, $('library-destination').value || null);
            }
            if (action === 'delete') {
                this.model.remove(this.selectedId);
                if (!this.model.activeId) {
                    this.model.activeId = this.model.create('document', 'Untitled.md', null, {
                        ...this.initial,
                        source: '',
                    }).id;
                }
                this.selectedId = null;
                this.activate(this.model.activeId);
            }
            this.present();
            this.touch();
            $('library-dialog').close();
        } catch (error) {
            $('library-dialog-error').textContent = error.message;
        }
    }
    export() {
        this.captureCurrent();
        const file = this.model.get(this.model.activeId);
        if (!file) {
            return;
        }
        const url = URL.createObjectURL(
            new Blob([file.source], { type: 'text/markdown;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = /\.(md|markdown|txt)$/i.test(file.name) ? file.name : file.name + '.md';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
