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

const loadBackground = ({ sendMessage, highlightedTabs } = {}) => {
  const sessionStorage = new Map();
  const sentMessages = [];
  const tabQueries = [];
  let openOptionsPageCalls = 0;
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
    windowId: 1,
    active: true,
  };

  const chrome = {
    runtime: {
      PlatformOs: 'linux',
      getURL(filename) {
        return `chrome-extension://test/${filename}`;
      },
      onMessage: events.runtimeMessage,
      onInstalled: events.runtimeInstalled,
      openOptionsPage() {
        openOptionsPageCalls += 1;
      },
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
      query: async queryInfo => {
        tabQueries.push(queryInfo);
        if (queryInfo.highlighted) {
          return highlightedTabs ?? [activeTab];
        }
        return [activeTab];
      },
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

  const context = { chrome, console, structuredClone, fetch: async url => ({
    ok: true,
    text: async () => `/* ${url} */`,
  }) };
  vm.createContext(context);
  vm.runInContext(
    `${backgroundSource}\n\nglobalThis.__testExports = { copyLink, getDefaultOptions };`,
    context,
    { filename: 'background.js' }
  );

  return {
    events,
    sentMessages,
    sessionStorage,
    tabQueries,
    get openOptionsPageCalls() {
      return openOptionsPageCalls;
    },
    exports: context.__testExports,
  };
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

test('uiCopyLinkは送信元タブのcontent scriptへコピーを依頼する', async () => {
  const loaded = loadBackground();

  const response = await invokeMessage(
    loaded.events.runtimeMessage.listener,
    { message: 'uiCopyLink', formatID: 1 },
    {
      tab: {
        id: 42,
        title: 'Outer page',
        url: 'https://outer.test/page',
        windowId: 1,
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.result, 'formatted');
  assert.equal(loaded.sentMessages.length, 1);
  assert.equal(loaded.sentMessages[0].tabId, 42);
  assert.equal(loaded.sentMessages[0].message.message, 'copyLink');
  assert.equal(loaded.sentMessages[0].message.pageUrl, 'https://outer.test/page');
  assert.equal(loaded.sentMessages[0].message.pageTitle, 'Outer page');
});

test('uiCopyModifiedTextは編集後テキストのコピーを依頼する', async () => {
  const loaded = loadBackground();

  const response = await invokeMessage(
    loaded.events.runtimeMessage.listener,
    {
      message: 'uiCopyModifiedText',
      formatID: 1,
      modifiedText: 'edited text',
    },
    { tab: { id: 42, windowId: 1 } }
  );

  assert.equal(response.ok, true);
  assert.equal(response.result, 'formatted');
  assert.equal(loaded.sentMessages[0].message.message, 'copyModifiedText');
  assert.equal(loaded.sentMessages[0].message.modifiedText, 'edited text');
});

test('uiCopyHighlightedTabsは選択タブをフォーマットしてコピーする', async () => {
  const loaded = loadBackground({
    highlightedTabs: [
      { id: 42, active: true, windowId: 1, title: 'First', url: 'https://first.test/' },
      { id: 7, windowId: 1, title: 'Second', url: 'https://second.test/' },
    ],
    sendMessage: async (tabId, message) => {
      if (message.message === 'formatLink') {
        return { text: `tab-${tabId}` };
      }
      return { result: 'tab-42\ntab-7' };
    },
  });

  const response = await invokeMessage(
    loaded.events.runtimeMessage.listener,
    { message: 'uiCopyHighlightedTabs', formatID: 1 },
    { tab: { id: 42, windowId: 1 } }
  );

  assert.equal(response.ok, true);
  assert.equal(response.result, 'tab-42\ntab-7');
  const formatMessages = loaded.sentMessages.filter(
    entry => entry.message.message === 'formatLink'
  );
  assert.deepEqual(formatMessages.map(entry => entry.tabId), [42, 7]);
});

test('uiGetHighlightedTabCountは同一ウィンドウの選択タブ数を返す', async () => {
  const loaded = loadBackground({
    highlightedTabs: [
      { id: 42, windowId: 1 },
      { id: 7, windowId: 1 },
    ],
  });

  const response = await invokeMessage(
    loaded.events.runtimeMessage.listener,
    { message: 'uiGetHighlightedTabCount' },
    { tab: { id: 42, windowId: 1 } }
  );

  assert.equal(response.count, 2);
  assert.equal(loaded.tabQueries.at(-1).highlighted, true);
  assert.equal(loaded.tabQueries.at(-1).windowId, 1);
});

test('openOptionsPageメッセージで設定画面を開く', async () => {
  const loaded = loadBackground();

  await invokeMessage(
    loaded.events.runtimeMessage.listener,
    { message: 'openOptionsPage' },
    {}
  );

  assert.equal(loaded.openOptionsPageCalls, 1);
});

test('getModalCssは拡張内の共通CSSとモーダルCSSを返す', async () => {
  const loaded = loadBackground();

  const response = await invokeMessage(
    loaded.events.runtimeMessage.listener,
    { message: 'getModalCss' },
    {}
  );

  assert.match(response.css, /chrome-extension:\/\/test\/ui\.css/);
  assert.match(response.css, /chrome-extension:\/\/test\/mobile-modal\.css/);
});
