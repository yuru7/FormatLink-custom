'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const optionsHtml = fs.readFileSync(
  path.join(__dirname, '..', 'options.html'),
  'utf8'
);

test('options.htmlに9つのフォーマット項目カードがある', () => {
  const cards = optionsHtml.match(/class="formatItem"/g) ?? [];
  assert.equal(cards.length, 9);
});

test('Format入力欄は折り返し・スクロール可能なtextareaである', () => {
  for (let i = 1; i <= 9; ++i) {
    assert.ok(optionsHtml.includes(`<textarea id="format${i}" rows="1"></textarea>`), `missing format${i} textarea`);
  }
  assert.ok(!optionsHtml.includes(`<input type="text" id="format"`));
});

test('options.htmlに必須の要素IDと属性が存在する', () => {
  assert.ok(optionsHtml.includes('id="formatList"'));
  assert.ok(optionsHtml.includes('name="defaultFormat"'));
  assert.ok(optionsHtml.includes('id="createSubmenusCheckbox"'));
  assert.ok(optionsHtml.includes('id="saveButton"'));
  assert.ok(optionsHtml.includes('id="restoreDefaultsButton"'));

  for (let i = 1; i <= 9; ++i) {
    assert.ok(optionsHtml.includes(`id="title${i}"`), `missing title${i}`);
    assert.ok(optionsHtml.includes(`id="format${i}"`), `missing format${i}`);
    assert.ok(optionsHtml.includes(`id="selectionNewlines${i}"`), `missing selectionNewlines${i}`);
    assert.ok(optionsHtml.includes(`id="html${i}"`), `missing html${i}`);
    assert.ok(optionsHtml.includes(`id="defaultFormat${i}"`), `missing defaultFormat${i}`);
  }
});