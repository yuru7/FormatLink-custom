'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const optionsSource = fs.readFileSync(
  path.join(__dirname, '..', 'options.js'),
  'utf8'
);

const createElement = (id, properties = {}) => {
  const listeners = new Map();
  return {
    id,
    value: '',
    checked: false,
    disabled: false,
    style: {},
    scrollHeight: 0,
    offsetHeight: 0,
    clientHeight: 0,
    ...properties,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(type) {
      return listeners.get(type)?.({ target: this });
    },
    click() {
      if (!this.disabled) {
        return listeners.get('click')?.({ target: this });
      }
    },
  };
};

const createOptionsPage = () => {
  const elements = new Map();
  const buttons = [];
  const documentListeners = new Map();

  for (let i = 1; i <= 9; ++i) {
    elements.set('title' + i, createElement('title' + i));
    elements.set('format' + i, createElement('format' + i));
    elements.set('selectionNewlines' + i, createElement('selectionNewlines' + i));
    elements.set('html' + i, createElement('html' + i));
    elements.set('defaultFormat' + i, createElement('defaultFormat' + i, { value: String(i) }));
    for (const direction of ['up', 'down']) {
      buttons.push(createElement('move' + i + direction, {
        dataset: { index: String(i), direction },
      }));
    }
  }
  elements.set('createSubmenusCheckbox', createElement('createSubmenusCheckbox'));
  elements.set('saveButton', createElement('saveButton'));
  elements.set('restoreDefaultsButton', createElement('restoreDefaultsButton'));

  const document = {
    getElementById(id) {
      return elements.get(id);
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.moveButton');
      return buttons;
    },
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };

  const options = {
    maxCount: 9,
    defaultFormat: 2,
    title1: 'One',
    format1: 'format one',
    selectionNewlines1: 'spaces',
    html1: 0,
    title2: 'Two',
    format2: 'format two',
    selectionNewlines2: 'preserve',
    html2: 1,
    title3: 'Three',
    format3: 'format three',
    selectionNewlines3: 'preserve',
    html3: 0,
    title4: '',
    format4: '',
    html4: 0,
    createSubmenus: true,
  };
  const savedOptions = [];
  const chrome = {
    runtime: {
      sendMessage: async ({ message }) => {
        if (message === 'getOptions') {
          return { options: structuredClone(options) };
        }
        if (message === 'getDefaultOptions') {
          return { options: structuredClone(options) };
        }
        return {};
      },
    },
    storage: {
      sync: {
        set: async value => {
          savedOptions.push(structuredClone(value));
        },
      },
    },
  };

  const context = { chrome, document, console, structuredClone };
  vm.createContext(context);
  vm.runInContext(
    `${optionsSource}

globalThis.__testExports = { moveOption, getFormItemCount };`,
    context,
    { filename: 'options.js' }
  );

  return {
    elements,
    buttons,
    savedOptions,
    exports: context.__testExports,
    initialize: () => documentListeners.get('DOMContentLoaded')(),
  };
};

const getButton = (page, index, direction) => page.buttons.find(button =>
  button.dataset.index === String(index) && button.dataset.direction === direction
);

const getItemValues = page => [1, 2, 3].map(index => ({
  title: page.elements.get('title' + index).value,
  format: page.elements.get('format' + index).value,
  selectionNewlines: page.elements.get('selectionNewlines' + index).value,
  html: page.elements.get('html' + index).checked,
}));

test('項目の上下移動で入力値と既定形式が追従する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  assert.equal(page.exports.getFormItemCount(), 3);
  assert.equal(getButton(page, 1, 'up').disabled, true);
  assert.equal(getButton(page, 3, 'down').disabled, true);
  assert.equal(getButton(page, 4, 'up').disabled, true);
  assert.equal(getButton(page, 4, 'down').disabled, true);
  assert.equal(page.elements.get('selectionNewlines4').value, 'spaces');

  assert.equal(page.elements.get('defaultFormat1').checked, false);
  assert.equal(page.elements.get('defaultFormat2').checked, true);
  assert.equal(page.elements.get('defaultFormat3').checked, false);
  assert.equal(page.elements.get('defaultFormat4').disabled, true);
  assert.equal(page.elements.get('defaultFormat9').disabled, true);

  const initialValues = getItemValues(page);
  page.exports.moveOption(1, 'up');
  page.exports.moveOption(3, 'down');
  assert.deepEqual(getItemValues(page), initialValues);

  await getButton(page, 2, 'up').click();

  assert.equal(page.elements.get('title1').value, 'Two');
  assert.equal(page.elements.get('format1').value, 'format two');
  assert.equal(page.elements.get('html1').checked, true);
  assert.equal(page.elements.get('title2').value, 'One');
  assert.equal(page.elements.get('format2').value, 'format one');
  assert.equal(page.elements.get('html2').checked, false);
  assert.equal(page.elements.get('defaultFormat1').checked, true);
  assert.equal(page.elements.get('defaultFormat2').checked, false);

  await page.elements.get('saveButton').click();
  assert.equal(page.savedOptions.at(-1).defaultFormat, 1);
  assert.equal(page.savedOptions.at(-1).title1, 'Two');
  assert.equal(page.savedOptions.at(-1).selectionNewlines1, 'preserve');
  assert.equal(page.savedOptions.at(-1).html1, 1);

  assert.equal(getButton(page, 1, 'up').disabled, true);
  assert.equal(getButton(page, 3, 'down').disabled, true);

  await getButton(page, 1, 'down').click();
  assert.deepEqual(getItemValues(page), initialValues);
  assert.equal(page.elements.get('defaultFormat1').checked, false);
  assert.equal(page.elements.get('defaultFormat2').checked, true);
  await page.elements.get('saveButton').click();
  assert.equal(page.savedOptions.at(-1).defaultFormat, 2);
});

test('入力済み項目数に応じて空欄行の移動ボタンを無効化する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  page.elements.get('title3').value = '';
  await page.elements.get('title3').dispatchEvent('input');
  assert.equal(page.exports.getFormItemCount(), 2);
  assert.equal(getButton(page, 2, 'down').disabled, true);
  assert.equal(getButton(page, 3, 'up').disabled, true);
  assert.equal(getButton(page, 3, 'down').disabled, true);
  assert.equal(page.elements.get('defaultFormat3').disabled, true);
  assert.equal(page.elements.get('defaultFormat4').disabled, true);

  page.elements.get('title3').value = 'Three';
  await page.elements.get('title3').dispatchEvent('input');
  assert.equal(page.exports.getFormItemCount(), 3);
  assert.equal(getButton(page, 2, 'down').disabled, false);
  assert.equal(getButton(page, 3, 'up').disabled, false);
  assert.equal(page.elements.get('defaultFormat3').disabled, false);
});

test('デフォルト項目のラジオで既定形式を選択して保存する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  assert.equal(page.elements.get('saveButton').disabled, true);

  const radio = page.elements.get('defaultFormat1');
  radio.checked = true;
  await radio.dispatchEvent('change');

  assert.equal(page.elements.get('defaultFormat1').checked, true);
  assert.equal(page.elements.get('defaultFormat2').checked, false);
  assert.equal(page.elements.get('saveButton').disabled, false);

  await page.elements.get('saveButton').click();
  assert.equal(page.savedOptions.at(-1).defaultFormat, 1);
  assert.equal(page.elements.get('saveButton').disabled, true);
});

test('Saveボタンは変更があるときだけ有効になる', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const saveButton = page.elements.get('saveButton');
  assert.equal(saveButton.disabled, true);

  page.elements.get('title1').value = 'Changed';
  await page.elements.get('title1').dispatchEvent('input');
  assert.equal(saveButton.disabled, false);

  page.elements.get('html1').checked = true;
  await page.elements.get('html1').dispatchEvent('change');
  assert.equal(saveButton.disabled, false);

  page.elements.get('selectionNewlines1').value = 'preserve';
  await page.elements.get('selectionNewlines1').dispatchEvent('change');
  assert.equal(saveButton.disabled, false);

  page.elements.get('createSubmenusCheckbox').checked = false;
  await page.elements.get('createSubmenusCheckbox').dispatchEvent('change');
  assert.equal(saveButton.disabled, false);

  await saveButton.click();
  assert.equal(saveButton.disabled, true);

  // 保存済みの値に戻せば再び無効になる
  page.elements.get('title1').value = 'Changed';
  await page.elements.get('title1').dispatchEvent('input');
  assert.equal(saveButton.disabled, true);

  // そこから値を変えると有効になる
  page.elements.get('title1').value = 'One';
  await page.elements.get('title1').dispatchEvent('input');
  assert.equal(saveButton.disabled, false);
});

test('オプション復元時にFormat欄の高さを内容に合わせてリサイズする', async () => {
  const page = createOptionsPage();
  page.elements.get('format1').scrollHeight = 63;

  await page.initialize();

  assert.equal(page.elements.get('format1').style.height, '63px');
});

test('Format入力の折り返しに応じて高さを拡張する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const textarea = page.elements.get('format1');
  textarea.scrollHeight = 90;
  await textarea.dispatchEvent('input');

  assert.equal(textarea.style.height, '90px');
});

test('Format欄の高さに枠線の上下分を加算する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const textarea = page.elements.get('format1');
  textarea.scrollHeight = 90;
  textarea.offsetHeight = 22;
  textarea.clientHeight = 20;
  await textarea.dispatchEvent('input');

  assert.equal(textarea.style.height, '92px');
});

test('既定形式の行が空欄になったら保存時に最初の入力済み行へ正規化する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  page.elements.get('title2').value = '';
  page.elements.get('format2').value = '';
  await page.elements.get('title2').dispatchEvent('input');

  // 編集中は選択を維持し（無効化のみ）、保存時に正規化する
  assert.equal(page.elements.get('defaultFormat2').checked, true);
  assert.equal(page.elements.get('defaultFormat2').disabled, true);

  await page.elements.get('saveButton').click();
  assert.equal(page.savedOptions.at(-1).defaultFormat, 1);
});
