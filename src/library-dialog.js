const $ = (id) => document.getElementById(id);

function describeAction(action, node, model, localFolder) {
    if (action === 'delete') {
        let contents = '';
        if (node.kind === 'folder') {
            const descendants = model.descendants(node.id);
            const count = model.nodes.filter(
                (item) => descendants.has(item.id) && item.kind === 'document',
            ).length;
            contents = ` and its ${count} document(s)`;
        }
        return `Delete “${node.name}”${contents}? This removes the local copy.`;
    }
    if (action === 'move') {
        return `Choose a folder for “${node.name}”.`;
    }
    return localFolder
        ? 'Choose a name. Changes save to your selected local folder.'
        : 'Choose a name. Your document stays on this browser and device.';
}

/** Present library actions without owning document mutations or storage. */
export function showLibraryDialog(action, node, model, localFolder) {
    const names = {
        'new-document': 'New document',
        'new-folder': 'New folder',
        rename: 'Rename',
        move: 'Move',
        delete: 'Delete',
    };
    $('library-dialog-title').textContent = names[action];
    $('library-dialog-description').textContent = describeAction(action, node, model, localFolder);
    const naming = ['new-document', 'new-folder', 'rename'].includes(action);
    $('library-name-label').hidden = !naming;
    $('library-name').required = naming;
    $('library-name').value =
        action === 'rename' ? node.name : action === 'new-folder' ? 'New folder' : 'Untitled.md';
    $('library-destination-label').hidden = action !== 'move';
    $('library-destination').replaceChildren();
    if (action === 'move') {
        const blocked = model.descendants(node.id);
        for (const folder of [
            { id: '', name: 'Root' },
            ...model.nodes.filter((item) => item.kind === 'folder' && !blocked.has(item.id)),
        ]) {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.id ? model.path(folder.id) : folder.name;
            $('library-destination').append(option);
        }
        $('library-destination').value = node.parentId || '';
    }
    $('library-submit').textContent =
        action === 'delete' ? 'Delete' : action === 'move' ? 'Move' : 'Save';
    $('library-dialog-error').textContent = '';
    $('library-dialog').showModal();
    if (naming) {
        $('library-name').select();
    }
}
