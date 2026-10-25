/** Settle one image exactly once, including cached images and load failures. */
function waitForImage(image) {
    return new Promise((resolve) => {
        let finished = false;
        const done = (failed) => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timeout);
            if (!failed) {
                image.width = image.naturalWidth;
                image.height = image.naturalHeight;
            }
            image.removeEventListener('load', loaded);
            image.removeEventListener('error', errored);
            resolve(failed);
        };
        const loaded = () => done(false);
        const errored = () => done(true);
        const timeout = setTimeout(() => {
            image.removeAttribute('src');
            done(true);
        }, 5000);
        if (image.complete) {
            done(!image.naturalWidth);
        } else {
            image.addEventListener('load', loaded);
            image.addEventListener('error', errored);
        }
    });
}

/** Wait for image dimensions before pagination; report missing or timed-out images. */
export async function waitForImages(root) {
    const failures = await Promise.all([...root.querySelectorAll('img')].map(waitForImage));
    return failures.filter(Boolean).length;
}
