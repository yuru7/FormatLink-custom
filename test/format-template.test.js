'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const templateSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'format-template.js'),
  'utf8'
);

const loadTemplate = () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(templateSource, context, { filename: 'format-template.js' });
  return context.renderFormatTemplate;
};

const vars = {
  url: 'https://example.test/page',
  pageUrl: 'https://example.test/page',
  title: 'Example page',
  text: 'Selected text',
  newline: '\n',
};

test('4つのテンプレート変数を展開する', () => {
  const render = loadTemplate();

  assert.equal(
    render('{{title}}|{{url}}|{{pageUrl}}|{{text}}', vars),
    'Example page|https://example.test/page|https://example.test/page|Selected text'
  );
});

test('.s()による置換を連鎖して適用する', () => {
  const render = loadTemplate();

  assert.equal(
    render('{{title.s("Example","Sample").s("page","entry")}}', vars),
    'Sample entry'
  );
});

test('\\nと\\tは改行とタブへ置換する', () => {
  const render = loadTemplate();

  assert.equal(render('a\\tb{{url}}\\nc', vars), 'a\tbhttps://example.test/page\nc');
});

test('platformOsに応じたnewline文字を使う', () => {
  const render = loadTemplate();

  assert.equal(render('a\\nb', { ...vars, newline: '\r\n' }), 'a\r\nb');
});

test('未知の変数名はリテラルのまま残す', () => {
  const render = loadTemplate();

  // {{だけが消費され、残りはそのまま出力される（従来挙動を維持）
  assert.equal(render('[{{unknown}}]', vars), '[unknown}}]');
});

test('不正なテンプレートはパースエラーになる', () => {
  const render = loadTemplate();

  assert.throws(() => render('{{title.s("missing argument")}}', vars), /parse error/);
});
