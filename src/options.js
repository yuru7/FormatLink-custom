'use strict';

const getOptions = async isDefault => {
  const message = isDefault ? "getDefaultOptions" : "getOptions"
  const response = await chrome.runtime.sendMessage({ message });
  return response.options;
}

let defaultFormatID;
let maxCount;
let savedFormValues;

// プレビュー表示の既定サンプル値（例と分かるよう Example Domain を使用・選択なし相当）。
// カードごとに独立して持ち、Preview 右上の鉛筆ボタンから編集できる（保存はされない）
const DEFAULT_SAMPLE_VARS = {
  url: 'https://example.com',
  pageUrl: 'https://example.com',
  title: 'Page Title',
  text: 'Page Title',
};

const sampleVarsByIndex = new Map();
const getSampleVars = index => {
  if (!sampleVarsByIndex.has(index)) {
    sampleVarsByIndex.set(index, { ...DEFAULT_SAMPLE_VARS });
  }
  return sampleVarsByIndex.get(index);
};

let sampleEditIndex;

const openSampleEditor = index => {
  sampleEditIndex = index;
  const vars = getSampleVars(index);
  document.getElementById('sampleTitle').value = vars.title;
  document.getElementById('sampleUrl').value = vars.url;
  document.getElementById('sampleDialog').showModal();
};

const closeSampleEditor = () => {
  document.getElementById('sampleDialog').close();
};

const applySampleEdits = () => {
  const vars = getSampleVars(sampleEditIndex);
  vars.title = vars.text = document.getElementById('sampleTitle').value;
  vars.url = vars.pageUrl = document.getElementById('sampleUrl').value;
  closeSampleEditor();
  updatePreview(sampleEditIndex);
};

const updatePreview = index => {
  const output = document.getElementById('preview' + index);
  try {
    output.textContent = renderFormatTemplate(
      document.getElementById('format' + index).value,
      { ...getSampleVars(index), newline: '\n' }
    );
    output.classList.remove('invalidTemplate');
  } catch (err) {
    output.textContent = err.message;
    output.classList.add('invalidTemplate');
  }
};

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

const updateDefaultFormatControls = () => {
  const itemCount = getFormItemCount();
  for (let i = 1; i <= maxCount; ++i) {
    const radio = document.getElementById('defaultFormat' + i);
    radio.checked = defaultFormatID === i;
    radio.disabled = i > itemCount;
  }
};

const moveOption = (index, direction) => {
  const offset = direction === 'up' ? -1 : 1;
  const targetIndex = index + offset;
  const itemCount = getFormItemCount();
  if (index < 1 || index > itemCount || targetIndex < 1 || targetIndex > itemCount) {
    return;
  }

  for (const field of ['title', 'format', 'html', 'selectionNewlines']) {
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
  updateDefaultFormatControls();
  updateUnsavedChangeButtons();
  updatePreview(index);
  updatePreview(targetIndex);
};

const resizeFormatField = textarea => {
  textarea.style.height = 'auto';
  const borders = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = (textarea.scrollHeight + borders) + 'px';
};

const applyFormatValue = index => {
  updateMoveButtons();
  updateDefaultFormatControls();
  updateUnsavedChangeButtons();
  resizeFormatField(document.getElementById('format' + index));
  updatePreview(index);
};

const insertVariable = (index, variable) => {
  const textarea = document.getElementById('format' + index);
  textarea.setRangeText(variable, textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.focus();
  applyFormatValue(index);
};

const collectFormValues = () => {
  const values = { defaultFormat: defaultFormatID };
  for (let i = 1; i <= maxCount; ++i) {
    values['title' + i] = document.getElementById('title' + i).value;
    values['format' + i] = document.getElementById('format' + i).value;
    values['selectionNewlines' + i] = document.getElementById('selectionNewlines' + i).value;
    values['html' + i] = document.getElementById('html' + i).checked;
  }
  return values;
};

const updateUnsavedChangeButtons = () => {
  const current = collectFormValues();
  const hasChanges = Object.keys(current).some(key =>
    current[key] !== savedFormValues[key]
  );
  // 未保存の変更がないときは Save も Cancel も無効（Cancel は未保存の変更を破棄する役割）
  document.getElementById('saveButton').disabled = !hasChanges;
  document.getElementById('cancelButton').disabled = !hasChanges;
};

const restoreForm = options => {
  maxCount = options.maxCount;
  defaultFormatID = options.defaultFormat;
  for (let i = 1; i <= maxCount; ++i) {
    document.getElementById('title' + i).value = options['title' + i] || '';
    document.getElementById('format' + i).value = options['format' + i] || '';
    document.getElementById('selectionNewlines' + i).value =
      options['selectionNewlines' + i] || 'spaces';
    document.getElementById('html' + i).checked = !!options['html' + i];
  }
  updateMoveButtons();
  updateDefaultFormatControls();
  for (let i = 1; i <= maxCount; ++i) {
    resizeFormatField(document.getElementById('format' + i));
    updatePreview(i);
  }
  savedFormValues = collectFormValues();
  updateUnsavedChangeButtons();
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
    const itemCount = getFormItemCount();
    if (defaultFormatID > itemCount) {
      defaultFormatID = itemCount || 1;
    }
    options.defaultFormat = defaultFormatID;
    for (let i = 1; i <= options.maxCount; ++i) {
      options['title' + i] = document.getElementById('title' + i).value;
      options['format' + i] = document.getElementById('format' + i).value;
      options['selectionNewlines' + i] =
        document.getElementById('selectionNewlines' + i).value;
      options['html' + i] = document.getElementById('html' + i).checked ? 1 : 0;
    }
  } catch (err) {
    console.error("failed to get options", err);
  }
  try {
    await chrome.storage.sync.set(options);
    savedFormValues = collectFormValues();
    updateUnsavedChangeButtons();
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
  document.getElementById('cancelButton').addEventListener('click', async () => {
    await restoreOptions();
  });
  document.getElementById('restoreDefaultsButton').addEventListener('click', async e => {
    await restoreDefaults();
  });
  document.querySelectorAll('.moveButton').forEach(button => {
    button.addEventListener('click', () => {
      moveOption(Number(button.dataset.index), button.dataset.direction);
    });
  });
  document.getElementById('formatList').addEventListener('click', event => {
    const chip = event.target.closest('.variableChip');
    if (chip) {
      insertVariable(Number(chip.dataset.index), '{{' + chip.dataset.variable + '}}');
      return;
    }
    const editButton = event.target.closest('.editSampleButton');
    if (editButton) {
      openSampleEditor(Number(editButton.dataset.index));
      return;
    }
    if (event.target.closest('.helpLink')) {
      document.getElementById('helpDialog').showModal();
    }
  });
  document.getElementById('helpCloseButton').addEventListener('click', () => {
    document.getElementById('helpDialog').close();
  });
  document.getElementById('sampleCancelButton').addEventListener('click', closeSampleEditor);
  document.getElementById('sampleSaveButton').addEventListener('click', applySampleEdits);
  const handleSampleEnterKey = event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applySampleEdits();
  };
  document.getElementById('sampleTitle').addEventListener('keydown', handleSampleEnterKey);
  document.getElementById('sampleUrl').addEventListener('keydown', handleSampleEnterKey);
  for (let i = 1; i <= maxCount; ++i) {
    document.getElementById('defaultFormat' + i).addEventListener('change', event => {
      defaultFormatID = Number(event.target.value);
      updateDefaultFormatControls();
      updateUnsavedChangeButtons();
    });
    document.getElementById('title' + i).addEventListener('input', () => {
      updateMoveButtons();
      updateDefaultFormatControls();
      updateUnsavedChangeButtons();
    });
    document.getElementById('format' + i).addEventListener('input', () => {
      applyFormatValue(i);
    });
    document.getElementById('selectionNewlines' + i).addEventListener('change', () => {
      updateUnsavedChangeButtons();
    });
    document.getElementById('html' + i).addEventListener('change', () => {
      updateUnsavedChangeButtons();
    });
  }
});
