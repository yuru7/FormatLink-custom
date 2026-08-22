'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const popupSource = fs.readFileSync(
  path.join(__dirname, '..', 'popup.js'),
  'utf8'
);

const createPopup = responses => {
  const elements = new Map();
  const documentListeners = new Map();
  const timers = [];

  const createElement = id => {
    const listeners = new Map();
    const classNames = new Set();
    return {
      id,
      value: '',
      checked: false,
      disabled: false,
      style: {},
      scrollHeight: 40,
      children: [],
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
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      dispatchEvent(type, event = { target: this }) {
        return listeners.get(type)?.(event);
      },
      focus() {},
      setAttribute(name, value) {
        if (name === 'id') {
          this.id = value;
          elements.set(value, this);
        }
        if (name === 'checked') {
          this.checked = true;
        }
      },
      appendChild(child) {
        this.children.push(child);
      },
      hasChildNodes() {
        return this.children.length > 0;
      },
      removeChild() {
        this.children.shift();
      },
    };
  };

  for (const id of ['textToCopy', 'formatGroup', 'saveDefaultFormatButton', 'copyButton', 'copyResult']) {
    elements.set(id, createElement(id));
  }

  let responseIndex = 0;
  const sentMessages = [];
  const context = {
    console: { error() {} },
    document: {
      addEventListener(type, listener) {
        documentListeners.set(type, listener);
      },
      getElementById(id) {
        return elements.get(id);
      },
      createElement,
      createTextNode(text) {
        return { textContent: text };
      },
    },
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    chrome: {
      runtime: {
        PlatformOs: 'linux',
        sendMessage(message) {
          if (message.message === 'getOptions') {
            return Promise.resolve({
              options: {
                defaultFormat: 1,
                count: 1,
                title1: 'Markdown',
                format1: '[{{text}}]({{url}})',
                selectionNewlines1: 'spaces',
                html1: false,
              },
            });
          }
          if (message.message === 'getActiveFrameId') {
            return Promise.resolve({ frameId: 0 });
          }
          return Promise.resolve();
        },
      },
      tabs: {
        query() {
          return Promise.resolve([{ id: 1, url: 'https://example.test', title: 'Example' }]);
        },
        sendMessage(tabId, message, options) {
          sentMessages.push({ tabId, message, options });
          return Promise.resolve(responses[responseIndex++]);
        },
      },
    },
  };

  vm.runInNewContext(popupSource, context);

  return {
    elements,
    sentMessages,
    timers,
    async initialize() {
      await documentListeners.get('DOMContentLoaded')();
    },
  };
};

test('初期コピー成功時にcopied!を表示する', async () => {
  const popup = createPopup([{ result: '[Example](https://example.test)' }]);

  await popup.initialize();

  assert.equal(popup.elements.get('copyResult').classList.contains('is-visible'), true);
  assert.equal(popup.sentMessages[0].message.selectionNewlines, 'spaces');
  assert.equal(popup.timers.length, 0);
});

test('初期コピー失敗時はcopied!を表示しない', async () => {
  const popup = createPopup([undefined]);

  await popup.initialize();

  assert.equal(popup.elements.get('copyResult').classList.contains('is-visible'), false);
  assert.equal(popup.timers.length, 0);
});

test('Link Textを編集するとcopied!を消す', async () => {
  const popup = createPopup([{ result: '[Example](https://example.test)' }]);

  await popup.initialize();
  popup.elements.get('textToCopy').dispatchEvent('input');

  assert.equal(popup.elements.get('copyResult').classList.contains('is-visible'), false);
  assert.equal(popup.timers.length, 0);
});

test('Link Textをプログラムで置き換えるとcopied!を消す', async () => {
  const popup = createPopup([
    { result: '[Example](https://example.test)' },
    { result: '[Example](https://example.test?format=2)' },
  ]);

  await popup.initialize();
  await popup.elements.get('format1').dispatchEvent('click');

  assert.equal(popup.elements.get('copyResult').classList.contains('is-visible'), false);
  assert.equal(popup.timers.length, 0);
});

test('Copy成功時はLink Text更新後にcopied!を再表示する', async () => {
  const popup = createPopup([
    { result: '[Example](https://example.test)' },
    { result: 'edited text' },
  ]);

  await popup.initialize();
  await popup.elements.get('copyButton').dispatchEvent('click');

  assert.equal(popup.timers.length, 0);
  assert.equal(popup.elements.get('copyResult').classList.contains('is-visible'), true);
});
