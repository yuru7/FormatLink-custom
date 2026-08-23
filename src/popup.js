'use strict';

const getOptions = async () => {
  const response = await chrome.runtime.sendMessage({ message: "getOptions" });
  return response.options;
}

const getActiveFrameId = async tabId => {
  const response = await chrome.runtime.sendMessage({
    message: 'getActiveFrameId',
    tabId,
  });
  return response?.frameId ?? 0;
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

const hideCopiedResult = () => {
  const resultElem = document.getElementById('copyResult');
  resultElem.classList.remove('is-visible');
};

const populateText = formattedText => {
  hideCopiedResult();
  const textElem = document.getElementById('textToCopy');
  textElem.value = formattedText;
  textElem.focus();
};

const showCopiedResult = () => {
  const resultElem = document.getElementById('copyResult');
  resultElem.classList.add('is-visible');
};

const copyLink = async formatID => {
  const options = await getOptions();
  const format = options['format' + formatID];
  const selectionNewlines = options['selectionNewlines' + formatID];
  const asHTML = options['html' + formatID];

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const frameId = await getActiveFrameId(tabs[0].id);
  const response = await sendMessageToFrame(tabs[0].id, {
    message: "copyLink",
    format,
    selectionNewlines,
    asHTML,
    platformOs: chrome.runtime.PlatformOs,
    pageUrl: tabs[0].url,
    pageTitle: tabs[0].title,
  }, frameId)
  .catch(error => {
    console.error('Error copying link:', error);
    populateText("Failed to get link");
  });
  if (response) {
    populateText(response.result);
    return true;
  }
  return false;
};

const copyModifiedText = async (modifiedText, formatID) => {
  const options = await getOptions();
  const asHTML = options['html' + formatID];

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const frameId = await getActiveFrameId(tabs[0].id);
  const response = await sendMessageToFrame(tabs[0].id, {
    message: "copyModifiedText",
    modifiedText,
    asHTML,
    platformOs: chrome.runtime.PlatformOs,
  }, frameId)
  .catch(error => {
    console.error('Error copying modified text:', error);
  });
  if (response) {
    populateText(response.result);
    return true;
  }
  return false;
};

// 選択中の複数タブそれぞれのタイトルとURLでフォーマットし、改行区切りで
// 連結したテキストを1回だけクリップボードへコピーする。
const copyHighlightedTabs = async formatID => {
  const options = await getOptions();
  const format = options['format' + formatID];
  const asHTML = options['html' + formatID];

  const tabs = await chrome.tabs.query({ highlighted: true, currentWindow: true });
  if (tabs.length < 2) {
    return false;
  }

  const newline = chrome.runtime.PlatformOs === 'win' ? '\r\n' : '\n';
  const texts = [];
  for (const tab of tabs) {
    try {
      // {{text}} はタブタイトルのみを使うため、選択文字列は content script 側で無視される。
      const response = await sendMessageToFrame(tab.id, {
        message: "formatLink",
        format,
        platformOs: chrome.runtime.PlatformOs,
      }, 0);
      if (response?.text !== undefined) {
        texts.push(response.text);
      }
    } catch (error) {
      console.warn('Failed to format the tab:', tab.id, error);
    }
  }
  if (texts.length === 0) {
    populateText("Failed to get links");
    return false;
  }

  const targetTab = tabs.find(tab => tab.active) ?? tabs[0];
  const response = await sendMessageToFrame(targetTab.id, {
    message: "copyModifiedText",
    modifiedText: texts.join(newline),
    asHTML,
  }, 0)
  .catch(error => {
    console.error('Error copying modified text:', error);
  });
  if (response) {
    populateText(response.result);
    return true;
  }
  return false;
};

const populateFormatGroup = options => {
  const defaultFormat = options.defaultFormat;
  const cnt = options.count;
  let group = document.getElementById('formatGroup');
  while (group.hasChildNodes()) {
    group.removeChild(group.childNodes[0]);
  }
  for (let i = 1; i <= cnt; ++i) {
    let radioId = 'format' + i;

    let btn = document.createElement('input');
    btn.setAttribute('type', 'radio');
    btn.setAttribute('name', 'fomrat');
    btn.setAttribute('id', radioId);
    btn.setAttribute('value', i);
    if (i == defaultFormat) {
      btn.setAttribute('checked', 'checked');
    }
    btn.addEventListener('click', async e => {
      const result = await copyLink(e.target.value);
      if (result) {
        showCopiedResult();
      }
    });

    const optTitle = options['title' + i];
    const text = document.createTextNode(optTitle);

    let label = document.createElement('label');
    label.appendChild(btn);
    label.appendChild(text);

    group.appendChild(label);
  }
}

const getSelectedFormatID = () => {
  for (let i = 1; ; ++i) {
    const radio = document.getElementById('format' + i);
    if (!radio) {
      break;
    }
    if (radio.checked) {
      return i;
    }
  }
  return undefined;
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = await getOptions();
  if (options) {
    populateFormatGroup(options);
    const result = await copyLink(options.defaultFormat);
    if (result) {
      showCopiedResult();
    }
  }

  const copyAllTabsButton = document.getElementById('copyAllTabsButton');
  const highlightedTabs = await chrome.tabs.query({
    highlighted: true,
    currentWindow: true,
  });
  if (highlightedTabs.length >= 2) {
    copyAllTabsButton.textContent =
      `Copy all selected tabs (${highlightedTabs.length})`;
    copyAllTabsButton.hidden = false;
  }
  copyAllTabsButton.addEventListener('click', async () => {
    const formatID = getSelectedFormatID();
    if (formatID) {
      const result = await copyHighlightedTabs(formatID);
      if (result) {
        showCopiedResult();
      }
    }
  });

  const copyButton = document.getElementById('copyButton');
  const copy = async () => {
    const formatID = getSelectedFormatID();
    if (formatID) {
      const result = await copyModifiedText(document.getElementById('textToCopy').value, formatID);
      if (result) {
        showCopiedResult();
      }
    }
  };
  copyButton.addEventListener('click', copy);

  const textarea = document.getElementById('textToCopy');
  if (textarea) {
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    };
    textarea.addEventListener('input', () => {
      hideCopiedResult();
      resize();
    });
    textarea.addEventListener('keydown', event => {
      if (event.isComposing || !event.ctrlKey || event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      copy();
    });
    resize();
  }
});
