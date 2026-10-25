const support = {
    label: 'Browser support',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility',
};

/** Capability detection controls access; browser identification only chooses help links. */
export async function folderAccessHelp(browser, secure = true) {
    if (!secure) {
        return {
            label: 'Use HTTPS or localhost',
            url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts',
        };
    }
    const agent = browser.userAgent || '';
    if (
        /iPhone|iPad|iPod|Firefox\//i.test(agent) ||
        (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1)
    ) {
        return support;
    }
    try {
        if (await browser.brave?.isBrave()) {
            return { label: 'Brave settings', url: 'brave://flags/#file-system-access-api' };
        }
    } catch {
        // Browser identity can be withheld; use the remaining browser hints.
    }
    if (/Edg\//.test(agent)) {
        return { label: 'Edge settings', url: 'edge://settings/content' };
    }
    if (/OPR\//.test(agent)) {
        return { label: 'Opera settings', url: 'opera://settings/content' };
    }
    if (/Chrome\//.test(agent)) {
        return { label: 'Chrome settings', url: 'chrome://settings/content' };
    }
    return support;
}
