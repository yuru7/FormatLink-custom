'use strict';

const assert = require('node:assert/strict');
const manifest = require('../src/manifest.json');
const test = require('node:test');

test('content.jsをすべてのフレームへ注入する', () => {
  const contentScript = manifest.content_scripts.find(script =>
    script.js.includes('content.js')
  );

  assert.equal(contentScript.all_frames, true);
  assert.equal(contentScript.match_about_blank, true);
});
