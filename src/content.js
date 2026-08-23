'use strict';

var linkText;
const setActiveFrame = () => {
  try {
    const response = chrome.runtime.sendMessage({ message: 'setActiveFrame' });
    response?.catch?.(() => {});
  } catch {
    // 拡張機能の再読み込み後に残った古いcontent scriptは無視する。
  }
};

document.addEventListener('pointerdown', setActiveFrame);
document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
    setActiveFrame();
  }
});
document.addEventListener('mouseover', function(event) {
  const anchorElement = event.target.closest('a');
  if (anchorElement) {
    setActiveFrame();
    linkText = anchorElement.text.trim();
  }
});

const findSelection = targetDocument => {
  const selection = targetDocument.getSelection?.() ??
    (targetDocument === document
      ? window.getSelection()
      : targetDocument.defaultView?.getSelection?.());

  if (selection?.rangeCount > 0 && selection.toString().trim()) {
    return selection;
  }

  for (const frame of targetDocument.querySelectorAll?.('iframe, frame') ?? []) {
    try {
      const childSelection = frame.contentDocument &&
        findSelection(frame.contentDocument);
      if (childSelection) {
        return childSelection;
      }
    } catch {
      // クロスオリジンiframeは無視する。
    }
  }

  return null;
};

const formatLinkAsText = (
  format,
  platformOs,
  linkUrl,
  pageUrlOverride,
  titleOverride,
  selectionNewlines,
  ignoreSelection = false
) => {
  const getFirstLinkInSelection = selection => {
    const getNextNode = (node, endNode) => {
      if (node.firstChild) {
        return node.firstChild;
      }

      while (node) {
        if (node.nextSibling) {
          return node.nextSibling;
        }
        node = node.parentNode;
        if (node === endNode) {
          return node;
        }
      }
    };

    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    const endNode = range.endContainer;
    for (; node; node = getNextNode(node, endNode)) {
      if (node.tagName === 'A') {
        return node.href;
      }

      if (node === endNode) {
        break;
      }
    }

    for (node = range.startContainer; node; node = node.parentNode) {
      if (node.tagName === 'A') {
        return node.href;
      }
    }
    return '';
  };

  const title = titleOverride ?? document.title;
  let text;
  let href = linkUrl;
  if (linkUrl) {
    text = linkText;
  }
  const selection = ignoreSelection ? null : findSelection(document);
  console.log(`linkUrl=${linkUrl}, text=${text}, selection?.rangeCount=${selection?.rangeCount}`);
  if (selection?.rangeCount > 0) {
    let selectionText = selection.toString().trim();
    if (selectionNewlines === 'spaces') {
      selectionText = selectionText.replace(
        /[ \t]*(?:(?:\r\n?|\n)[ \t]*)+/g,
        ' '
      );
    }
    if (!text && selectionText) {
      text = selectionText;
    }

    const hrefInSelection = getFirstLinkInSelection(selection);
    if (!href && hrefInSelection) {
      href = hrefInSelection;
    }
  }
  if (!text) {
    text = title;
  }
  const pageUrl = pageUrlOverride ?? window.location.href;
  if (!href) {
    href = pageUrl;
  }

  return renderFormatTemplate(format, {
    url: href,
    pageUrl,
    title,
    text,
    newline: platformOs === 'win' ? '\r\n' : '\n',
  });
};

const copyToTheClipboard = (textToCopy, asHTML) => {
  return new Promise((resolve, reject) => {
    const oncopy = event => {
      document.removeEventListener("copy", oncopy, true);
      event.stopImmediatePropagation();
      event.preventDefault();
      try {
        event.clipboardData.setData("text/plain", textToCopy);
        if (asHTML) {
          event.clipboardData.setData("text/html", textToCopy);
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    }
    document.addEventListener("copy", oncopy, true);
    document.execCommand("copy");
  });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "copyLink") {
    const textToCopy = formatLinkAsText(
      request.format,
      request.platformOs,
      request.linkUrl,
      request.pageUrl,
      request.pageTitle,
      request.selectionNewlines
    );
    copyToTheClipboard(textToCopy, request.asHTML).then(() => {
      sendResponse({ result: textToCopy });
    });
    return true;
  } else if (request.message === "copyModifiedText") {
    const textToCopy = request.modifiedText;
    copyToTheClipboard(textToCopy, request.asHTML).then(() => {
      sendResponse({ result: textToCopy });
    });
    return true;
  } else if (request.message === "formatLink") {
    // 複数タブ用: コピーせず、タブ自身のタイトルとURLのみでフォーマットする。
    // ページ内の選択文字列やリンクは無視する。
    const text = formatLinkAsText(
      request.format,
      request.platformOs,
      undefined,
      undefined,
      undefined,
      undefined,
      true
    );
    sendResponse({ text });
  }
});
