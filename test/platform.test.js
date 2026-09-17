'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const platformSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'platform.js'),
  'utf8'
);

const loadShouldUseInPageUI = navigator => {
  const context = { navigator };
  vm.createContext(context);
  return vm.runInContext(`${platformSource}\nshouldUseInPageUI;`, context);
};

test('userAgentData.mobile が true なら UA に関係なく true', () => {
  const shouldUseInPageUI = loadShouldUseInPageUI({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    userAgentData: { mobile: true },
  });

  assert.equal(shouldUseInPageUI(), true);
});

test('userAgentData.mobile が false なら UA に関係なく false', () => {
  const shouldUseInPageUI = loadShouldUseInPageUI({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36',
    userAgentData: { mobile: false },
  });

  assert.equal(shouldUseInPageUI(), false);
});

const uaCases = [
  {
    name: 'Android Chrome/Vivaldi UA',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Vivaldi/6.5',
    expected: true,
  },
  {
    name: 'iPhone Safari UA',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    expected: true,
  },
  {
    name: 'iPad UA',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    expected: true,
  },
  {
    name: 'Windows Chrome UA',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    expected: false,
  },
  {
    name: 'macOS Chrome UA',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    expected: false,
  },
  {
    name: 'Linux Chrome UA',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    expected: false,
  },
];

for (const { name, userAgent, expected } of uaCases) {
  test(`userAgentData 未定義なら ${name} は ${expected}`, () => {
    const shouldUseInPageUI = loadShouldUseInPageUI({ userAgent });
    assert.equal(shouldUseInPageUI(), expected);
  });
}
