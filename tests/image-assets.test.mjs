import test from 'node:test';
import assert from 'node:assert/strict';
import { imageAssetKey, findImageAsset, resolveEditorImage } from '../src/image-assets.js';

test('image lookup preserves decoded paths, basename fallback and malformed escapes', () => {
    const assets = new Map([
        ['images/my photo.png', 'blob:exact'],
        ['my photo.png', 'blob:fallback'],
        ['bad%path.png', 'blob:malformed'],
    ]);
    assert.equal(resolveEditorImage('./images/my%20photo.png', assets), 'blob:exact');
    assert.equal(resolveEditorImage('other/my%20photo.png', assets), 'blob:fallback');
    assert.equal(resolveEditorImage('bad%path.png', assets), 'blob:malformed');
    assert.equal(imageAssetKey('./bad%path.png'), './bad%path.png');
    assert.equal(findImageAsset(assets, 'missing.png'), undefined);
});

test('visual images allow remote HTTP URLs and only locally registered blob URLs', () => {
    const assets = new Map([['photo.png', 'blob:registered']]);
    for (const url of ['https://example.com/remote.png', 'http://example.com/remote.png']) {
        assert.equal(resolveEditorImage(url, assets), url);
    }
    assert.equal(resolveEditorImage('photo.png', assets), 'blob:registered');
    assert.equal(resolveEditorImage('https://example.com/photo.png', assets), 'blob:registered');
    for (const url of [
        'missing.png',
        'blob:unknown',
        'data:image/png;base64,abc',
        'javascript:1',
    ]) {
        assert.equal(resolveEditorImage(url, assets), '');
    }
});

test('image lookup supports the folder-relative storage adapter without requiring a Map', () => {
    const assets = { get: (key) => (key === 'nested/photo.png' ? 'blob:folder' : undefined) };
    assert.equal(resolveEditorImage('./nested/photo.png', assets), 'blob:folder');
});
