'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background.js'),
  'utf8'
);

const createEvent = () => ({
  addListener(listener) {
    this.listener = listener;
  },
});

const loadBackground = ({ sendMessage } = {}) => {
  const sessionStorage = new Map();
  const sentMessages = [];
  const events = {
    runtimeMessage: createEvent(),
    runtimeInstalled: createEvent(),
    contextMenuClicked: createEvent(),
    command: createEvent(),
    tabsUpdated: createEvent(),
    tabsRemoved: createEvent(),
  };
  const activeTab = {
    id: 42,
    title: 'Outer page',
    url: 'https://outer.test/page',
  };

  const chrome = {
    runtime: {
      PlatformOs: 'linux',
      onMessage: events.runtimeMessage,
      onInstalled: events.runtimeInstalled,
    },
    storage: {
      sync: {
        get: async defaults => structuredClone(defaults),
        set: async () => {},
      },
      session: {
        get: async key => {
          const keys = typeof key === 'string' ? [key] : Object.keys(key);
          const result = {};
          for (const storageKey of keys) {
            if (sessionStorage.has(storageKey)) {
              result[storageKey] = sessionStorage.get(storageKey);
            }
          }
          return result;
        },
        set: async values => {
          for (const [key, value] of Object.entries(values)) {
            sessionStorage.set(key, value);
          }
        },
        remove: async key => {
          sessionStorage.delete(key);
        },
      },
    },
    contextMenus: {
      removeAll: async () => {},
      create: async () => {},
      onClicked: events.contextMenuClicked,
    },
    commands: {
      onCommand: events.command,
    },
    tabs: {
      query: async () => [activeTab],
      sendMessage: async (tabId, message, options) => {
        sentMessages.push({ tabId, message, options });
        if (sendMessage) {
          return sendMessage(tabId, message, options);
        }
        return { result: 'formatted' };
      },
      onUpdated: events.tabsUpdated,
      onRemoved: events.tabsRemoved,
    },
  };

  const context = { chrome, console, structuredClone };
  vm.createContext(context);
  vm.runInContext(
    `${backgroundSource}\n\nglobalThis.__testExports = { copyLink, getDefaultOptions };`,
    context,
    { filename: 'background.js' }
  );

  return { events, sentMessages, sessionStorage, exports: context.__testExports };
};

const invokeMessage = (listener, request, sender) => new Promise(resolve => {
  listener(request, sender, resolve);
});

test('初期フォーマットの順序と既定値', () => {
  const { exports } = loadBackground();
  const options = exports.getDefaultOptions();

  assert.deepEqual(
    [1, 2, 3, 4, 5].map(i => options['title' + i]),
    ['Markdown', 'Text', 'HTML', 'reST', 'LaTeX']
  );
  assert.equal(options.defaultFormat, 1);
  assert.equal(options.format2, '{{text}} {{url}}');
  assert.deepEqual(
    [1, 2, 3].map(i => options['selectionNewlines' + i]),
    ['spaces', 'spaces', 'spaces']
  );
  assert.deepEqual(
    [1, 2, 3].map(i => options['html' + i]),
    [0, 0, 1]
  );
});

test('コンテキストメニューのframeIdを送信先に指定する', async () => {
  const loaded = loadBackground();

  await loaded.events.contextMenuClicked.listener(
    {
      menuItemId: 'format-link-format1',
      linkUrl: 'https://link.test/',
      frameId: 7,
    },
    {
      id: 42,
      title: 'Outer page',
      url: 'https://outer.test/page',
    }
  );

  assert.equal(loaded.sentMessages.length, 1);
  assert.equal(loaded.sentMessages[0].tabId, 42);
  assert.equal(loaded.sentMessages[0].options.frameId, 7);
  assert.equal(loaded.sentMessages[0].message.pageUrl, 'https://outer.test/page');
  assert.equal(loaded.sentMessages[0].message.pageTitle, 'Outer page');
  assert.equal(loaded.sentMessages[0].message.selectionNewlines, 'spaces');
});

test('保存したアクティブフレームをコマンド送信に利用する', async () => {
  const loaded = loadBackground();
  const listener = loaded.events.runtimeMessage.listener;

  await invokeMessage(
    listener,
    { message: 'setActiveFrame' },
    { tab: { id: 42 }, frameId: 5 }
  );
  const response = await invokeMessage(
    listener,
    { message: 'getActiveFrameId', tabId: 42 },
    {}
  );

  assert.equal(response.frameId, 5);

  await loaded.exports.copyLink('format-link-format1');

  assert.equal(loaded.sentMessages.at(-1).options.frameId, 5);
});

test('存在しないフレームの場合はトップフレームへフォールバックする', async () => {
  const frameIds = [];
  const loaded = loadBackground({
    sendMessage: async (tabId, message, options) => {
      frameIds.push(options.frameId);
      if (options.frameId !== 0) {
        throw new Error('frame is gone');
      }
      return { result: 'formatted' };
    },
  });

  await loaded.exports.copyLink('format-link-format1', undefined, 9);

  assert.deepEqual(frameIds, [9, 0]);
});
