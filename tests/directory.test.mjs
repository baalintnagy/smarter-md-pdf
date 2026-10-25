import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DirectoryStorage, directoryPaths } from '../src/directory-storage.js';
import { WorkspaceModel } from '../src/workspace-model.js';

class FileHandle {
    constructor(name, content = '') {
        this.name = name;
        this.kind = 'file';
        this.content = new Blob([content]);
    }
    async getFile() {
        return this.content;
    }
    async createWritable() {
        return {
            write: async (content) => {
                this.pending = new Blob([content]);
            },
            close: async () => {
                this.content = this.pending;
            },
            abort: async () => {},
        };
    }
}
class DirectoryHandle {
    constructor(name = 'Documents') {
        this.name = name;
        this.kind = 'directory';
        this.entries = new Map();
        this.granted = true;
    }
    async queryPermission() {
        return this.granted ? 'granted' : 'denied';
    }
    async requestPermission() {
        return this.queryPermission();
    }
    async *values() {
        yield* this.entries.values();
    }
    async entry(name, kind, create) {
        let entry = this.entries.get(name);
        if (!entry && create) {
            entry = kind === 'file' ? new FileHandle(name) : new DirectoryHandle(name);
            this.entries.set(name, entry);
        }
        if (!entry) {
            throw new DOMException('Missing', 'NotFoundError');
        }
        if (entry.kind !== kind) {
            throw new DOMException('Wrong kind', 'TypeMismatchError');
        }
        return entry;
    }
    async getFileHandle(name, options = {}) {
        return this.entry(name, 'file', options.create);
    }
    async getDirectoryHandle(name, options = {}) {
        return this.entry(name, 'directory', options.create);
    }
    async removeEntry(name) {
        const entry = this.entries.get(name);
        if (!entry) {
            throw new DOMException('Missing', 'NotFoundError');
        }
        if (entry.kind === 'directory' && entry.entries.size) {
            throw new DOMException('Not empty', 'InvalidModificationError');
        }
        this.entries.delete(name);
    }
}
const documentModel = () => {
    const model = new WorkspaceModel();
    const folder = model.create('folder', 'Notes');
    const doc = model.create('document', 'Plan.md', folder.id, {
        source: '# Plan',
        css: '.document { color: blue; }',
        template: 'custom',
        settings: { width: '210' },
    });
    model.activeId = doc.id;
    return { model, folder, doc };
};

test('folder storage round-trips Markdown, styles, settings, nested folders and image bytes', async () => {
    const root = new DirectoryHandle();
    const storage = new DirectoryStorage(root);
    await storage.load();
    const { model } = documentModel();
    assert.equal(
        await storage.save(
            model.snapshot(),
            0,
            new Map([['Notes/chart.png', new Blob(['image bytes'])]]),
        ),
        1,
    );
    const notes = await root.getDirectoryHandle('Notes');
    assert.equal(await (await (await notes.getFileHandle('Plan.md')).getFile()).text(), '# Plan');
    const loaded = await new DirectoryStorage(root).load();
    const doc = loaded.snapshot.nodes.find((node) => node.kind === 'document');
    assert.equal(doc.css, '.document { color: blue; }');
    assert.equal(doc.settings.width, '210');
    assert.equal(loaded.snapshot.activeId, doc.id);
    assert.equal(loaded.assets[0].key, 'Notes/chart.png');
    assert.equal(await loaded.assets[0].blob.text(), 'image bytes');
});

test('external edits, additions, deletions and stale tabs block disk writes', async () => {
    for (const change of ['edit', 'add', 'delete', 'metadata', 'image']) {
        const root = new DirectoryHandle();
        const storage = new DirectoryStorage(root);
        await storage.load();
        const { model } = documentModel();
        await storage.save(model.snapshot(), 0, new Map([['photo.png', new Blob(['old'])]]));
        const stale = new DirectoryStorage(root);
        const loaded = await stale.load();
        const notes = await root.getDirectoryHandle('Notes');
        if (change === 'edit') {
            notes.entries.set('Plan.md', new FileHandle('Plan.md', '# External'));
        }
        if (change === 'add') {
            root.entries.set('Other.md', new FileHandle('Other.md', '# Other'));
        }
        if (change === 'delete') {
            notes.entries.delete('Plan.md');
        }
        if (change === 'metadata') {
            root.entries.set('.md-pdf.json', new FileHandle('.md-pdf.json', '{}'));
        }
        if (change === 'image') {
            root.entries.set('photo.png', new FileHandle('photo.png', 'new'));
        }
        await assert.rejects(stale.save(loaded.snapshot, 0, new Map()), /changed outside/);
    }
    const storage = new DirectoryStorage(new DirectoryHandle());
    await storage.load();
    const { model } = documentModel();
    await storage.save(model.snapshot(), 0, new Map());
    await assert.rejects(storage.save(model.snapshot(), 0, new Map()), /changed outside/);
});

test('renaming and deleting documents preserves unrelated files and image-containing folders', async () => {
    const root = new DirectoryHandle();
    const storage = new DirectoryStorage(root);
    await storage.load();
    const { model } = documentModel();
    await storage.save(model.snapshot(), 0, new Map([['Notes/photo.png', new Blob(['photo'])]]));
    const notes = await root.getDirectoryHandle('Notes');
    notes.entries.set('keep.bin', new FileHandle('keep.bin', 'untouched'));
    const loaded = await storage.load();
    const current = new WorkspaceModel(loaded.snapshot);
    current.rename(current.nodes.find((node) => node.kind === 'document').id, 'Renamed');
    await storage.save(current.snapshot(), 0, new Map());
    assert.equal(notes.entries.has('Plan.md'), false);
    assert.equal(notes.entries.has('Renamed.md'), true);
    current.remove(current.nodes.find((node) => node.kind === 'folder').id);
    await storage.save(current.snapshot(), 1, new Map());
    assert.equal(notes.entries.has('Renamed.md'), false);
    assert.equal(await (await notes.entries.get('keep.bin').getFile()).text(), 'untouched');
    assert.equal(notes.entries.has('photo.png'), true);
});

test('invalid and colliding disk paths are rejected before writing', async () => {
    for (const name of ['..', 'CON', '.git', 'bad:name', 'trailing.', 'node_modules']) {
        const model = new WorkspaceModel();
        model.create('folder', name);
        assert.throws(() => directoryPaths(model.snapshot()), /cannot be used/);
    }
    const model = new WorkspaceModel();
    model.create('document', 'Plan');
    model.create('document', 'Plan.md');
    assert.throws(() => directoryPaths(model.snapshot()), /same disk path/);
    const root = new DirectoryHandle();
    root.entries.set('Notes', new FileHandle('Notes', 'keep me'));
    const storage = new DirectoryStorage(root);
    await storage.load();
    await assert.rejects(
        storage.save(documentModel().model.snapshot(), 0, new Map()),
        /already exists/,
    );
    assert.equal(root.entries.has('.md-pdf.json'), false);
});

test('revoked permissions and malformed metadata do not overwrite disk contents', async () => {
    const root = new DirectoryHandle();
    const storage = new DirectoryStorage(root);
    await storage.load();
    root.granted = false;
    await assert.rejects(
        storage.save(documentModel().model.snapshot(), 0, new Map()),
        /access is required/,
    );
    assert.equal(root.entries.size, 0);
    root.entries.set('.md-pdf.json', new FileHandle('.md-pdf.json', 'broken json'));
    await assert.rejects(storage.load(), SyntaxError);
    assert.equal(await (await root.entries.get('.md-pdf.json').getFile()).text(), 'broken json');
});

test('image parent collisions and case-only renames fail before any files are changed', async () => {
    const root = new DirectoryHandle();
    root.entries.set('Pictures', new FileHandle('Pictures', 'unrelated'));
    const storage = new DirectoryStorage(root);
    await storage.load();
    await assert.rejects(
        storage.save(
            documentModel().model.snapshot(),
            0,
            new Map([['Pictures/photo.png', new Blob(['image'])]]),
        ),
        /already exists as a file/,
    );
    assert.equal(root.entries.has('Notes'), false);
    root.entries.delete('Pictures');
    await storage.load();
    const { model, doc } = documentModel();
    await storage.save(model.snapshot(), 0, new Map());
    model.rename(doc.id, 'plan.md');
    await assert.rejects(storage.save(model.snapshot(), 1, new Map()), /capitalization/);
    const notes = await root.getDirectoryHandle('Notes');
    assert.equal(notes.entries.has('Plan.md'), true);
    assert.equal(notes.entries.has('plan.md'), false);
});

test('a partial disk failure stops retries until the folder is reloaded', async () => {
    const root = new DirectoryHandle();
    const storage = new DirectoryStorage(root);
    await storage.load();
    const { model, doc } = documentModel();
    await storage.save(model.snapshot(), 0, new Map());
    const handle = (await root.getDirectoryHandle('Notes')).entries.get('Plan.md');
    handle.createWritable = async () => {
        throw new DOMException('Disk full', 'QuotaExceededError');
    };
    doc.source = '# New text';
    await assert.rejects(storage.save(model.snapshot(), 1, new Map()), /Disk full/);
    await assert.rejects(storage.save(model.snapshot(), 1, new Map()), /Reload the folder/);
    assert.equal(await (await handle.getFile()).text(), '# Plan');
    const loaded = await new DirectoryStorage(root).load();
    assert.equal(loaded.snapshot.nodes.find((node) => node.kind === 'document').source, '# Plan');
});
