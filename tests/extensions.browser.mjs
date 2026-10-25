import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { server } from '../scripts/serve.mjs';
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
try {
    const page = await browser.newPage();
    const errors = [];
    const failed = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        if (response.status() >= 400) {
            failed.push(response.url());
        }
    });
    await page.goto(`http://127.0.0.1:${process.env.PORT || 4173}${process.env.SITE_BASE || ''}/`);
    await page.waitForFunction(
        () => !document.getElementById('print').disabled,
        {},
        { timeout: 60000 },
    );
    const samplePreview = page.frameLocator('#preview');
    assert.equal(await samplePreview.locator('#pages .mermaid-diagram').count(), 4);
    assert.equal(await samplePreview.locator('#pages .katex-display').count(), 7);
    assert.equal(await samplePreview.locator('#pages .asciimath-source .katex').count(), 4);
    assert.equal(await samplePreview.locator('#pages .render-error').count(), 0);
    for (const diagram of await samplePreview.locator('#pages .mermaid-diagram').all()) {
        assert.ok(await diagram.evaluate((node) => node.naturalWidth > 0));
    }
    await page.locator('#mode-markdown').click();
    const source =
        '# Equations and diagrams\n\nInline $E = mc^2$ and \\(a^2+b^2=c^2\\).\n\n$$\n\\Gamma(z) = \\int_0^\\infty t^{z-1}e^{-t}\\,dt\n$$\n\n\\[\n\\frac{1}{2} + \\sqrt{x}\n\\]\n\n## Flow\n\n```mermaid\nflowchart LR\nA[Write] --> B[Preview] --> C[Print PDF]\n```\n\n## Sequence\n\n```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\nBob-->>Alice: Hi\n```\n\nCode stays literal: `$x^2$`.\n\n```tex\n$x^2$\n```';
    const asciiSource =
        '\n\nInline AsciiMath @{sqrt({x^2 + y^2})}, comparison @{x < y}, and quoted text @{"units"}.\n\n```asciimath\nsum_(n=1)^oo 1/n^2 = pi^2/6\n```\n\nLiteral AsciiMath: `@{sqrt(x)}`. Escaped marker: \\@{sqrt(x)}. Unclosed marker: @{missing\n\n```text\n@{sqrt(x)}\n```';
    await page.locator('#markdown').fill(source + asciiSource);
    await page.waitForFunction(
        () => !document.getElementById('print').disabled,
        {},
        { timeout: 60000 },
    );
    const preview = page.frameLocator('#preview');
    assert.equal(await preview.locator('#pages .katex').count(), 8);
    assert.equal(await preview.locator('#pages .asciimath-source .katex').count(), 4);
    assert.equal(await preview.locator('#pages .asciimath-source.math-display').count(), 1);
    assert.equal(await preview.locator('#pages .render-error').count(), 0);
    assert.equal(
        await preview
            .locator('#pages code')
            .evaluateAll(
                (nodes) => nodes.filter((node) => node.textContent.trim() === '@{sqrt(x)}').length,
            ),
        2,
    );
    assert.equal(await preview.locator('#pages .mermaid-diagram').count(), 2);
    for (const img of await preview.locator('#pages .mermaid-diagram').all()) {
        assert.ok(await img.evaluate((node) => node.naturalWidth > 0));
    }
    assert.equal(await preview.locator('#pages code').first().textContent(), '$x^2$');
    assert.ok((await page.locator('#status').textContent()).includes('Ready to print'));
    assert.equal(
        await preview
            .locator('.katex .katex-html')
            .first()
            .evaluate((node) => getComputedStyle(node).fontFamily.includes('KaTeX')),
        true,
    );
    await mkdir('test-results', { recursive: true });
    const printPage = await browser.newPage();
    await printPage.goto(page.url());
    await printPage.setContent(
        await page
            .frames()
            .find((frame) => frame !== page.mainFrame())
            .content(),
    );
    await printPage.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('img')].map((image) => image.decode()));
    });
    await printPage.pdf({
        path: 'test-results/math-diagrams.pdf',
        preferCSSPageSize: true,
        printBackground: true,
    });
    const pdf = (await readFile('test-results/math-diagrams.pdf')).toString('latin1');
    assert.equal(
        (pdf.match(/\/Type \/Page\b/g) || []).length,
        await preview.locator('.sheet').count(),
    );
    await printPage.close();
    await page.screenshot({ path: 'test-results/math-diagrams.png', fullPage: true });
    await page
        .locator('#markdown')
        .fill(
            'Bad $\\notACommand{x}$ math and @{color(#zzzzzz)(x)}\n\n```mermaid\ninvalid diagram input\n```',
        );
    await page.waitForFunction(() => !document.getElementById('print').disabled);
    assert.ok((await page.locator('#status').textContent()).includes('could not be rendered'));
    assert.equal(await preview.locator('#pages .render-error').count(), 3);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(
        'Print extensions passed: inline/display TeX and AsciiMath, sample diagrams, local fonts, literal code, PDF generation, invalid-source fallback.',
    );
} finally {
    await browser.close();
    server.close();
}
