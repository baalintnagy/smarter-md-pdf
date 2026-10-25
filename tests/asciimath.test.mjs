import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inlineAsciiMath } from '../src/asciimath.js';

test('inline AsciiMath consumes one balanced expression and preserves its exact source', () => {
    assert.deepEqual(inlineAsciiMath('@{sqrt({x + 1})} after'), {
        type: 'inlineAsciiMath',
        raw: '@{sqrt({x + 1})}',
        text: 'sqrt({x + 1})',
    });
    assert.equal(inlineAsciiMath('@{a/b} and @{c/d}').text, 'a/b');
    assert.equal(inlineAsciiMath('@{x < y & y > 0}').text, 'x < y & y > 0');
    assert.equal(inlineAsciiMath('@{text("}") + x}').text, 'text("}") + x');
});

test('incomplete, empty, multiline and ordinary text stay literal', () => {
    for (const source of [
        '@{',
        '@{x',
        '@{}',
        '@{ }',
        '@{x\ny}',
        '@{x\ry}',
        'ordinary text',
        '@{sqrt({x)}',
    ]) {
        assert.equal(inlineAsciiMath(source), undefined, source);
    }
});
