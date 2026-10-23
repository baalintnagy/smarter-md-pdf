import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Bundling removes package directories; retain their production license notices in the site.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [
    'THIRD-PARTY NOTICES\nSmarter MD / PDF bundles the following open-source packages.',
];
notices.push(`Marked (vendored 17.0.5)\n${await readFile('vendor/MARKED-LICENSE.md', 'utf8')}`);
for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.dev || entry.link) {
        continue;
    }
    let files, metadata;
    try {
        files = await readdir(path);
        metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT' && entry.optional) {
            continue;
        }
        throw error;
    }
    const licenses = files.filter((name) => /^(licen[sc]e|notice|copying)(\.|$)/i.test(name));
    const contents = [];
    for (const name of licenses) {
        try {
            contents.push(await readFile(join(path, name), 'utf8'));
        } catch (error) {
            if (error.code !== 'EISDIR') {
                throw error;
            }
        }
    }
    notices.push(
        `${metadata.name} ${metadata.version}\nLicense: ${metadata.license || 'See package source'}\n${contents.join('\n\n') || metadata.repository?.url || ''}`,
    );
}
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices.join('\n\n' + '='.repeat(72) + '\n\n'));
console.log('Third-party license notices included in dist/.');
