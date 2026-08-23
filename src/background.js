'use strict';

const FORMAT_MAX_COUNT = 9;

const DEFAULT_OPTIONS = {
  "defaultFormat": 1,
  "title1": "Markdown",
  "format1": "[{{text.s(\"\\\\[\",\"\\\\[\").s(\"\\\\]\",\"\\\\]\")}}]({{url.s(\"\\\\(\",\"%28\").s(\"\\\\)\",\"%29\")}})",
  "html1": 0,
  "selectionNewlines1": "spaces",
  "title2": "Text",
  "format2": "{{text}} {{url}}",
  "html2": 0,
  "selectionNewlines2": "spaces",
  "title3": 'HTML',
  "format3": "<a href=\"{{url.s(\"\\\"\",\"&quot;\")}}\">{{text.s(\"<\",\"&lt;\")}}</a>",
  "html3": 1,
  "selectionNewlines3": "spaces",
  "title4": "reST",
  "format4": "`{{text}} <{{url}}>`_",
  "html4": 0,
  "selectionNewlines4": "spaces",
  "title5": "LaTeX",
  "format5": "\\\\href\\{{{url}}\\}\\{{{text}}\\}",
  "html5": 0,
  "selectionNewlines5": "spaces",
  "title6": "",
  "format6": "",
  "html6": 0,
  "selectionNewlines6": "spaces",
  "title7": "",
  "format7": "",
  "html7": 0,
  "selectionNewlines7": "spaces",
  "title8": "",
  "format8": "",
  "html8": 0,
  "selectionNewlines8": "spaces",
  "title9": "",
  "format9": "",
  "html9": 0,
  "selectionNewlines9": "spaces",
  "createSubmenus": true
};

const getFormatCount = options => {
  let i;
  for (i = 1; i <= 9; ++i) {
    const optTitle = options['title' + i];
    const optFormat = options['format' + i];
    if (optTitle === '' || optFormat === '') {
      break;
    }
  }
  return i - 1;
};

const getDefaultOptions = () => {
  const options = structuredClone(DEFAULT_OPTIONS);
  const count = getFormatCount(options);
  return { ...options, count, maxCount: FORMAT_MAX_COUNT };
};

const getOptions = async () => {
  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  const count = getFormatCount(options);
  return { ...options, count, maxCount: FORMAT_MAX_COUNT };
};

const activeFrameStorageKey = tabId => `activeFrameId:${tabId}`;

const getActiveFrameId = async tabId => {
  const key = activeFrameStorageKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] ?? 0;
};

const setActiveFrameId = async (tabId, frameId) => {
  await chrome.storage.session.set({
    [activeFrameStorageKey(tabId)]: frameId,
  });
};

const clearActiveFrameId = async tabId => {
  await chrome.storage.session.remove(activeFrameStorageKey(tabId));
};

const sendMessageToFrame = async (tabId, message, frameId) => {
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch (error) {
    if (frameId !== 0) {
      return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    }
    throw error;
  }
};

const createContextMenus = async options => {
  await chrome.contextMenus.removeAll();
  if (options.createSubmenus) {
    let promises = [];
    for (let i = 0; i < options.count; i++) {
      const format = options['title' + (i + 1)];
      promises[i] = chrome.contextMenus.create({
        id: "format-link-format" + (i + 1),
        title: "as " + format,
        contexts: ["all"]
      });
    }
    await Promise.all(promises);
  } else {
    const defaultFormat = options['title' + options['defaultFormat']];
    await chrome.contextMenus.create({
      id: "format-link-format-default",
      title: "Format Link as " + defaultFormat,
      contexts: ["all"]
    });
  }
};

// NOTE: We use callback here since the return value of sendMessage called in
// popup.js becomes undefined if we use async/await.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'getOptions') {
    getOptions().then(options => {
      sendResponse({ options });
    });
  } else if (request.message === 'getDefaultOptions') {
    const options = getDefaultOptions();
    sendResponse({ options });
  } else if (request.message === 'setActiveFrame') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({});
    } else {
      setActiveFrameId(tabId, sender.frameId ?? 0).then(() => {
        sendResponse({});
      });
    }
  } else if (request.message === 'getActiveFrameId') {
    getActiveFrameId(request.tabId).then(frameId => {
      sendResponse({ frameId });
    });
  } else if (request.message === 'createContextMenus') {
    createContextMenus(request.options).then(() => {
      sendResponse({});
    });
  }
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const options = await getOptions();
  await createContextMenus(options);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearActiveFrameId(tabId);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  clearActiveFrameId(tabId);
});

const menuItemIdPrefix = 'format-link-format';
const menuItemIdDefault = 'format-link-format-default';

const copyLink = async (menuItemId, linkUrl, frameId, tab) => {
  const options = await getOptions();
  const formatID = menuItemId === menuItemIdDefault ?
    options.defaultFormat : menuItemId.substr(menuItemIdPrefix.length);
  const format = options['format' + formatID];
  const selectionNewlines = options['selectionNewlines' + formatID];
  const asHTML = options['html' + formatID];

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTab = tab || tabs[0];
  const targetFrameId = frameId ?? await getActiveFrameId(targetTab.id);
  const response = await sendMessageToFrame(targetTab.id, {
    message: "copyLink",
    format,
    selectionNewlines,
    asHTML,
    platformOs: chrome.runtime.PlatformOs,
    linkUrl,
    pageUrl: targetTab.url,
    pageTitle: targetTab.title,
  }, targetFrameId);
};

chrome.contextMenus.onClicked.addListener((item, tab) => {
  const menuItemId = item.menuItemId;
  if (menuItemId.startsWith(menuItemIdPrefix)) {
    return copyLink(menuItemId, item.linkUrl, item.frameId ?? 0, tab);
  }
});

chrome.commands.onCommand.addListener(command => {
  if (command.startsWith(menuItemIdPrefix)) {
    return copyLink(command);
  }
});
