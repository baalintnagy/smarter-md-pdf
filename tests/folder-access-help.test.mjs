import assert from 'node:assert/strict';
import { test } from 'node:test';
import { folderAccessHelp } from '../src/folder-access-help.js';

test('folder settings links follow browser identity, with Brave taking priority over Chrome', async () => {
    const cases = [
        [
            { userAgent: 'Chrome/140', brave: { isBrave: async () => true } },
            'brave://flags/#file-system-access-api',
        ],
        [{ userAgent: 'Chrome/140 Edg/140' }, 'edge://settings/content'],
        [{ userAgent: 'Chrome/140 OPR/120' }, 'opera://settings/content'],
        [{ userAgent: 'Chrome/140' }, 'chrome://settings/content'],
    ];
    for (const [browser, expected] of cases) {
        assert.equal((await folderAccessHelp(browser)).url, expected);
    }
});

test('unsupported browsers and insecure origins receive help instead of misleading settings', async () => {
    for (const browser of [
        { userAgent: 'Firefox/140' },
        { userAgent: 'Version/18 Safari/605' },
        { userAgent: 'iPhone Chrome/140', brave: { isBrave: async () => true } },
        { platform: 'MacIntel', maxTouchPoints: 5 },
        {},
    ]) {
        assert.equal((await folderAccessHelp(browser)).label, 'Browser support');
    }
    assert.equal(
        (await folderAccessHelp({ userAgent: 'Chrome/140' }, false)).label,
        'Use HTTPS or localhost',
    );
    assert.equal(
        (
            await folderAccessHelp({
                userAgent: 'Chrome/140',
                brave: {
                    isBrave: async () => {
                        throw new Error('Unavailable');
                    },
                },
            })
        ).label,
        'Chrome settings',
    );
});
