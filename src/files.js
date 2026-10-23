/** Owns local object URLs and document imports; no file contents leave the browser. */
export class FileLibrary {
    constructor() {
        this.assets = new Map();
        this.documents = [];
        this.pendingAssets = new Map();
    }
    restoreAssets(entries) {
        for (const { key, blob } of entries) {
            this.assets.set(key, URL.createObjectURL(blob));
        }
    }
    async import(files) {
        const documents = [];
        for (const file of files) {
            if (/\.(md|markdown|txt)$/i.test(file.name)) {
                documents.push({ name: file.name, source: await file.text() });
            } else if (file.type.startsWith('image/') && !/svg/i.test(file.type)) {
                const path = file.webkitRelativePath || file.name;
                const previous = this.assets.get(path);
                if (previous) {
                    URL.revokeObjectURL(previous);
                }
                const url = URL.createObjectURL(file);
                this.assets.set(path, url);
                this.assets.set(file.name, url);
                this.pendingAssets.set(path, file);
                this.pendingAssets.set(file.name, file);
            }
        }
        this.documents.push(...documents);
        return documents;
    }
    dispose() {
        for (const url of new Set(this.assets.values())) {
            URL.revokeObjectURL(url);
        }
    }
}
