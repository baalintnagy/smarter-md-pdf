const requestResult = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

/** Atomic library/asset writes with a revision check to prevent stale-tab overwrites. */
export class WorkspaceStorage {
    async open() {
        if (!this.database) {
            this.database = new Promise((resolve, reject) => {
                const request = indexedDB.open('smarter-md-pdf-library', 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('workspace');
                    request.result.createObjectStore('assets', { keyPath: 'key' });
                };
                request.onsuccess = () => {
                    const database = request.result;
                    database.onversionchange = () => database.close();
                    resolve(database);
                };
                request.onerror = () => reject(request.error);
                request.onblocked = () =>
                    reject(new Error('Close other app tabs to open the local library.'));
            });
        }
        return this.database;
    }
    async load() {
        const database = await this.open(),
            transaction = database.transaction(['workspace', 'assets'], 'readonly');
        const [workspace, assets] = await Promise.all([
            requestResult(transaction.objectStore('workspace').get('local')),
            requestResult(transaction.objectStore('assets').getAll()),
        ]);
        return { snapshot: workspace?.snapshot, revision: workspace?.revision || 0, assets };
    }
    async save(snapshot, expectedRevision, assets) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['workspace', 'assets'], 'readwrite');
            let failure;
            const workspace = transaction.objectStore('workspace');
            const read = workspace.get('local');
            read.onsuccess = () => {
                if ((read.result?.revision || 0) !== expectedRevision) {
                    failure = new Error(
                        'This library changed in another tab. Export your current Markdown, then reload to use the latest library.',
                    );
                    transaction.abort();
                    return;
                }
                workspace.put({ snapshot, revision: expectedRevision + 1 }, 'local');
                for (const [key, blob] of assets) {
                    transaction.objectStore('assets').put({ key, blob });
                }
            };
            transaction.oncomplete = () => resolve(expectedRevision + 1);
            transaction.onerror = () =>
                reject(
                    failure ||
                        transaction.error ||
                        new Error('The browser could not save this library.'),
                );
            transaction.onabort = () =>
                reject(failure || transaction.error || new Error('The local save was cancelled.'));
        });
    }
}
