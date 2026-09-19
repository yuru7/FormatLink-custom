'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createModalPreviewServer } = require('../manual-test/modal-preview');

test('モーダルプレビューは結合CSSをpxに直して配信する', async () => {
  const preview = createModalPreviewServer({ port: 0 });
  const address = await preview.listen();

  try {
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${origin}/`);
    const html = await response.text();
    const notFound = await fetch(`${origin}/missing`);

    assert.equal(response.status, 200);
    assert.match(html, /aria-label="Close"/);
    assert.match(html, />×</);
    assert.match(html, /id="copyResult"/);
    assert.match(html, /font:\s*13px\/1\.4/);
    assert.match(html, /:root\s*\{/);
    assert.doesNotMatch(html, /:host\b/);
    assert.doesNotMatch(html, /[\d.]rem\b/);
    assert.equal(notFound.status, 404);
  } finally {
    await preview.close();
  }
});
