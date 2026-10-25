export const DEFAULT_PAGE_NUMBER_FORMAT = '{page} / {pages}';

export const formatPageNumber = (format, page, pages) =>
    format.replace(/\{(page|pages)\}/g, (_, key) => String(key === 'page' ? page : pages));
