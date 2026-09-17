'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const modalSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-modal.js'),
  'utf8'
);

const createFakeElement = (tagName, elementsById) => {
  const listeners = new Map();
  const classNames = new Set();
  const element = {
    tagName,
    id: '',
    className: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    scrollHeight: 40,
    children: [],
    get childNodes() {
      return this.children;
    },
    attrs: {},
    style: {
      cssText: '',
      overflow: '',
      height: '',
    },
    classList: {
      add(name) {
        classNames.add(name);
      },
      remove(name) {
        classNames.delete(name);
      },
      contains(name) {
        return classNames.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
      if (name === 'id') {
        this.id = value;
        elementsById.set(value, this);
      }
      if (name === 'checked') {
        this.checked = true;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(type, event = { target: this, preventDefault() {} }) {
      return listeners.get(type)?.(event);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    hasChildNodes() {
      return this.children.length > 0;
    },
    removeChild() {
      return this.children.shift();
    },
    remove() {
      this.removed = true;
      if (this.id) {
        elementsById.delete(this.id);
      }
    },
    focus() {},
    attachShadow() {
      this.shadowRoot = createFakeElement('shadow-root', elementsById);
      this.shadowRoot.getElementById = id => elementsById.get(id);
      return this.shadowRoot;
    },
  };
  return element;
};

const loadModal = ({ runtimeMessages } = {}) => {
  const elementsById = new Map();
  const documentElement = createFakeElement('html', elementsById);
  const createdElements = [];
  const runtimeSent = [];
  let messageIndex = 0;

  const document = {
    documentElement,
    createElement(tagName) {
      const element = createFakeElement(tagName, elementsById);
      createdElements.push(element);
      return element;
    },
    createTextNode(text) {
      return { textContent: text };
    },
    getElementById(id) {
      return elementsById.get(id);
    },
  };
  documentElement.appendChild = child => {
    documentElement.children.push(child);
    return child;
  };

  const context = {
    console: {
      error() {},
      warn() {},
    },
    document,
    chrome: {
      runtime: {
        sendMessage(message) {
          runtimeSent.push(message);
          if (message.message === 'getModalCss') {
            return Promise.resolve({ css: '.modal { color: black; }' });
          }
          const response = runtimeMessages?.[messageIndex++];
          if (response instanceof Error) {
            return Promise.reject(response);
          }
          return Promise.resolve(response);
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(
    `${modalSource}\n; globalThis.openFormatLinkModal = openFormatLinkModal;`,
    context
  );

  return {
    document,
    documentElement,
    elementsById,
    runtimeSent,
    createdElements,
    openFormatLinkModal: context.openFormatLinkModal,
  };
};

const defaultRuntimeMessages = [
  { count: 1 },
  {
    options: {
      defaultFormat: 1,
      count: 1,
      title1: 'Markdown',
    },
  },
  { ok: true, result: '[Example](https://example.test)' },
];

test('ページ内モーダルはShadow DOMのダイアログとして開く', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });

  const opened = await loaded.openFormatLinkModal();

  assert.equal(opened, true);
  assert.equal(loaded.runtimeSent[0].message, 'getModalCss');
  const host = loaded.elementsById.get('format-link-custom-modal-host');
  assert.ok(host);
  assert.equal(host.removed, undefined);
  assert.match(host.style.cssText, /z-index: 2147483647/);
  assert.equal(loaded.documentElement.style.overflow, 'hidden');
  assert.equal(loaded.documentElement.children.includes(host), true);

  const modal = host.shadowRoot.children.find(child => child.attrs.role === 'dialog')
    ?? host.shadowRoot.children[1];
  assert.equal(modal.attrs.role, 'dialog');
  assert.equal(modal.attrs['aria-modal'], 'true');
  assert.equal(loaded.elementsById.get('closeButton').textContent, '閉じる');
  assert.equal(
    loaded.elementsById.get('textToCopy').value,
    '[Example](https://example.test)'
  );
  assert.equal(loaded.elementsById.get('copyResult').classList.contains('is-visible'), true);
});

test('既存モーダルがある場合は二重生成せず内容を更新する', async () => {
  const loaded = loadModal({
    runtimeMessages: [
      ...defaultRuntimeMessages,
      {
        options: {
          defaultFormat: 1,
          count: 1,
          title1: 'Markdown',
        },
      },
      { ok: true, result: '[Updated](https://example.test)' },
    ],
  });

  await loaded.openFormatLinkModal();
  const firstHost = loaded.elementsById.get('format-link-custom-modal-host');
  const hostCreations = loaded.createdElements.filter(
    element => element.id === 'format-link-custom-modal-host'
  ).length;

  const opened = await loaded.openFormatLinkModal();

  assert.equal(opened, true);
  assert.equal(loaded.elementsById.get('format-link-custom-modal-host'), firstHost);
  assert.equal(
    loaded.createdElements.filter(element => element.id === 'format-link-custom-modal-host').length,
    hostCreations
  );
  assert.equal(
    loaded.elementsById.get('textToCopy').value,
    '[Updated](https://example.test)'
  );
});

test('閉じるボタンでhostを削除し背景スクロールを戻す', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  await loaded.elementsById.get('closeButton').dispatchEvent('click');

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
});

test('初期表示ではtextareaを自動フォーカスしない', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });
  const focusCalls = [];
  const originalCreateElement = loaded.document.createElement;
  loaded.document.createElement = tagName => {
    const element = originalCreateElement(tagName);
    const previousFocus = element.focus;
    element.focus = () => {
      focusCalls.push(element.id || tagName);
      previousFocus();
    };
    return element;
  };

  await loaded.openFormatLinkModal();

  assert.deepEqual(focusCalls, []);
});
