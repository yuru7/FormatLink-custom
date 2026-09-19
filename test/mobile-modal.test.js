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

const createFakeCloseWatcher = instances => {
  return class FakeCloseWatcher {
    constructor() {
      this.destroyed = false;
      this.listeners = new Set();
      instances.push(this);
    }

    addEventListener(type, listener) {
      if (type === 'close') {
        this.listeners.add(listener);
      }
    }

    destroy() {
      this.destroyed = true;
    }

    dispatchClose() {
      if (this.destroyed) {
        return;
      }
      for (const listener of [...this.listeners]) {
        listener();
      }
      this.destroyed = true;
    }
  };
};

const loadModal = ({
  runtimeMessages,
  modalCss = '.modal { color: black; }',
  modalCssError,
  closeWatcher = true,
} = {}) => {
  const elementsById = new Map();
  const documentElement = createFakeElement('html', elementsById);
  const createdElements = [];
  const runtimeSent = [];
  const closeWatchers = [];
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

  const windowListeners = {
    keydown: new Set(),
  };
  const dispatchWindowEvent = (type, event) => {
    for (const listener of [...windowListeners[type] ?? []]) {
      listener(event);
    }
  };
  const window = {
    addEventListener(type, listener) {
      windowListeners[type]?.add(listener);
    },
    removeEventListener(type, listener) {
      windowListeners[type]?.delete(listener);
    },
  };

  const context = {
    console: {
      error() {},
      warn() {},
    },
    document,
    window,
    chrome: {
      runtime: {
        sendMessage(message) {
          runtimeSent.push(message);
          if (message.message === 'getModalCss') {
            if (modalCssError) {
              return Promise.reject(modalCssError);
            }
            return Promise.resolve({ css: modalCss });
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
  if (closeWatcher) {
    context.CloseWatcher = createFakeCloseWatcher(closeWatchers);
  }

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
    closeWatchers,
    windowListeners,
    dispatchWindowEvent,
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
  assert.match(host.style.cssText, /font-size: 16px/);
  assert.equal(loaded.documentElement.style.overflow, 'hidden');
  assert.equal(loaded.documentElement.children.includes(host), true);

  const modal = host.shadowRoot.children.find(child => child.attrs.role === 'dialog')
    ?? host.shadowRoot.children[1];
  assert.equal(modal.attrs.role, 'dialog');
  assert.equal(modal.attrs['aria-modal'], 'true');
  assert.equal(loaded.elementsById.get('closeButton').textContent, 'Close');
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

test('Closeボタンでhostを削除し背景スクロールを戻す', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  await loaded.elementsById.get('closeButton').dispatchEvent('click');

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
});

test('Copy成功時はモーダルを閉じる', async () => {
  const loaded = loadModal({
    runtimeMessages: [
      ...defaultRuntimeMessages,
      { ok: true, result: '[Example](https://example.test)' },
    ],
  });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  await loaded.elementsById.get('copyButton').dispatchEvent('click');

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
});

test('Copy失敗時はモーダルを閉じない', async () => {
  const loaded = loadModal({
    runtimeMessages: [
      ...defaultRuntimeMessages,
      new Error('copy failed'),
    ],
  });

  await loaded.openFormatLinkModal();
  await loaded.elementsById.get('copyButton').dispatchEvent('click');

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), true);
});

test('モーダルを開くとCloseWatcherを1つ作りEscape用keydownは付けない', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });

  await loaded.openFormatLinkModal();

  assert.equal(loaded.closeWatchers.length, 1);
  assert.equal(loaded.closeWatchers[0].destroyed, false);
  assert.equal(loaded.windowListeners.keydown.size, 0);
});

test('既存モーダルの再表示ではCloseWatcherを追加しない', async () => {
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
  await loaded.openFormatLinkModal();

  assert.equal(loaded.closeWatchers.length, 1);
  assert.equal(loaded.closeWatchers[0].destroyed, false);
});

test('CloseボタンはCloseWatcherを破棄して二重に閉じない', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  const watcher = loaded.closeWatchers[0];
  await loaded.elementsById.get('closeButton').dispatchEvent('click');
  watcher.dispatchClose();

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
  assert.equal(watcher.destroyed, true);
});

test('戻る操作相当のCloseWatcher closeでモーダルを閉じる', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  loaded.closeWatchers[0].dispatchClose();

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
  assert.equal(loaded.closeWatchers[0].destroyed, true);
});

test('モーダルが閉じた後のCloseWatcher closeでは何もしない', async () => {
  const loaded = loadModal({ runtimeMessages: defaultRuntimeMessages });

  await loaded.openFormatLinkModal();
  const watcher = loaded.closeWatchers[0];
  await loaded.elementsById.get('closeButton').dispatchEvent('click');
  watcher.dispatchClose();

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
});

test('Copy成功時もCloseWatcherを破棄する', async () => {
  const loaded = loadModal({
    runtimeMessages: [
      ...defaultRuntimeMessages,
      { ok: true, result: '[Example](https://example.test)' },
    ],
  });

  await loaded.openFormatLinkModal();
  await loaded.elementsById.get('copyButton').dispatchEvent('click');

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.closeWatchers[0].destroyed, true);
});

test('CloseWatcherがない環境ではEscapeキーで閉じる', async () => {
  const loaded = loadModal({
    runtimeMessages: defaultRuntimeMessages,
    closeWatcher: false,
  });
  loaded.documentElement.style.overflow = 'auto';

  await loaded.openFormatLinkModal();
  assert.equal(loaded.closeWatchers.length, 0);
  assert.equal(loaded.windowListeners.keydown.size, 1);

  loaded.dispatchWindowEvent('keydown', {
    key: 'Escape',
    isComposing: false,
    preventDefault() {},
  });

  assert.equal(loaded.elementsById.has('format-link-custom-modal-host'), false);
  assert.equal(loaded.documentElement.style.overflow, 'auto');
  assert.equal(loaded.windowListeners.keydown.size, 0);
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

const readModalCss = () => fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-modal.css'),
  'utf8'
);

const getShadowStyle = loaded => {
  const host = loaded.elementsById.get('format-link-custom-modal-host');
  return host.shadowRoot.children.find(child => child.tagName === 'style');
};

test('mobile-modal.cssは16px基準でremを使わない', () => {
  const css = readModalCss();

  assert.match(css, /:host\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(css, /box-sizing:\s*border-box/);
  assert.match(css, /button,\s*input,\s*textarea,\s*select\s*\{[\s\S]*?font:\s*inherit/);
  assert.doesNotMatch(css, /[\d.]rem\b/);
});

test('Shadow DOMへ注入するCSSのremは16px基準のpxへ置き換える', async () => {
  const loaded = loadModal({
    runtimeMessages: defaultRuntimeMessages,
    modalCss: [
      ':host { font-size: 16px; }',
      '.format-link-ui { font-size: 0.8125rem; }',
      '.modal { padding: 1rem; font-size: 1.2em; }',
    ].join('\n'),
  });

  await loaded.openFormatLinkModal();
  const css = getShadowStyle(loaded).textContent;

  assert.match(css, /font-size: 13px/);
  assert.match(css, /padding: 16px/);
  assert.match(css, /font-size: 1.2em/);
  assert.doesNotMatch(css, /[\d.]rem\b/);
});

test('CSS読み込み失敗時は16px基準のフォールバックを使う', async () => {
  const loaded = loadModal({
    runtimeMessages: defaultRuntimeMessages,
    modalCssError: new Error('css failed'),
  });

  await loaded.openFormatLinkModal();
  const css = getShadowStyle(loaded).textContent;

  assert.match(css, /:host\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(css, /font:\s*inherit/);
  assert.doesNotMatch(css, /[\d.]rem\b/);
});

