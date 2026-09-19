'use strict';

const FORMAT_LINK_MODAL_HOST_ID = 'format-link-custom-modal-host';
const modalControllers = new WeakMap();

const cssWithoutRem = css => css.replace(
  /(-?[\d.]+)rem\b/g,
  (_, value) => `${Number.parseFloat(value) * 16}px`
);

const FALLBACK_MODAL_CSS = `
:host {
  font-size: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.4;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
button,
input,
textarea,
select {
  font: inherit;
}
.modal {
  position: fixed;
  inset: 0;
  overflow: auto;
  background: #fff;
  color: #1f2328;
  padding: 16px;
  font-size: 1em;
  line-height: 1.4;
  font-family: inherit;
}
`;

const loadModalCss = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ message: 'getModalCss' });
    if (response?.css) {
      return cssWithoutRem(response.css);
    }
    throw new Error('Empty modal CSS');
  } catch (error) {
    console.warn('Failed to load Format Link modal CSS:', error);
    return FALLBACK_MODAL_CSS;
  }
};

const applyHostStyles = host => {
  host.style.cssText = [
    'all: initial',
    'position: fixed !important',
    'display: block !important',
    'inset: 0 !important',
    'width: 100% !important',
    'height: 100% !important',
    'max-width: none !important',
    'max-height: none !important',
    'margin: 0 !important',
    'padding: 0 !important',
    'border: none !important',
    'background: transparent !important',
    'z-index: 2147483647 !important',
    'pointer-events: auto !important',
    'font-size: 16px !important',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important',
    'line-height: 1.4 !important',
  ].join('; ');
};

const createElement = (tagName, attributes = {}) => {
  const element = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') {
      element.className = value;
    } else if (name === 'textContent') {
      element.textContent = value;
    } else if (name === 'hidden') {
      element.hidden = value;
    } else {
      element.setAttribute(name, value);
    }
  }
  return element;
};

const buildModalDom = shadowRoot => {
  const modal = createElement('div', {
    className: 'modal format-link-ui',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Format Link',
  });

  const header = createElement('header', { className: 'modal-header' });
  const closeButton = createElement('button', {
    type: 'button',
    className: 'close-button',
    id: 'closeButton',
    textContent: 'Close',
  });
  header.appendChild(closeButton);

  const preview = createElement('div', { className: 'preview' });
  const previewHeader = createElement('div', { className: 'preview-header' });
  previewHeader.appendChild(createElement('label', {
    for: 'textToCopy',
    textContent: 'Link Text',
  }));
  previewHeader.appendChild(createElement('span', {
    id: 'copyResult',
    textContent: '✔ Copied',
  }));
  preview.appendChild(previewHeader);
  preview.appendChild(createElement('textarea', { id: 'textToCopy' }));
  preview.appendChild(createElement('button', {
    type: 'button',
    id: 'copyButton',
    textContent: 'Copy',
  }));
  preview.appendChild(createElement('button', {
    type: 'button',
    id: 'copyAllTabsButton',
    textContent: 'Copy all selected tabs',
    hidden: true,
  }));

  const formats = createElement('div', { className: 'formats' });
  formats.appendChild(createElement('div', {
    className: 'section-label',
    textContent: 'Switch Format',
  }));
  formats.appendChild(createElement('div', { id: 'formatGroup' }));

  const footer = createElement('footer', { className: 'popup-footer' });
  footer.appendChild(createElement('a', {
    href: '#',
    id: 'openOptionsLink',
    textContent: 'Options',
  }));

  modal.appendChild(header);
  modal.appendChild(preview);
  modal.appendChild(formats);
  modal.appendChild(footer);
  shadowRoot.appendChild(modal);
  return modal;
};

const lockBackgroundScroll = () => {
  const root = document.documentElement;
  const previousOverflow = root.style.overflow;
  root.style.overflow = 'hidden';
  return () => {
    root.style.overflow = previousOverflow;
  };
};

const createModalUi = (root, { autoFocus = false, onCopySuccess } = {}) => {
  const getElement = id => root.getElementById(id);

  const hideCopiedResult = () => {
    getElement('copyResult').classList.remove('is-visible');
  };

  const showCopiedResult = () => {
    getElement('copyResult').classList.add('is-visible');
  };

  const populateText = formattedText => {
    hideCopiedResult();
    const textElem = getElement('textToCopy');
    textElem.value = formattedText;
    if (autoFocus) {
      textElem.focus();
    }
  };

  const getSelectedFormatID = () => {
    for (let i = 1; ; ++i) {
      const radio = getElement('format' + i);
      if (!radio) {
        break;
      }
      if (radio.checked) {
        return i;
      }
    }
    return undefined;
  };

  const getOptions = async () => {
    const response = await chrome.runtime.sendMessage({ message: 'getOptions' });
    return response.options;
  };

  const copyLink = async formatID => {
    const response = await chrome.runtime.sendMessage({
      message: 'uiCopyLink',
      formatID,
    }).catch(error => {
      console.error('Error copying link:', error);
      populateText('Failed to get link');
    });
    if (response?.result !== undefined) {
      populateText(response.result);
      return response.ok === true;
    }
    return false;
  };

  const copyModifiedText = async (modifiedText, formatID) => {
    const response = await chrome.runtime.sendMessage({
      message: 'uiCopyModifiedText',
      modifiedText,
      formatID,
    }).catch(error => {
      console.error('Error copying modified text:', error);
    });
    if (response?.result !== undefined) {
      populateText(response.result);
      return response.ok === true;
    }
    return false;
  };

  const copyHighlightedTabs = async formatID => {
    const response = await chrome.runtime.sendMessage({
      message: 'uiCopyHighlightedTabs',
      formatID,
    }).catch(error => {
      console.error('Error copying modified text:', error);
    });
    if (response?.result !== undefined) {
      populateText(response.result);
      return response.ok === true;
    }
    return false;
  };

  const populateFormatGroup = options => {
    const group = getElement('formatGroup');
    while (group.hasChildNodes()) {
      group.removeChild(group.childNodes[0]);
    }
    for (let i = 1; i <= options.count; ++i) {
      const radioId = 'format' + i;
      const btn = createElement('input', {
        type: 'radio',
        name: 'fomrat',
        id: radioId,
        value: String(i),
      });
      if (i == options.defaultFormat) {
        btn.setAttribute('checked', 'checked');
        btn.checked = true;
      }
      btn.addEventListener('click', async event => {
        const result = await copyLink(event.target.value);
        if (result) {
          showCopiedResult();
        }
      });

      const label = createElement('label');
      label.appendChild(btn);
      label.appendChild(document.createTextNode(options['title' + i]));
      group.appendChild(label);
    }
  };

  const refresh = async () => {
    const options = await getOptions();
    if (!options) {
      return;
    }
    populateFormatGroup(options);
    const result = await copyLink(options.defaultFormat);
    if (result) {
      showCopiedResult();
    }
  };

  const copyAllTabsButton = getElement('copyAllTabsButton');
  copyAllTabsButton.addEventListener('click', async () => {
    const formatID = getSelectedFormatID();
    if (formatID) {
      const result = await copyHighlightedTabs(formatID);
      if (result) {
        showCopiedResult();
      }
    }
  });

  const copy = async () => {
    const formatID = getSelectedFormatID();
    if (formatID) {
      const result = await copyModifiedText(getElement('textToCopy').value, formatID);
      if (result) {
        onCopySuccess?.();
      }
    }
  };
  getElement('copyButton').addEventListener('click', copy);

  getElement('openOptionsLink').addEventListener('click', event => {
    event.preventDefault();
    chrome.runtime.sendMessage({ message: 'openOptionsPage' });
  });

  const textarea = getElement('textToCopy');
  textarea.addEventListener('input', hideCopiedResult);
  textarea.addEventListener('keydown', event => {
    if (event.isComposing || !event.ctrlKey || event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    copy();
  });

  const updateHighlightedTabsButton = async () => {
    const response = await chrome.runtime.sendMessage({
      message: 'uiGetHighlightedTabCount',
    }).catch(() => undefined);
    const count = response?.count ?? 0;
    if (count >= 2) {
      copyAllTabsButton.textContent = `Copy all selected tabs (${count})`;
      copyAllTabsButton.hidden = false;
    } else {
      copyAllTabsButton.hidden = true;
    }
  };

  return {
    refresh,
    updateHighlightedTabsButton,
  };
};

const openFormatLinkModal = async () => {
  const existing = document.getElementById(FORMAT_LINK_MODAL_HOST_ID);
  if (existing) {
    const controller = modalControllers.get(existing);
    if (controller) {
      await controller.refresh();
      return true;
    }
    existing.remove();
  }

  const css = await loadModalCss();
  const host = createElement('div', { id: FORMAT_LINK_MODAL_HOST_ID });
  applyHostStyles(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadowRoot.appendChild(style);
  buildModalDom(shadowRoot);

  const restoreScroll = lockBackgroundScroll();
  const close = () => {
    restoreScroll();
    host.remove();
    modalControllers.delete(host);
  };

  shadowRoot.getElementById('closeButton').addEventListener('click', close);

  const ui = createModalUi(shadowRoot, {
    autoFocus: false,
    onCopySuccess: close,
  });
  modalControllers.set(host, {
    refresh: ui.refresh,
    close,
  });

  (document.body ?? document.documentElement).appendChild(host);
  await ui.updateHighlightedTabsButton();
  await ui.refresh();
  return true;
};
