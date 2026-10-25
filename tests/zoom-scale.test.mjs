import assert from 'node:assert/strict';
import { test } from 'node:test';
import { positionFromZoom, zoomFromPosition } from '../src/zoom-scale.js';

test('zoom uses a logarithmic slider with bounded endpoints and consistent ratios', () => {
    assert.equal(zoomFromPosition(0), 5);
    assert.equal(zoomFromPosition(1000), 300);
    assert.equal(zoomFromPosition(-100), 5);
    assert.equal(zoomFromPosition(1100), 300);
    assert.equal(positionFromZoom(5), 0);
    assert.equal(positionFromZoom(300), 1000);
    assert.equal(zoomFromPosition(500), 39);
    for (const zoom of [5, 10, 25, 50, 100, 125, 150, 200, 300]) {
        assert.ok(Math.abs(zoomFromPosition(positionFromZoom(zoom)) - zoom) <= 1);
    }
    assert.ok(
        Math.abs(
            positionFromZoom(100) -
                positionFromZoom(50) -
                (positionFromZoom(200) - positionFromZoom(100)),
        ) <= 1,
    );
});

test('editor range is 20–250% without changing the preview range', () => {
    assert.equal(zoomFromPosition(0, 20, 250), 20);
    assert.equal(zoomFromPosition(1000, 20, 250), 250);
    assert.equal(positionFromZoom(5, 20, 250), 0);
    assert.equal(positionFromZoom(300, 20, 250), 1000);
    for (const zoom of [20, 50, 100, 150, 200, 250]) {
        assert.equal(zoomFromPosition(positionFromZoom(zoom, 20, 250), 20, 250), zoom);
    }
    assert.equal(zoomFromPosition(0), 5);
    assert.equal(zoomFromPosition(1000), 300);
});
