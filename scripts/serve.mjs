import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.env.SITE_DIR || 'dist');
const base = process.env.SITE_BASE || '';
const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.md': 'text/plain',
};
export const server = createServer(async (request, response) => {
    try {
        const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (base && !urlPath.startsWith(base + '/')) {
            response.writeHead(404).end('Not found');
            return;
        }
        const pathname = urlPath.slice(base.length);
        const path = resolve(
            root,
            '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname),
        );
        if (path !== root && !path.startsWith(root + sep)) {
            response.writeHead(403).end();
            return;
        }
        const content = await readFile(path);
        response
            .writeHead(200, {
                'Content-Type': types[extname(path)] || 'application/octet-stream',
                'Cache-Control': 'no-store',
            })
            .end(content);
    } catch {
        response.writeHead(404).end('Not found');
    }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () =>
    console.log(`Markdown studio: http://127.0.0.1:${server.address().port}`),
);
