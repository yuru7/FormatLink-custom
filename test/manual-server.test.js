'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createManualTestServers } = require('../manual-test/server');

const getAddress = address => `http://127.0.0.1:${address.port}`;

test('マニュアルテスト用サーバーが必要なページを配信する', async () => {
  const servers = createManualTestServers({ mainPort: 0, framePort: 0 });
  const addresses = await servers.listen();

  try {
    const mainOrigin = getAddress(addresses.main);
    const frameOrigin = getAddress(addresses.frame);
    const mainResponse = await fetch(`${mainOrigin}/`);
    const mainHtml = await mainResponse.text();
    const sameOriginResponse = await fetch(`${mainOrigin}/frame.html?mode=same-origin`);
    const crossOriginResponse = await fetch(`${frameOrigin}/frame.html?mode=cross-origin`);
    const notFoundResponse = await fetch(`${mainOrigin}/missing`);

    assert.equal(mainResponse.status, 200);
    assert.match(mainHtml, /iframeなし/);
    assert.match(mainHtml, new RegExp(`${frameOrigin}/frame\\.html`));
    assert.equal(sameOriginResponse.status, 200);
    assert.equal(crossOriginResponse.status, 200);
    assert.equal(notFoundResponse.status, 404);
  } finally {
    await servers.close();
  }
});
