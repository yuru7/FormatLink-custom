// Chrome Web Store に提出する ZIP パッケージを src/ から生成するスクリプト。
// 使い方: node scripts/package.mjs （npm run package）
//
// - src/manifest.json の version を検証する
// - src/ の中身を dist/format-link-custom-<version>.zip にまとめる
//   （manifest.json が ZIP のルートに来るよう、src/ ディレクトリ自体は含めない）
'use strict';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

// 1. manifest.json を読み、version を検証する
const manifestPath = join(srcDir, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`エラー: ${manifestPath} を解析できません: ${error.message}`);
  process.exit(1);
}

const version = manifest.version;
const segments = typeof version === 'string' ? version.split('.') : [];
const versionValid =
  segments.length >= 1 &&
  segments.length <= 4 &&
  segments.every(seg => /^\d{1,5}$/.test(seg) && Number(seg) <= 65535);
if (!versionValid) {
  console.error(
    `エラー: manifest.json の version "${version}" が不正です。` +
      'Chrome Web Store では 1〜4 セグメントの数字（例: 1.0.0）が必要です。'
  );
  process.exit(1);
}

// 2. 出力先 dist/ を準備し、同名の成果物があれば削除する
const zipPath = join(distDir, `format-link-custom-${version}.zip`);
mkdirSync(distDir, { recursive: true });
if (existsSync(zipPath)) {
  rmSync(zipPath);
  console.log(`既存の成果物を削除しました: ${zipPath}`);
}

// 3. zip コマンドの存在を確認する（未導入環境では明確なエラーを出す）
try {
  execFileSync('zip', ['-h'], { stdio: 'ignore' });
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(
      'エラー: zip コマンドが見つかりません。' +
        '（Debian/Ubuntu/WSL: sudo apt install zip、macOS: 標準搭載）'
    );
    process.exit(1);
  }
  throw error;
}

// 4. src/ の全ファイルを ZIP にまとめる（-X で余計なファイル属性を除外）
execFileSync('zip', ['-X', '-r', zipPath, '.'], { cwd: srcDir, stdio: 'inherit' });

const size = statSync(zipPath).size;
console.log(`作成しました: ${zipPath} (${(size / 1024).toFixed(1)} KiB)`);