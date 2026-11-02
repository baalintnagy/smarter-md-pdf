import assert from 'node:assert/strict';
import test from 'node:test';
import { Marked } from '../vendor/marked.esm.js';
import { mathExtensions } from '../src/math-markdown.js';

const marked = new Marked({ extensions: mathExtensions });

test('dollar delimiters inside backticks remain exact literal code', () => {
    assert.equal(marked.parse('`$$x$$`'), '<p><code>$$x$$</code></p>\n');
    assert.equal(
        marked.parse('Use `$$x$$` and `$y$` and ``a ` tick $$z$$`` literally.'),
        '<p>Use <code>$$x$$</code> and <code>$y$</code> and <code>a ` tick $$z$$</code> literally.</p>\n',
    );
    assert.equal(
        marked.parse('```tex\n$$x$$\n$y$\n```'),
        '<pre><code class="language-tex">$$x$$\n$y$\n</code></pre>\n',
    );
});

test('inline single and double dollars stay within the surrounding paragraph', () => {
    assert.equal(marked.parse('a$$x$$'), '<p>a<span class="math-source">x</span></p>\n');
    assert.equal(
        marked.parse('Before $$x^2$$ and $y$ after.'),
        '<p>Before <span class="math-source">x^2</span> and <span class="math-source">y</span> after.</p>\n',
    );
    assert.equal(
        marked.parse('Escaped \\$x\\$ and unfinished $$x$ and $$$y$$$.'),
        '<p>Escaped $x$ and unfinished $$x$ and $$$y$$$.</p>\n',
    );
});

test('standalone display math and TeX delimiters retain their original role', () => {
    assert.equal(
        marked.parse('Prose\n$$x^2$$'),
        '<p>Prose</p>\n<div class="math-source math-display">x^2</div>',
    );
    for (const source of ['$$x^2$$', '$$\nx^2\n$$', '\\[x^2\\]']) {
        assert.equal(marked.parse(source), '<div class="math-source math-display">x^2</div>');
    }
    assert.equal(
        marked.parse('Before \\(x\\) after.'),
        '<p>Before <span class="math-source">x</span> after.</p>\n',
    );
});
