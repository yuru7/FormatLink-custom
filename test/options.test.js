'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const optionsSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'options.js'),
  'utf8'
);

const templateSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'format-template.js'),
  'utf8'
);

const createElement = (id, properties = {}) => {
  const listeners = new Map();
  const classes = new Set();
  return {
    id,
    value: '',
    checked: false,
    disabled: false,
    open: false,
    style: {},
    textContent: '',
    selectionStart: 0,
    selectionEnd: 0,
    scrollHeight: 0,
    offsetHeight: 0,
    clientHeight: 0,
    ...properties,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(type, overrides = {}) {
      return listeners.get(type)?.({ target: this, ...overrides });
    },
    click() {
      if (!this.disabled) {
        return listeners.get('click')?.({ target: this });
      }
    },
    closest(selector) {
      return (this.className ?? '').split(/\s+/).includes(selector.slice(1)) ? this : null;
    },
    setRangeText(replacement, start, end) {
      this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + replacement.length;
    },
    focus() {
      this.focused = true;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
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
    elements.set('preview' + i, createElement('preview' + i));
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
  elements.set('formatList', createElement('formatList'));
  elements.set('sampleDialog', createElement('sampleDialog'));
  elements.set('sampleTitle', createElement('sampleTitle'));
  elements.set('sampleUrl', createElement('sampleUrl'));
  elements.set('sampleSaveButton', createElement('sampleSaveButton'));
  elements.set('sampleCancelButton', createElement('sampleCancelButton'));
  elements.set('helpDialog', createElement('helpDialog'));
  elements.set('helpCloseButton', createElement('helpCloseButton'));

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
    `${templateSource}\n${optionsSource}

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

test('初期化時に入力済み行のプレビューを表示する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  assert.equal(page.elements.get('preview1').textContent, 'format one');
  assert.equal(page.elements.get('preview2').textContent, 'format two');
  assert.equal(page.elements.get('preview4').textContent, '');
});

test('Format入力時にプレビューをライブ更新する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const textarea = page.elements.get('format1');
  textarea.value = '[{{title}}]({{url}})';
  await textarea.dispatchEvent('input');

  assert.equal(
    page.elements.get('preview1').textContent,
    '[Page Title](https://example.com)'
  );
});

test('不正なテンプレートはプレビュー欄にエラーを表示し、修正で復帰する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const textarea = page.elements.get('format1');
  const preview = page.elements.get('preview1');

  textarea.value = '{{title.s("missing argument")}}';
  await textarea.dispatchEvent('input');

  assert.match(preview.textContent, /parse error/);
  assert.equal(preview.classList.contains('invalidTemplate'), true);

  textarea.value = '[{{title}}]';
  await textarea.dispatchEvent('input');

  assert.equal(preview.textContent, '[Page Title]');
  assert.equal(preview.classList.contains('invalidTemplate'), false);
});

test('変数チップのクリックでカーソル位置に変数を挿入する', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const formatList = page.elements.get('formatList');
  const textarea = page.elements.get('format1');
  textarea.value = '<>';
  textarea.selectionStart = textarea.selectionEnd = 1;

  const chip = createElement('chip', {
    className: 'variableChip',
    dataset: { index: '1', variable: 'url' },
  });
  await formatList.dispatchEvent('click', { target: chip });

  assert.equal(textarea.value, '<{{url}}>');
  assert.equal(textarea.selectionStart, 8);
  assert.equal(page.elements.get('saveButton').disabled, false);
  // プレビューも挿入後の内容で更新される
  assert.equal(
    page.elements.get('preview1').textContent,
    '<https://example.com>'
  );
});

test('項目移動後にプレビューも入れ替わる', async () => {
  const page = createOptionsPage();
  await page.initialize();

  await getButton(page, 1, 'down').click();

  assert.equal(page.elements.get('format1').value, 'format two');
  assert.equal(page.elements.get('preview1').textContent, 'format two');
  assert.equal(page.elements.get('format2').value, 'format one');
  assert.equal(page.elements.get('preview2').textContent, 'format one');
});

test('鉛筆ボタンでサンプル編集ダイアログが開き現在値が入る', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const editButton = createElement('editSampleButton1', {
    className: 'editSampleButton',
    dataset: { index: '1' },
  });
  await page.elements.get('formatList').dispatchEvent('click', { target: editButton });

  const dialog = page.elements.get('sampleDialog');
  assert.equal(dialog.open, true);
  assert.equal(page.elements.get('sampleTitle').value, 'Page Title');
  assert.equal(page.elements.get('sampleUrl').value, 'https://example.com');
});

test('Saveでそのカードのサンプルが更新されプレビューに反映される', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const textarea = page.elements.get('format1');
  textarea.value = '{{title}} {{url}}';

  const editButton = createElement('editSampleButton1', {
    className: 'editSampleButton',
    dataset: { index: '1' },
  });
  await page.elements.get('formatList').dispatchEvent('click', { target: editButton });
  page.elements.get('sampleTitle').value = 'My Sample';
  page.elements.get('sampleUrl').value = 'https://example.org/page';
  await page.elements.get('sampleSaveButton').click();

  assert.equal(page.elements.get('sampleDialog').open, false);
  assert.equal(
    page.elements.get('preview1').textContent,
    'My Sample https://example.org/page'
  );

  // 他のカードは既定サンプルのまま
  const textarea2 = page.elements.get('format2');
  textarea2.value = '{{title}}';
  await textarea2.dispatchEvent('input');
  assert.equal(page.elements.get('preview2').textContent, 'Page Title');
});

test('Cancelではサンプルを変更しない', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const editButton = createElement('editSampleButton1', {
    className: 'editSampleButton',
    dataset: { index: '1' },
  });
  await page.elements.get('formatList').dispatchEvent('click', { target: editButton });
  page.elements.get('sampleTitle').value = 'changed';
  await page.elements.get('sampleCancelButton').click();

  assert.equal(page.elements.get('sampleDialog').open, false);

  const textarea = page.elements.get('format1');
  textarea.value = '{{title}}';
  await textarea.dispatchEvent('input');
  assert.equal(page.elements.get('preview1').textContent, 'Page Title');
});

test('サンプル編集のinput上でEnterを押すとSaveされる', async () => {
  const page = createOptionsPage();
  await page.initialize();

  page.elements.get('format1').value = '{{title}}';

  const editButton = createElement('editSampleButton1', {
    className: 'editSampleButton',
    dataset: { index: '1' },
  });
  await page.elements.get('formatList').dispatchEvent('click', { target: editButton });
  page.elements.get('sampleTitle').value = 'Enter Title';
  await page.elements.get('sampleTitle').dispatchEvent('keydown', {
    key: 'Enter',
    preventDefault() {},
  });

  assert.equal(page.elements.get('sampleDialog').open, false);
  await page.elements.get('format1').dispatchEvent('input');
  assert.equal(page.elements.get('preview1').textContent, 'Enter Title');
});

test('ヘルプリンクでヘルプモーダルが開きCloseで閉じる', async () => {
  const page = createOptionsPage();
  await page.initialize();

  const formatList = page.elements.get('formatList');
  await formatList.dispatchEvent('click', {
    target: createElement('help1', { className: 'helpLink' }),
  });
  assert.equal(page.elements.get('helpDialog').open, true);

  await page.elements.get('helpCloseButton').click();
  assert.equal(page.elements.get('helpDialog').open, false);
});
