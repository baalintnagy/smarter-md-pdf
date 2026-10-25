import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_NUMBER_FORMAT, formatPageNumber } from '../src/page-numbers.js';

test('page formats replace current/total tokens, including repeated tokens', () => {
    assert.equal(formatPageNumber(DEFAULT_PAGE_NUMBER_FORMAT, 3, 12), '3 / 12');
    assert.equal(formatPageNumber('Page {page} of {pages} — {page}', 3, 12), 'Page 3 of 12 — 3');
});

test('page formats retain literal text and unknown tokens without interpreting HTML', () => {
    assert.equal(formatPageNumber('<b>{page}</b> $& {unknown}', 1, 2), '<b>1</b> $& {unknown}');
    assert.equal(formatPageNumber('Confidential', 1, 2), 'Confidential');
});
