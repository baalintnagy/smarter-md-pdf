import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, PRESETS } from '../src/settings.js';
const valid = { width: 210, height: 297, margin: 18, minScale: 90, maxScale: 100, smart: true };
test('paper presets include metric and US dimensions', () => {
    assert.deepEqual(PRESETS.A4, [210, 297]);
    assert.deepEqual(PRESETS.Letter, [215.9, 279.4]);
});
test('accepts valid custom sizes and bounded scale range', () =>
    assert.equal(validateSettings(valid), valid));
test('rejects impossible or incomplete layouts', () => {
    for (const change of [
        { width: NaN },
        { height: 0 },
        { margin: 101 },
        { minScale: 101 },
        { minScale: 95, maxScale: 90 },
        { minScale: 49 },
        { maxScale: 101 },
        { minTableRows: 0 },
        { minTableRows: 101 },
        { minTableRows: 1.5 },
        { minTableRows: NaN },
    ]) {
        assert.throws(() => validateSettings({ ...valid, ...change }));
    }
    assert.throws(() => validateSettings({ ...valid, width: 50, margin: 23 }));
});

test('accepts a configurable minimum table fragment size', () => {
    assert.equal(validateSettings({ ...valid, minTableRows: 5 }).minTableRows, 5);
});
