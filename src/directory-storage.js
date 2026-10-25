import { WorkspaceModel } from './workspace-model.js';

const METADATA = '.md-pdf.json';
const markdown = (path) => /\.(md|markdown|txt)$/i.test(path);
const image = (path) => /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path);
const conflict = () =>
    new Error(
        'The folder changed outside this app. Export any unsaved Markdown, then reload the folder before saving.',
    );

const safePath = (path) => {
    if (
        path
            .split('/')
            .some(
                (part) =>
                    !part ||
                    part.startsWith('.') ||
                    part === 'node_modules' ||
                    /[<>:"\\|?*\u0000-\u001f]/.test(part) ||
                    /[. ]$/.test(part) ||
                    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) ||
                    part.toLowerCase() === METADATA,
            )
    ) {
        throw new Error(`“${path}” cannot be used as a local file or folder name.`);
    }
    return path;
};

export const directoryPaths = (snapshot) => {
    const model = new WorkspaceModel(snapshot);
    const paths = new Map();
    const pathOf = (node) => {
        if (!paths.has(node.id)) {
            const name =
                node.kind === 'document' && !markdown(node.name) ? `${node.name}.md` : node.name;
            const parent = model.get(node.parentId);
            paths.set(node.id, safePath(`${parent ? `${pathOf(parent)}/` : ''}${name}`));
        }
        return paths.get(node.id);
    };
    model.nodes.forEach(pathOf);
    if (new Set([...paths.values()].map((path) => path.toLowerCase())).size !== paths.size) {
        throw new Error(
            'Two library items would use the same disk path. Rename one before saving.',
        );
    }
    return paths;
};

/** Ordinary Markdown files plus a portable companion file for styles and paper settings. */
export class DirectoryStorage {
    constructor(handle) {
        this.handle = handle;
    }
    async permission(request = false) {
        const options = { mode: 'readwrite' };
        return (
            (await this.handle[request ? 'requestPermission' : 'queryPermission'](options)) ===
            'granted'
        );
    }
    async scan() {
        const entries = new Map();
        const walk = async (directory, prefix = '') => {
            for await (const handle of directory.values()) {
                const path = `${prefix}${handle.name}`;
                if (handle.kind === 'directory') {
                    // Hidden/tool directories are outside the document library.
                    if (!handle.name.startsWith('.') && handle.name !== 'node_modules') {
                        entries.set(path, { kind: 'folder' });
                        await walk(handle, `${path}/`);
                    } else {
                        entries.set(path, { kind: 'ignored' });
                    }
                } else {
                    const file = await handle.getFile();
                    const entry = { kind: 'file' };
                    if (markdown(path) || path === METADATA) {
                        entry.text = await file.text();
                    } else if (image(path)) {
                        entry.blob = file;
                        entry.hash = Array.from(
                            new Uint8Array(
                                await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
                            ),
                        ).join(',');
                    }
                    entries.set(path, entry);
                }
            }
        };
        await walk(this.handle);
        if (new Set([...entries.keys()].map((path) => path.toLowerCase())).size !== entries.size) {
            throw new Error(
                'This folder contains names that differ only in capitalization. Rename them before opening it.',
            );
        }
        return entries;
    }
    fingerprint(entries) {
        return JSON.stringify(
            [...entries]
                .map(([path, entry]) => [path, entry.kind, entry.text, entry.hash])
                .sort((a, b) => a[0].localeCompare(b[0])),
        );
    }
    async load() {
        const entries = await this.scan();
        let metadata = { version: 1, documents: {}, activePath: null, expanded: [] };
        const metadataEntry = entries.get(METADATA);
        if (metadataEntry) {
            metadata = JSON.parse(metadataEntry.text);
            if (
                metadata.version !== 1 ||
                !metadata.documents ||
                !Array.isArray(metadata.expanded)
            ) {
                throw new Error('This folder has unsupported MD-PDF metadata.');
            }
        }
        const model = new WorkspaceModel();
        const ids = new Map();
        const assets = [];
        for (const [path, entry] of [...entries].sort(
            (a, b) => a[0].split('/').length - b[0].split('/').length,
        )) {
            if (entry.kind === 'folder' || (entry.kind === 'file' && markdown(path))) {
                const parentPath = path.split('/').slice(0, -1).join('/');
                const node = model.create(
                    entry.kind === 'folder' ? 'folder' : 'document',
                    path.split('/').at(-1),
                    ids.get(parentPath) || null,
                    { ...metadata.documents[path], source: entry.text || '' },
                );
                ids.set(path, node.id);
            } else if (entry.blob) {
                assets.push({ key: path, blob: entry.blob });
            }
        }
        model.activeId = ids.get(metadata.activePath) || null;
        model.expanded = new Set(metadata.expanded.map((path) => ids.get(path)).filter(Boolean));
        this.baseline = entries;
        this.revision = 0;
        return { snapshot: model.snapshot(), assets, revision: 0 };
    }
    async directory(path, create = false) {
        let directory = this.handle;
        for (const part of path.split('/').filter(Boolean)) {
            directory = await directory.getDirectoryHandle(part, { create });
        }
        return directory;
    }
    async write(path, content) {
        const parts = path.split('/');
        const name = parts.pop();
        const directory = await this.directory(parts.join('/'), true);
        const handle = await directory.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        try {
            await stream.write(content);
            await stream.close();
        } catch (error) {
            await stream.abort().catch(() => {});
            throw error;
        }
    }
    async save(snapshot, expectedRevision, assets) {
        const save = () => this.saveUnlocked(snapshot, expectedRevision, assets);
        return globalThis.navigator?.locks
            ? navigator.locks.request(`md-pdf-folder:${this.handle.name}`, save)
            : save();
    }
    async saveUnlocked(snapshot, expectedRevision, assets) {
        if (this.failed) {
            throw new Error(
                'Reload the folder before retrying a failed disk save. Export unsaved Markdown first.',
            );
        }
        if (!(await this.permission())) {
            throw new Error('Folder access is required. Use Reconnect folder, then save again.');
        }
        if (
            expectedRevision !== this.revision ||
            this.fingerprint(await this.scan()) !== this.fingerprint(this.baseline)
        ) {
            throw conflict();
        }
        const paths = directoryPaths(snapshot);
        const desired = new Map(snapshot.nodes.map((node) => [paths.get(node.id), node]));
        const writes = new Map();
        for (const [path, node] of desired) {
            const existing = this.baseline.get(path);
            if (
                existing &&
                (node.kind === 'folder'
                    ? existing.kind !== 'folder'
                    : !markdown(path) || existing.kind !== 'file')
            ) {
                throw new Error(`“${path}” already exists and cannot be replaced.`);
            }
            if (node.kind === 'document') {
                writes.set(path, node.source);
            }
        }
        for (const [path, blob] of assets) {
            safePath(path);
            if (
                !image(path) ||
                desired.has(path) ||
                (this.baseline.has(path) && !this.baseline.get(path).blob)
            ) {
                throw new Error(`The image path “${path}” conflicts with an existing item.`);
            }
            writes.set(path, blob);
        }
        // Check every target and parent before the first mutation, including image-only directories.
        const targets = new Map([...desired].map(([path, node]) => [path, node.kind]));
        for (const path of writes.keys()) {
            targets.set(path, 'document');
        }
        for (const path of [...targets.keys()]) {
            const parts = path.split('/');
            parts.pop();
            while (parts.length) {
                const parent = parts.join('/');
                if (targets.has(parent) && targets.get(parent) !== 'folder') {
                    throw new Error(`“${parent}” is a file, so it cannot contain other files.`);
                }
                targets.set(parent, 'folder');
                parts.pop();
            }
        }
        const existingNames = new Map(
            [...this.baseline.keys()].map((path) => [path.toLowerCase(), path]),
        );
        const targetNames = new Set();
        for (const [path, kind] of targets) {
            const lower = path.toLowerCase();
            if (
                targetNames.has(lower) ||
                (existingNames.has(lower) && existingNames.get(lower) !== path)
            ) {
                throw new Error(
                    `“${path}” conflicts with another disk path's capitalization. Use a different name.`,
                );
            }
            targetNames.add(lower);
            if (
                kind === 'folder' &&
                this.baseline.has(path) &&
                this.baseline.get(path).kind !== 'folder'
            ) {
                throw new Error(`“${path}” already exists as a file.`);
            }
        }
        const documents = Object.fromEntries(
            snapshot.nodes
                .filter((node) => node.kind === 'document')
                .map((node) => {
                    const { css, template, settings } = node;
                    return [paths.get(node.id), { css, template, settings }];
                }),
        );
        writes.set(
            METADATA,
            JSON.stringify(
                {
                    version: 1,
                    documents,
                    activePath: paths.get(snapshot.activeId),
                    expanded: snapshot.expanded.map((id) => paths.get(id)).filter(Boolean),
                },
                null,
                4,
            ) + '\n',
        );
        try {
            for (const [path, node] of desired) {
                if (node.kind === 'folder') {
                    await this.directory(path, true);
                }
            }
            for (const [path, content] of writes) {
                if (typeof content !== 'string' || this.baseline.get(path)?.text !== content) {
                    await this.write(path, content);
                }
            }
            for (const [path, entry] of this.baseline) {
                if (entry.kind === 'file' && markdown(path) && !desired.has(path)) {
                    const parts = path.split('/');
                    const name = parts.pop();
                    await (await this.directory(parts.join('/'))).removeEntry(name);
                }
            }
            // Only remove empty old folders. Unrelated files and images are never recursively deleted.
            for (const [path, entry] of [...this.baseline].sort(
                (a, b) => b[0].length - a[0].length,
            )) {
                if (entry.kind === 'folder' && !desired.has(path)) {
                    const parts = path.split('/');
                    const name = parts.pop();
                    try {
                        await (await this.directory(parts.join('/'))).removeEntry(name);
                    } catch (error) {
                        if (
                            error.name !== 'InvalidModificationError' &&
                            error.name !== 'NotFoundError'
                        ) {
                            throw error;
                        }
                    }
                }
            }
            this.baseline = await this.scan();
            return ++this.revision;
        } catch (error) {
            this.failed = true;
            throw error;
        }
    }
}
