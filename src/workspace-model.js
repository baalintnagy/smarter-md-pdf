const nameOf = (value) => {
    const name = String(value).trim();
    if (!name || name.length > 160 || /[\\/\u0000-\u001f]/.test(name)) {
        throw new Error('Use a name of 1–160 characters without slashes or control characters.');
    }
    return name;
};

/** Pure tree operations. IDs and parent links keep renames independent from document content. */
export class WorkspaceModel {
    constructor(snapshot = { nodes: [], activeId: null, expanded: [] }) {
        this.nodes = structuredClone(snapshot.nodes);
        this.activeId = snapshot.activeId;
        this.expanded = new Set(snapshot.expanded || []);
        this.rootName = snapshot.rootName == null ? null : nameOf(snapshot.rootName);
        this.validate();
    }
    get(id) {
        return this.nodes.find((node) => node.id === id);
    }
    children(parentId = null) {
        return this.nodes
            .filter((node) => node.parentId === parentId)
            .sort((a, b) =>
                a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1,
            );
    }
    folder(id) {
        if (id !== null && this.get(id)?.kind !== 'folder') {
            throw new Error('Choose an existing destination folder.');
        }
    }
    uniqueName(name, parentId, except = null) {
        name = nameOf(name);
        const match = name.match(/^(.*?)(\.[^.]+)?$/);
        let result = name,
            number = 2;
        while (
            this.nodes.some(
                (node) =>
                    node.parentId === parentId &&
                    node.id !== except &&
                    node.name.toLocaleLowerCase() === result.toLocaleLowerCase(),
            )
        ) {
            result = `${match[1]} ${number++}${match[2] || ''}`;
        }
        return result;
    }
    create(kind, name, parentId = null, data = {}) {
        this.folder(parentId);
        const node = {
            ...structuredClone(data),
            id: crypto.randomUUID(),
            kind,
            name: this.uniqueName(name, parentId),
            parentId,
        };
        if (kind === 'document') {
            node.source = String(node.source || '');
        }
        this.nodes.push(node);
        if (parentId) {
            this.expanded.add(parentId);
        }
        return node;
    }
    rename(id, name) {
        const node = this.get(id);
        if (!node) {
            throw new Error('This item no longer exists.');
        }
        name = nameOf(name);
        if (
            this.nodes.some(
                (other) =>
                    other.id !== id &&
                    other.parentId === node.parentId &&
                    other.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            )
        ) {
            throw new Error('An item with this name already exists in that folder.');
        }
        node.name = name;
        return node;
    }
    renameRoot(name) {
        this.rootName = nameOf(name);
    }
    descendants(id) {
        const ids = new Set([id]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const node of this.nodes) {
                if (ids.has(node.parentId) && !ids.has(node.id)) {
                    ids.add(node.id);
                    changed = true;
                }
            }
        }
        return ids;
    }
    move(id, parentId) {
        const node = this.get(id);
        if (!node) {
            throw new Error('This item no longer exists.');
        }
        this.folder(parentId);
        if (this.descendants(id).has(parentId)) {
            throw new Error('A folder cannot be moved inside itself or its descendants.');
        }
        node.name = this.uniqueName(node.name, parentId, id);
        node.parentId = parentId;
        if (parentId) {
            this.expanded.add(parentId);
        }
    }
    duplicate(id) {
        const original = this.get(id);
        if (!original) {
            throw new Error('This item no longer exists.');
        }
        const match = original.name.match(/^(.*?)(\.[^.]+)?$/);
        const copy = (node, parentId, name) => {
            const result = this.create(node.kind, name, parentId, node);
            for (const child of [...this.children(node.id)]) {
                copy(child, result.id, child.name);
            }
            if (result.kind === 'folder') {
                this.expanded.add(result.id);
            }
            return result;
        };
        return copy(original, original.parentId, `${match[1]} copy${match[2] || ''}`);
    }
    remove(id) {
        const ids = this.descendants(id);
        this.nodes = this.nodes.filter((node) => !ids.has(node.id));
        ids.forEach((item) => this.expanded.delete(item));
        if (ids.has(this.activeId)) {
            this.activeId = this.nodes.find((node) => node.kind === 'document')?.id || null;
        }
    }
    path(id) {
        const parts = [];
        for (let node = this.get(id); node; node = this.get(node.parentId)) {
            parts.unshift(node.name);
        }
        return parts.join(' / ');
    }
    snapshot() {
        return structuredClone({
            nodes: this.nodes,
            activeId: this.activeId,
            expanded: [...this.expanded],
            rootName: this.rootName,
        });
    }
    validate() {
        if (
            !Array.isArray(this.nodes) ||
            new Set(this.nodes.map((node) => node.id)).size !== this.nodes.length
        ) {
            throw new Error('The saved library has an invalid structure.');
        }
        for (const node of this.nodes) {
            if (typeof node.id !== 'string' || !['folder', 'document'].includes(node.kind)) {
                throw new Error('The saved library contains an invalid item.');
            }
            nameOf(node.name);
            this.folder(node.parentId);
            if (node.kind === 'document' && typeof node.source !== 'string') {
                throw new Error('The saved document is invalid.');
            }
            const visited = new Set([node.id]);
            for (let parent = this.get(node.parentId); parent; parent = this.get(parent.parentId)) {
                if (visited.has(parent.id)) {
                    throw new Error('The saved folder tree contains a cycle.');
                }
                visited.add(parent.id);
            }
        }
        if (this.activeId && this.get(this.activeId)?.kind !== 'document') {
            this.activeId = null;
        }
    }
}
