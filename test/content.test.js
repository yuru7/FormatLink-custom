'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const contentSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf8'
);

const emptySelection = {
  rangeCount: 0,
  toString: () => '',
};

const loadContentScript = ({
  title = 'Example page',
  url = 'https://example.test/page',
  selection = emptySelection,
  hoveredText,
  iframes = [],
  sendMessageThrows = false,
} = {}) => {
  const listeners = new Map();
  const clipboard = {};
  const sentMessages = [];

  const document = {
    title,
    querySelectorAll() {
      return iframes;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      const copyListener = listeners.get('copy');
      if (!copyListener) {
        return false;
      }
      copyListener({
        clipboardData: {
          setData(type, value) {
            clipboard[type] = value;
          },
        },
        preventDefault() {},
        stopImmediatePropagation() {},
      });
      return true;
    },
  };

  const context = {
    console: {
      log() {},
      error: console.error,
      warn: console.warn,
    },
    document,
    window: {
      location: { href: url },
      getSelection: () => selection,
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          if (sendMessageThrows) {
            throw new Error('Extension context invalidated');
          }
          sentMessages.push(message);
          return Promise.resolve();
        },
        onMessage: {
          addListener() {},
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(
    `${contentSource}\n\nglobalThis.__testExports = { formatLinkAsText, copyToTheClipboard };`,
    context,
    { filename: 'content.js' }
  );

  if (hoveredText !== undefined) {
    listeners.get('mouseover')({
      target: {
        closest: () => ({ text: hoveredText }),
      },
    });
  }

  return {
    ...context.__testExports,
    clipboard,
    listeners,
    sentMessages,
  };
};

test('ページタイトルとURLを既定値として展開する', () => {
  const { formatLinkAsText } = loadContentScript({
    title: 'Example page',
    url: 'https://example.test/page',
  });

  const result = formatLinkAsText(
    '{{text}} <{{url}}> {{title}} {{pageUrl}}',
    'linux'
  );

  assert.equal(
    result,
    'Example page <https://example.test/page> Example page https://example.test/page'
  );
});

test('テンプレート変数の置換を連鎖して適用する', () => {
  const { formatLinkAsText } = loadContentScript({ title: 'foo foo' });

  const result = formatLinkAsText(
    '{{title.s("foo","bar").s("bar","baz")}}',
    'linux'
  );

  assert.equal(result, 'baz baz');
});

test('Windowsでは改行をCRLFに変換する', () => {
  const { formatLinkAsText } = loadContentScript({
    url: 'https://example.test/page',
  });

  assert.equal(
    formatLinkAsText('link\\n{{url}}', 'win'),
    'link\r\nhttps://example.test/page'
  );
  assert.equal(
    formatLinkAsText('link\\n{{url}}', 'linux'),
    'link\nhttps://example.test/page'
  );
});

test('選択文字列の改行を空白に変換または保持する', () => {
  const selection = {
    rangeCount: 1,
    toString: () => 'first\r\nsecond\n\nthird',
    getRangeAt: () => ({
      startContainer: {
        firstChild: null,
        nextSibling: null,
        parentNode: null,
      },
      endContainer: {},
    }),
  };
  const { formatLinkAsText } = loadContentScript({ selection });

  assert.equal(
    formatLinkAsText('{{text}}', 'linux', undefined, undefined, undefined, 'spaces'),
    'first second third'
  );
  assert.equal(
    formatLinkAsText('{{text}}', 'linux', undefined, undefined, undefined, 'preserve'),
    'first\r\nsecond\n\nthird'
  );
});

test('選択文字列の改行周辺の空白も含めて空白1個にまとめる', () => {
  const selection = {
    rangeCount: 1,
    toString: () => 'first \r\n\t\r\n second',
    getRangeAt: () => ({
      startContainer: {
        firstChild: null,
        nextSibling: null,
        parentNode: null,
      },
      endContainer: {},
    }),
  };
  const { formatLinkAsText } = loadContentScript({ selection });

  assert.equal(
    formatLinkAsText('{{text}}', 'linux', undefined, undefined, undefined, 'spaces'),
    'first second'
  );
});

test('選択文字列以外の改行は変換しない', () => {
  const { formatLinkAsText } = loadContentScript({
    title: 'first\r\nsecond',
  });

  assert.equal(
    formatLinkAsText('{{text}}', 'linux', undefined, undefined, undefined, 'spaces'),
    'first\r\nsecond'
  );
});

test('コンテキストメニューのリンクとmouseoverのリンク文字列を使う', () => {
  const { formatLinkAsText } = loadContentScript({
    title: 'Page title',
    hoveredText: '  Link label  ',
    selection: {
      rangeCount: 1,
      toString: () => 'Selected text',
      getRangeAt: () => ({
        startContainer: { parentNode: null },
        endContainer: {},
      }),
    },
  });

  assert.equal(
    formatLinkAsText('{{text}} -> {{url}}', 'linux', 'https://link.test/'),
    'Link label -> https://link.test/'
  );
});

test('トップフレームのSelectionが空でも同一オリジンiframeの選択を使う', () => {
  const selection = {
    rangeCount: 1,
    toString: () => 'iframe description',
    getRangeAt: () => ({
      startContainer: {
        firstChild: null,
        nextSibling: null,
        parentNode: null,
      },
      endContainer: {},
    }),
  };
  const childDocument = {
    getSelection: () => selection,
    querySelectorAll: () => [],
  };
  const { formatLinkAsText } = loadContentScript({
    iframes: [{ contentDocument: childDocument }],
  });

  assert.equal(
    formatLinkAsText('{{text}}', 'linux'),
    'iframe description'
  );
});

test('選択文字列と選択範囲内の最初のリンクURLを使う', () => {
  const anchor = {
    tagName: 'A',
    href: 'https://link.test/first',
    firstChild: null,
    nextSibling: null,
    parentNode: null,
  };
  const startNode = {
    firstChild: null,
    nextSibling: anchor,
    parentNode: null,
  };
  const selection = {
    rangeCount: 1,
    toString: () => 'Selected text',
    getRangeAt: () => ({
      startContainer: startNode,
      endContainer: {},
    }),
  };
  const { formatLinkAsText } = loadContentScript({ selection });

  assert.equal(
    formatLinkAsText('{{text}} -> {{url}}', 'linux'),
    'Selected text -> https://link.test/first'
  );
});

test('iframe内の選択文字列を使い、ページURLとタイトルは外側のタブを使う', () => {
  const selection = {
    rangeCount: 1,
    toString: () => 'iframe selection',
    getRangeAt: () => ({
      startContainer: {
        firstChild: null,
        nextSibling: null,
        parentNode: null,
      },
      endContainer: {},
    }),
  };
  const loaded = loadContentScript({
    title: 'iframe document',
    url: 'https://frame.test/document',
    selection,
  });

  loaded.listeners.get('selectionchange')();

  assert.equal(
    loaded.formatLinkAsText(
      '{{text}} -> {{url}} -> {{title}}',
      'linux',
      undefined,
      'https://outer.test/page',
      'Outer page'
    ),
    'iframe selection -> https://outer.test/page -> Outer page'
  );
  assert.equal(loaded.sentMessages.length, 1);
  assert.equal(loaded.sentMessages[0].message, 'setActiveFrame');
});

test('拡張機能のコンテキスト無効化時にフレーム通知の同期例外を無視する', () => {
  const loaded = loadContentScript({ sendMessageThrows: true });

  assert.doesNotThrow(() => loaded.listeners.get('pointerdown')());
});

test('不正なテンプレートはパースエラーになる', () => {
  const { formatLinkAsText } = loadContentScript();

  assert.throws(
    () => formatLinkAsText('{{title.s("missing argument")}}', 'linux'),
    /parse error/
  );
});

test('クリップボードには常にtext/plainを設定し、HTML指定時はtext/htmlも設定する', async () => {
  const first = loadContentScript();
  await first.copyToTheClipboard('formatted text', false);
  assert.deepEqual(first.clipboard, { 'text/plain': 'formatted text' });

  const second = loadContentScript();
  await second.copyToTheClipboard('<b>formatted</b>', true);
  assert.deepEqual(second.clipboard, {
    'text/plain': '<b>formatted</b>',
    'text/html': '<b>formatted</b>',
  });
});
