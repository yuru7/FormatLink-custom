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

  await page.elements.get('saveButton').click();
  assert.equal(page.savedOptions.at(-1).defaultFormat, 1);
  assert.equal(page.savedOptions.at(-1).title1, 'Two');
  assert.equal(page.savedOptions.at(-1).selectionNewlines1, 'preserve');
  assert.equal(page.savedOptions.at(-1).html1, 1);

  assert.equal(getButton(page, 1, 'up').disabled, true);
  assert.equal(getButton(page, 3, 'down').disabled, true);

  await getButton(page, 1, 'down').click();
  assert.deepEqual(getItemValues(page), initialValues);
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

  page.elements.get('title3').value = 'Three';
  await page.elements.get('title3').dispatchEvent('input');
  assert.equal(page.exports.getFormItemCount(), 3);
  assert.equal(getButton(page, 2, 'down').disabled, false);
  assert.equal(getButton(page, 3, 'up').disabled, false);
});
