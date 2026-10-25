/** Pointer and keyboard resizing; only presentation changes, never paper dimensions. */
export function initializeColumnSplitter(workspace, separator) {
    const defaultShare = 0.55;
    let share = defaultShare;
    let pointer = null;
    let grabOffset = 8;
    let pendingX = null;
    let dragFrame = null;
    const mobile = matchMedia('(max-width:740px)');
    try {
        const saved = Number(localStorage.getItem('smarter-editor-share'));
        if (saved >= 0.2 && saved <= 0.8) {
            share = saved;
        }
    } catch {
        /* Storage is optional. */
    }
    const bounds = () => {
        const available = Math.max(600, workspace.getBoundingClientRect().width - 16);
        return {
            available,
            min: Math.max(0.2, 300 / available),
            max: Math.min(0.8, 1 - 300 / available),
        };
    };
    const apply = () => {
        if (mobile.matches) {
            return;
        }
        const { min, max, available } = bounds();
        const actual = Math.max(min, Math.min(max, share));
        const editorWidth = Math.max(
            300,
            Math.min(available - 300, Math.round(available * actual)),
        );
        workspace.style.setProperty('--editor-column', `${editorWidth}px`);
        workspace.style.setProperty('--preview-column', `${available - editorWidth}px`);
        separator.setAttribute('aria-valuemin', String(Math.ceil(min * 100)));
        separator.setAttribute('aria-valuemax', String(Math.floor(max * 100)));
        separator.setAttribute('aria-valuenow', String(Math.round(actual * 100)));
        separator.setAttribute(
            'aria-valuetext',
            `Editor ${Math.round(actual * 100)}%, preview ${Math.round((1 - actual) * 100)}%`,
        );
    };
    const save = () => {
        try {
            localStorage.setItem('smarter-editor-share', String(share));
        } catch {
            /* Storage is optional. */
        }
    };
    const set = (next) => {
        const { min, max } = bounds();
        share = Math.max(min, Math.min(max, next));
        apply();
    };
    const move = () => {
        dragFrame = null;
        if (pendingX === null) {
            return;
        }
        const x = pendingX;
        pendingX = null;
        set((x - workspace.getBoundingClientRect().left - grabOffset) / bounds().available);
    };
    const end = () => {
        if (dragFrame !== null) {
            cancelAnimationFrame(dragFrame);
        }
        move();
        pointer = null;
        document.body.classList.remove('resizing-columns');
        save();
    };
    separator.addEventListener('pointerdown', (event) => {
        if (mobile.matches || event.button !== 0) {
            return;
        }
        event.preventDefault();
        separator.focus({ preventScroll: true });
        pointer = event.pointerId;
        grabOffset = event.clientX - separator.getBoundingClientRect().left;
        separator.setPointerCapture(pointer);
        document.body.classList.add('resizing-columns');
    });
    separator.addEventListener('pointermove', (event) => {
        if (event.pointerId !== pointer) {
            return;
        }
        pendingX = event.clientX;
        if (dragFrame === null) {
            dragFrame = requestAnimationFrame(move);
        }
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        separator.addEventListener(event, () => {
            if (pointer !== null) {
                end();
            }
        });
    }
    separator.addEventListener('keydown', (event) => {
        const current = Number(separator.getAttribute('aria-valuenow')) / 100;
        const step = event.shiftKey ? 0.1 : 0.02;
        const actions = {
            ArrowLeft: current - step,
            ArrowRight: current + step,
            Home: bounds().min,
            End: bounds().max,
            Enter: defaultShare,
        };
        if (!(event.key in actions)) {
            return;
        }
        event.preventDefault();
        set(actions[event.key]);
        save();
    });
    separator.addEventListener('dblclick', () => {
        share = defaultShare;
        apply();
        save();
    });
    let observedWidth = null;
    new ResizeObserver(([entry]) => {
        if (entry.contentRect.width !== observedWidth) {
            observedWidth = entry.contentRect.width;
            apply();
        }
    }).observe(workspace);
    mobile.addEventListener('change', () => {
        if (pointer !== null) {
            end();
        }
        apply();
    });
    apply();
}
