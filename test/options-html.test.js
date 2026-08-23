'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const optionsHtml = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'options.html'),
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
    assert.ok(optionsHtml.includes(`id="preview${i}"`), `missing preview${i}`);
    assert.ok(optionsHtml.includes(`id="selectionNewlines${i}"`), `missing selectionNewlines${i}`);
    assert.ok(optionsHtml.includes(`id="html${i}"`), `missing html${i}`);
    assert.ok(optionsHtml.includes(`id="defaultFormat${i}"`), `missing defaultFormat${i}`);
  }
});

test('各カードに4種類の変数挿入チップがある', () => {
  for (let i = 1; i <= 9; ++i) {
    for (const variable of ['title', 'url', 'pageUrl', 'text']) {
      const chip = `<button type="button" class="variableChip" data-index="${i}" data-variable="${variable}"`;
      assert.ok(optionsHtml.includes(chip), `missing ${variable} chip for format ${i}`);
    }
  }
});

test('options.jsより前にテンプレート展開スクリプトを読み込む', () => {
  const templateIndex = optionsHtml.indexOf('<script src="format-template.js">');
  const optionsIndex = optionsHtml.indexOf('<script src="options.js">');

  assert.ok(templateIndex !== -1, 'missing format-template.js script tag');
  assert.ok(
    templateIndex < optionsIndex,
    'format-template.js must be loaded before options.js'
  );
});

test('各カードのプレビューにサンプル編集ボタンがある', () => {
  for (let i = 1; i <= 9; ++i) {
    const button = `<button type="button" class="editSampleButton" data-index="${i}"`;
    assert.ok(optionsHtml.includes(button), `missing edit sample button for format ${i}`);
  }
});

test('サンプル編集ダイアログの要素がある', () => {
  for (const id of ['sampleDialog', 'sampleTitle', 'sampleUrl', 'sampleSaveButton', 'sampleCancelButton']) {
    assert.ok(optionsHtml.includes(`id="${id}"`), `missing ${id}`);
  }
});