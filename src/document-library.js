import { showLibraryDialog } from './library-dialog.js';
import { WorkspaceModel } from './workspace-model.js';
import { WorkspaceStorage } from './workspace-storage.js';
import { DirectoryStorage, directoryPaths } from './directory-storage.js';
import { folderAccessHelp } from './folder-access-help.js';
import { LibraryTree } from './library-tree.js';
import './document-library.css';

const $ = (id) => document.getElementById(id);

/** Local document lifecycle and drawer UI, independent of Markdown rendering and pagination. */
export class DocumentLibrary {
    constructor({ capture, onOpen, onTreeChange, assets, initial }) {
        this.capture = capture;
        this.onOpen = onOpen;
        this.assets = assets;
        this.initial = initial;
        this.onTreeChange = onTreeChange;
        this.storage = new WorkspaceStorage();
        this.browserStorage = this.storage;
        this.model = new WorkspaceModel();
        this.generation = 0;
        this.dirty = false;
        this.ready = false;
        this.dbRevision = 0;
        this.selectedId = null;
        this.rootExpanded = true;
        this.opening = false;
        this.saveError = false;
        this.bind();
        this.initialized = this.initialize();
    }
    async initialize() {
        try {
            this.folderHelp = await folderAccessHelp(navigator, window.isSecureContext);
            this.rememberedDirectory = await this.browserStorage.directoryHandle();
            if (this.rememberedDirectory && window.showDirectoryPicker) {
                const directory = new DirectoryStorage(this.rememberedDirectory);
                if (await directory.permission()) {
                    this.storage = directory;
                }
            }
            const loaded = await this.storage.load();
            this.dbRevision = loaded.revision;
            this.model = new WorkspaceModel(loaded.snapshot);
            this.assets.restoreAssets(loaded.assets);
            const empty = !this.model.nodes.some((node) => node.kind === 'document');
            if (empty) {
                this.model.activeId = this.model.create(
                    'document',
                    this.initial.name,
                    null,
                    this.storage instanceof DirectoryStorage
                        ? { ...this.initial, source: '' }
                        : this.initial,
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
                empty ||
                live.source !== this.initial.source ||
                live.css !== this.initial.css
            ) {
                this.touch();
                await this.flush();
            } else {
                this.message(this.savedMessage());
            }
            this.presentStorage();
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
            this.presentStorage();
        }
    }
    savedMessage() {
        return this.storage instanceof DirectoryStorage
            ? `Saved to folder: ${this.storage.handle.name}`
            : 'Saved on this device';
    }
    assetPrefix(folderId) {
        if (!(this.storage instanceof DirectoryStorage)) {
            return '';
        }
        const parent =
            folderId === undefined ? this.model.get(this.model.activeId)?.parentId : folderId;
        return parent ? `${directoryPaths(this.model.snapshot()).get(parent)}/` : '';
    }
    imageAssets() {
        if (!(this.storage instanceof DirectoryStorage)) {
            return this.assets.assets;
        }
        let prefix;
        try {
            prefix = this.assetPrefix();
        } catch {
            return this.assets.assets;
        }
        const resolve = (key) => {
            try {
                const url = new URL(
                    key,
                    `https://folder.invalid/${prefix.split('/').map(encodeURIComponent).join('/')}`,
                );
                return url.origin === 'https://folder.invalid'
                    ? this.assets.assets.get(decodeURIComponent(url.pathname.slice(1)))
                    : undefined;
            } catch {
                return undefined;
            }
        };
        return {
            get: resolve,
            has: (key) => Boolean(resolve(key)),
            values: () => this.assets.assets.values(),
        };
    }
    presentStorage() {
        const disk = this.storage instanceof DirectoryStorage;
        const supported = typeof window.showDirectoryPicker === 'function';
        $('storage-location').textContent = disk
            ? `Storage: local folder “${this.storage.handle.name}”`
            : 'Storage: browser library';
        $('open-directory').disabled = !supported || this.switching;
        $('copy-directory').disabled = !supported || disk || this.switching;
        $('directory-support').hidden = supported;
        if (this.folderHelp) {
            $('directory-settings').textContent = this.folderHelp.url.startsWith('https:')
                ? this.folderHelp.label
                : `Copy link to ${this.folderHelp.label}`;
            $('directory-settings').href = this.folderHelp.url;
            $('directory-settings').title = this.folderHelp.url.startsWith('https:')
                ? 'Open browser help'
                : 'Browsers block websites from opening internal settings pages. Click to copy this link, then paste it into the address bar.';
        }
        $('browser-library').hidden = !disk && !this.rememberedDirectory;
        $('reload-directory').hidden = !disk;
        $('reconnect-directory').hidden = !this.rememberedDirectory;
        $('library-storage-help').textContent = disk
            ? 'Changes save directly to disk. Reload the folder to read external edits. Unrelated files and images are preserved when deleting folders.'
            : this.rememberedDirectory
              ? 'The local folder is disconnected. Reconnect it to continue there. Current edits save in the browser library.'
              : 'Saved on this browser and device. Drag items into folders to organize them.';
    }
    async useStorage(storage, loaded) {
        const model = new WorkspaceModel(loaded.snapshot);
        const empty = !model.nodes.some((node) => node.kind === 'document');
        if (empty) {
            model.activeId = model.create('document', 'Untitled.md', null, {
                ...this.initial,
                source: '',
            }).id;
        }
        model.activeId ||= model.nodes.find((node) => node.kind === 'document').id;
        clearTimeout(this.timer);
        this.assets.dispose();
        this.assets.assets.clear();
        this.assets.blobs.clear();
        this.assets.pendingAssets.clear();
        this.assets.restoreAssets(loaded.assets);
        this.storage = storage;
        this.model = model;
        this.dbRevision = loaded.revision;
        this.selectedId = null;
        this.dirty = false;
        this.saveError = false;
        this.unavailable = false;
        this.activate(model.activeId, false);
        this.presentStorage();
        this.message(this.savedMessage());
        if (empty) {
            this.touch();
            await this.flush();
        }
    }
    async switchStorage(action) {
        if (!this.ready || this.switching) {
            return;
        }
        // Open the picker while the click still has transient user activation.
        let picking;
        if (action === 'open' || action === 'copy') {
            picking = window.showDirectoryPicker({ mode: 'readwrite', id: 'md-pdf-library' });
        } else if (action === 'reconnect') {
            picking = new DirectoryStorage(this.rememberedDirectory).permission(true);
        }
        this.switching = true;
        document.body.inert = true;
        this.presentStorage();
        try {
            const selected = picking ? await picking : null;
            if (action === 'reconnect' && !selected) {
                throw new Error('Folder access was not granted.');
            }
            clearTimeout(this.timer);
            if (action === 'reload' && this.saving) {
                await this.saving;
            }
            if (
                action !== 'reload' &&
                !(await this.flush()) &&
                !window.confirm(
                    'The current library could not be saved. Export unsaved Markdown before leaving. Switch storage and discard unsaved changes?',
                )
            ) {
                return;
            }
            if (
                action === 'reload' &&
                this.dirty &&
                !window.confirm(
                    'Reloading discards unsaved changes. Export Markdown first if you need a copy. Reload now?',
                )
            ) {
                return;
            }
            const storage =
                action === 'browser'
                    ? this.browserStorage
                    : new DirectoryStorage(
                          action === 'reload'
                              ? this.storage.handle
                              : action === 'reconnect'
                                ? this.rememberedDirectory
                                : selected,
                      );
            const loaded = await storage.load();
            if (action === 'copy') {
                if (storage.baseline.size) {
                    throw new Error(
                        'Choose an empty folder to copy the browser library without replacing existing files.',
                    );
                }
                const snapshot = this.model.snapshot();
                const assets = new Map(this.assets.blobs);
                const paths = directoryPaths(snapshot);
                // Browser documents share an image pool; make those images available relative
                // to each migrated document as well as at the workspace root.
                for (const node of snapshot.nodes.filter(
                    (item) => item.kind === 'document' && item.parentId,
                )) {
                    const prefix = `${paths.get(node.parentId)}/`;
                    for (const [key, blob] of this.assets.blobs) {
                        assets.set(prefix + key, blob);
                    }
                }
                await storage.save(snapshot, 0, assets);
                Object.assign(loaded, await storage.load());
            }
            await this.browserStorage.rememberDirectory(
                action === 'browser' ? null : storage.handle,
            );
            this.rememberedDirectory = action === 'browser' ? null : storage.handle;
            await this.useStorage(storage, loaded);
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.message(error.message, true);
            }
        } finally {
            document.body.inert = false;
            this.switching = false;
            this.presentStorage();
            if (this.dirty && !this.saveError && !this.unavailable) {
                this.timer = setTimeout(() => this.flush(), 150);
            }
        }
    }
    message(text, error = false) {
        $('save-state').textContent = text;
        $('save-state').hidden = !error && text === this.savedMessage();
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
    saveCurrent() {
        this.captureCurrent();
        this.dirty = true;
        return this.flush();
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
                this.message(this.dirty ? 'Saving locally…' : this.savedMessage());
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
        if (!this.tree) {
            this.tree = new LibraryTree($('library-tree'), {
                select: (id) => {
                    if (this.model.get(id)?.kind === 'document') {
                        this.activate(id);
                    } else {
                        this.selectedId = id;
                        this.present();
                    }
                },
                expand: (id, expanded) => {
                    if (id === null) {
                        this.rootExpanded = expanded;
                    } else {
                        if (expanded) {
                            this.model.expanded.add(id);
                        } else {
                            this.model.expanded.delete(id);
                        }
                        this.touch();
                    }
                },
                move: (id, parentId) => {
                    try {
                        this.captureCurrent();
                        this.model.move(id, parentId);
                        this.rootExpanded = true;
                        this.present();
                        this.touch();
                    } catch (error) {
                        this.message(error.message, true);
                    }
                },
            });
        }
        this.tree.present(this.model, this.selectedId, this.rootExpanded);
        $('export-markdown').disabled = this.model.get(this.selectedId)?.kind !== 'document';
        for (const button of document.querySelectorAll('[data-library-action]')) {
            if (!button.dataset.libraryAction.startsWith('new-')) {
                button.disabled = !this.model.get(this.selectedId);
            }
        }
        this.onTreeChange?.(this.model);
    }
    bind() {
        $('directory-settings').addEventListener('click', async (event) => {
            const url = this.folderHelp?.url;
            if (!url || url.startsWith('https:')) {
                return;
            }
            event.preventDefault();
            const link = $('directory-settings');
            try {
                await navigator.clipboard.writeText(url);
                this.settingsFeedback?.cancel();
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                this.settingsFeedback = link.animate(
                    reduced
                        ? [{ backgroundColor: 'var(--soft)' }, { backgroundColor: 'transparent' }]
                        : [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
                    { duration: 600, easing: 'ease-out' },
                );
            } catch {
                link.title = `Copy was blocked. Copy this address manually and paste it into the address bar: ${url}. Browsers block websites from opening internal settings pages.`;
            }
        });
        for (const [id, action] of Object.entries({
            'open-directory': 'open',
            'copy-directory': 'copy',
            'reconnect-directory': 'reconnect',
            'reload-directory': 'reload',
            'browser-library': 'browser',
        })) {
            $(id).addEventListener('click', () => this.switchStorage(action));
        }
        $('library-toggle').addEventListener('click', () => this.toggle($('library-panel').hidden));
        $('library-close').addEventListener('click', () => this.toggle(false));
        $('library-backdrop').addEventListener('click', () => this.toggle(false));
        $('save-document').addEventListener('click', () => this.saveCurrent());
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
                this.saveCurrent();
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
        showLibraryDialog(action, node, this.model, this.storage instanceof DirectoryStorage);
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
        const file = this.model.get(this.selectedId);
        if (file?.kind !== 'document') {
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
