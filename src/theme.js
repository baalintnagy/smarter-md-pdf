/** Theme preference and persistence; preview updates are supplied by the caller. */
export function initializeTheme(button, onChange) {
    function setTheme(theme) {
        document.documentElement.dataset.theme = theme;
        const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
        button.title = label;
        button.setAttribute('aria-label', label);
        try {
            localStorage.setItem('smarter-theme', theme);
        } catch {
            /* Storage is optional. */
        }
        onChange?.();
    }

    let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try {
        theme = localStorage.getItem('smarter-theme') || theme;
    } catch {
        /* Use OS preference. */
    }
    setTheme(theme);
    button.addEventListener('click', () =>
        setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
    );
}
