'use strict';

const getOptions = async isDefault => {
  const message = isDefault ? "getDefaultOptions" : "getOptions"
  const response = await chrome.runtime.sendMessage({ message });
  return response.options;
}

let defaultFormatID;
let maxCount;

const getFormItemCount = () => {
  let count = 0;
  while (count < maxCount) {
    const nextIndex = count + 1;
    const title = document.getElementById('title' + nextIndex).value;
    const format = document.getElementById('format' + nextIndex).value;
    if (title === '' || format === '') {
      break;
    }
    ++count;
  }
  return count;
};

const updateMoveButtons = () => {
  const itemCount = getFormItemCount();
  document.querySelectorAll('.moveButton').forEach(button => {
    const index = Number(button.dataset.index);
    const offset = button.dataset.direction === 'up' ? -1 : 1;
    button.disabled = index > itemCount || index + offset < 1 || index + offset > itemCount;
  });
};

const moveOption = (index, direction) => {
  const offset = direction === 'up' ? -1 : 1;
  const targetIndex = index + offset;
  const itemCount = getFormItemCount();
  if (index < 1 || index > itemCount || targetIndex < 1 || targetIndex > itemCount) {
    return;
  }

  for (const field of ['title', 'format', 'html']) {
    const current = document.getElementById(field + index);
    const target = document.getElementById(field + targetIndex);
    if (field === 'html') {
      [current.checked, target.checked] = [target.checked, current.checked];
    } else {
      [current.value, target.value] = [target.value, current.value];
    }
  }

  if (defaultFormatID === index) {
    defaultFormatID = targetIndex;
  } else if (defaultFormatID === targetIndex) {
    defaultFormatID = index;
  }
  updateMoveButtons();
};

const restoreForm = options => {
  maxCount = options.maxCount;
  defaultFormatID = options.defaultFormat;
  for (let i = 1; i <= maxCount; ++i) {
    document.getElementById('title' + i).value = options['title' + i] || '';
    document.getElementById('format' + i).value = options['format' + i] || '';
    document.getElementById('html' + i).checked = !!options['html' + i];
  }
  document.getElementById('createSubmenusCheckbox').checked = options['createSubmenus'];
  updateMoveButtons();
};

const restoreOptions = async () => {
  restoreForm(await getOptions());
};

const saveOptions = async defaultFormatIDToSave => {
  let options = await getOptions();
  try {
    if (defaultFormatIDToSave !== undefined) {
      defaultFormatID = defaultFormatIDToSave;
    }
    options.defaultFormat = defaultFormatID;
    for (let i = 1; i <= options.maxCount; ++i) {
      options['title' + i] = document.getElementById('title' + i).value;
      options['format' + i] = document.getElementById('format' + i).value;
      options['html' + i] = document.getElementById('html' + i).checked ? 1 : 0;
    }
    options['createSubmenus'] = document.getElementById('createSubmenusCheckbox').checked;
  } catch (err) {
    console.error("failed to get options", err);
  }
  try {
    await chrome.storage.sync.set(options);
  } catch (err) {
    console.error("failed to save options", err);
  }
  try {
    await chrome.runtime.sendMessage({
      message: 'createContextMenus',
      options,
    });
  } catch (err) {
    console.error("failed to update context menu", err);
  }
}

const restoreDefaults = async () => {
  const options = await getOptions(true);
  restoreForm(options);
  await saveOptions();
}

document.addEventListener('DOMContentLoaded', async () => {
  await restoreOptions();
  document.getElementById('saveButton').addEventListener('click', async e => {
    await saveOptions();
  });
  document.getElementById('restoreDefaultsButton').addEventListener('click', async e => {
    await restoreDefaults();
  });
  document.querySelectorAll('.moveButton').forEach(button => {
    button.addEventListener('click', () => {
      moveOption(Number(button.dataset.index), button.dataset.direction);
    });
  });
  for (let i = 1; i <= maxCount; ++i) {
    document.getElementById('title' + i).addEventListener('input', updateMoveButtons);
    document.getElementById('format' + i).addEventListener('input', updateMoveButtons);
  }
});
