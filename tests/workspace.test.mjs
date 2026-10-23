import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceModel } from '../src/workspace-model.js';

test('nested trees support rename, move, and deep duplication without sharing content', () => {
    const model = new WorkspaceModel();
    const folder = model.create('folder', 'Projects');
    const nested = model.create('folder', 'Notes', folder.id);
    const document = model.create('document', 'draft.md', nested.id, {
        source: '# Draft',
        css: 'body {}',
    });
    model.rename(document.id, 'plan.md');
    assert.equal(model.path(document.id), 'Projects / Notes / plan.md');
    assert.throws(() => model.move(folder.id, nested.id), /descendants/);
    const clone = model.duplicate(folder.id);
    const copiedFolder = model.children(clone.id)[0],
        copied = model.children(copiedFolder.id)[0];
    assert.notEqual(copied.id, document.id);
    assert.equal(copied.source, '# Draft');
    copied.source = '# Copy';
    assert.equal(document.source, '# Draft');
    model.move(document.id, null);
    assert.equal(model.path(document.id), 'plan.md');
    assert.deepEqual(new WorkspaceModel(model.snapshot()).snapshot(), model.snapshot());
});

test('folder deletion removes descendants and chooses a remaining document', () => {
    const model = new WorkspaceModel();
    const folder = model.create('folder', 'Delete me');
    const nested = model.create('folder', 'Inner', folder.id);
    const document = model.create('document', 'inside.md', nested.id, { source: 'inside' });
    const other = model.create('document', 'keep.md', null, { source: 'keep' });
    model.activeId = document.id;
    model.remove(folder.id);
    assert.equal(model.nodes.length, 1);
    assert.equal(model.activeId, other.id);
    assert.equal(model.get(document.id), undefined);
});

test('names and corrupt or cyclic snapshots are rejected', () => {
    const model = new WorkspaceModel();
    const document = model.create('document', 'same.md', null, { source: '' });
    assert.equal(model.create('document', 'same.md', null, { source: '' }).name, 'same 2.md');
    assert.throws(() => model.rename(document.id, 'same 2.md'), /already exists/);
    for (const name of ['', 'a/b', 'a\\b']) {
        assert.throws(() => model.create('folder', name));
    }
    assert.throws(
        () =>
            new WorkspaceModel({ nodes: [{ id: 'a', kind: 'folder', name: 'a', parentId: 'a' }] }),
        /cycle/,
    );
    assert.throws(
        () =>
            new WorkspaceModel({
                nodes: [{ id: 'a', kind: 'folder', name: 'a', parentId: 'missing' }],
            }),
    );
});
