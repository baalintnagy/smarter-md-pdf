import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForImages } from '../src/preview-images.js';

class ImageStub extends EventTarget {
    constructor(complete = false, naturalWidth = 0, naturalHeight = 0) {
        super();
        Object.assign(this, { complete, naturalWidth, naturalHeight });
        this.listeners = new Set();
    }
    addEventListener(type, listener) {
        super.addEventListener(type, listener);
        this.listeners.add(listener);
    }
    removeEventListener(type, listener) {
        super.removeEventListener(type, listener);
        this.listeners.delete(listener);
    }
    removeAttribute(name) {
        this.removedAttribute = name;
    }
}

const rootOf = (...images) => ({ querySelectorAll: () => images });

test('cached images receive natural dimensions and cached failures are counted', async () => {
    const loaded = new ImageStub(true, 640, 480);
    const broken = new ImageStub(true);
    assert.equal(await waitForImages(rootOf(loaded, broken)), 1);
    assert.equal(loaded.width, 640);
    assert.equal(loaded.height, 480);
    assert.equal(broken.width, undefined);
    assert.equal(await waitForImages(rootOf()), 0);
});

test('pending images settle on load or error and release both event listeners', async () => {
    const loaded = new ImageStub(false, 320, 240);
    const broken = new ImageStub();
    const pending = waitForImages(rootOf(loaded, broken));
    loaded.dispatchEvent(new Event('load'));
    loaded.dispatchEvent(new Event('error'));
    broken.dispatchEvent(new Event('error'));
    assert.equal(await pending, 1);
    assert.equal(loaded.width, 320);
    assert.equal(loaded.height, 240);
    assert.equal(loaded.listeners.size, 0);
    assert.equal(broken.listeners.size, 0);
});

test('stalled images time out, stop loading and release their listeners', async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const stalled = new ImageStub();
    const pending = waitForImages(rootOf(stalled));
    context.mock.timers.tick(5000);
    assert.equal(await pending, 1);
    assert.equal(stalled.removedAttribute, 'src');
    assert.equal(stalled.listeners.size, 0);
});
