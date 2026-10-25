/** Decode imported image paths consistently in source and visual previews. */
export function imageAssetKey(url) {
    try {
        return decodeURIComponent(url).replace(/^\.\//, '');
    } catch {
        return url;
    }
}

export function findImageAsset(assets, key) {
    return assets.get(key) || assets.get(key.split('/').at(-1));
}

export function resolveEditorImage(url, assets) {
    const asset = findImageAsset(assets, imageAssetKey(url));
    if (asset) {
        return asset;
    }
    try {
        return ['https:', 'http:'].includes(new URL(url).protocol) ? url : '';
    } catch {
        return '';
    }
}
