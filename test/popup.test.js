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
    return {
      id,
      value: '',
      checked: false,
      disabled: false,
      style: {},
      scrollHeight: 40,
      children: [],
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
  elements.get('copyResult').style.visibility = 'hidden';

  let responseIndex = 0;
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
        sendMessage() {
          return Promise.resolve(responses[responseIndex++]);
        },
      },
    },
  };

  vm.runInNewContext(popupSource, context);

  return {
    elements,
    timers,
    async initialize() {
      await documentListeners.get('DOMContentLoaded')();
    },
  };
};

test('初期コピー成功時にcopied!を一時表示する', async () => {
  const popup = createPopup([{ result: '[Example](https://example.test)' }]);

  await popup.initialize();

  assert.equal(popup.elements.get('copyResult').style.visibility, 'visible');
  assert.equal(popup.timers.length, 1);
  assert.equal(popup.timers[0].delay, 3000);

  popup.timers[0].callback();
  assert.equal(popup.elements.get('copyResult').style.visibility, 'hidden');
});

test('初期コピー失敗時はcopied!を表示しない', async () => {
  const popup = createPopup([undefined]);

  await popup.initialize();

  assert.equal(popup.elements.get('copyResult').style.visibility, 'hidden');
  assert.equal(popup.timers.length, 0);
});

test('copied!の連続表示では前のタイマーを解除する', async () => {
  const popup = createPopup([
    { result: '[Example](https://example.test)' },
    { result: 'edited text' },
  ]);

  await popup.initialize();
  await popup.elements.get('copyButton').dispatchEvent('click');

  assert.equal(popup.timers.length, 2);
  assert.equal(popup.timers[0].cleared, true);
  assert.equal(popup.elements.get('copyResult').style.visibility, 'visible');

  popup.timers[1].callback();
  assert.equal(popup.elements.get('copyResult').style.visibility, 'hidden');
});
