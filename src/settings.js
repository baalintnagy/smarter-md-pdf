import { DEFAULT_PAGE_NUMBER_FORMAT } from './page-numbers.js';

export const PRESETS = Object.freeze({
    A4: [210, 297],
    A3: [297, 420],
    A5: [148, 210],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
    Tabloid: [279.4, 431.8],
});

export function validateSettings(settings) {
    const { width, height, margin, minScale, maxScale, minTableRows = 3 } = settings;
    if (![width, height, margin, minScale, maxScale].every(Number.isFinite)) {
        throw new Error('Enter a number in every page setup field.');
    }
    if (width < 50 || width > 1000 || height < 50 || height > 1000) {
        throw new Error('Page dimensions must be between 50 and 1000 mm.');
    }
    if (margin < 0 || margin > 100 || margin * 2 + 10 >= Math.min(width, height)) {
        throw new Error('Margins must leave at least 10 mm of printable content.');
    }
    if (minScale < 50 || maxScale > 100 || minScale > maxScale) {
        throw new Error('Choose a scale range between 50% and 100%, with minimum ≤ maximum.');
    }
    if (!Number.isInteger(minTableRows) || minTableRows < 1 || minTableRows > 100) {
        throw new Error(
            'Minimum rows per table fragment must be a whole number between 1 and 100.',
        );
    }
    const format = settings.pageNumberFormat ?? DEFAULT_PAGE_NUMBER_FORMAT;
    if (
        settings.pageNumbers &&
        (typeof format !== 'string' || !format.trim() || format.length > 200)
    ) {
        throw new Error('Enter a page number format between 1 and 200 characters.');
    }
    return settings;
}
