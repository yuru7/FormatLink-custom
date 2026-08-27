# Chrome Web Store 公開手順（ビルド〜提出）

Format Link Custom を Chrome Web Store へ公開・更新するための手順です。
ビルド（ZIP パッケージの生成）からアップロード、審査提出までを扱います。

## 前提条件

- Google アカウントによる [Chrome Web Store デベロッパー登録](https://developer.chrome.com/docs/webstore/register/) が済んでいること
  - Developer Dashboard で利用規約への同意と一回限りのデベロッパー登録料の支払いが必要です（料金は変動するため公式ページで確認してください）
  - アカウントの公開者名・連絡先メールの設定とメール認証も済ませておきます
- Google アカウントで 2 段階認証を有効にしていること（公開・更新の操作で必要です）
- Node.js 18 以上
- `zip` コマンドがインストールされていること
  - Debian/Ubuntu/WSL: `sudo apt install zip`
  - macOS: 標準搭載

## ビルドの仕組み

| コマンド | 内容 |
| --- | --- |
| `npm run build` | `npm test`（ユニットテスト）→ `npm run package` の順に実行 |
| `npm run package` | `scripts/package.mjs` を実行し、提出用 ZIP を生成 |
| `npm test` | ユニットテストのみ実行 |

`npm run package` の処理内容:

1. `src/manifest.json` を読み、`version` を検証（1〜4 セグメントの数字、各セグメント 0〜65535）
2. `dist/` に `format-link-custom-<version>.zip` を生成
   - `src/` の中身を ZIP 化するため、**`manifest.json` が ZIP のルート**に置かれます
   - `src/` ディレクトリ自体や `test/`・`manual-test/` は含まれません
3. 同名の ZIP が既に存在する場合は上書きします（`dist/` は git 管理外）

成果物: `dist/format-link-custom-<version>.zip`

## 初回公開の手順

### 1. バージョンの確認

`src/manifest.json` の `version` を確認します。再提出時は前回アップロードした値より大きくしてください。

### 2. パッケージの作成

```sh
npm run build
```

テストが全て成功し、`dist/format-link-custom-<version>.zip` が生成されれば OK です。

### 3. 成果物の確認

```sh
unzip -l dist/format-link-custom-<version>.zip
```

以下の点を確認してください。

- `manifest.json` が ZIP のルートにある
- `src/` ディレクトリ自体、`test/`、`manual-test/` が含まれていない
- アイコン（`icons/icon16.png` など）や `popup.html` など manifest が参照するファイルが揃っている

### 4. パッケージでの動作確認

配布物そのものを確認するため、ZIP を展開して `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」で読み込み、動作を確認します（ポップアップ、キーボードショートカット、右クリックメニュー、複数タブの一括コピー）。手動テストの方法は README の「Manual testing in Chrome」を参照してください。

### 5. ダッシュボードへのアップロード

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) を開く
2. 「Add new item」→「Choose file」で作成した ZIP を選択し、アップロードする

### 6. ストア掲載情報の入力（Store listing）

- ストア名、説明文、アイコン、スクリーンショット（1280×800 または 640×400）、カテゴリなどを入力します
- 長い説明は `docs/chrome-web-store-description-ja.txt`（日本語）と `docs/chrome-web-store-description-en.txt`（英語）を使います。README や元拡張の説明は貼らないでください
- 短い説明は `src/manifest.json` の `description` です。既存の「Format Link」と同じ文言にはしないでください
- 掲載情報は実際の拡張機能の動作と一致した正確な内容にしてください
- スクリーンショットは差分が分かるものを先頭にしてください。特に、タブを複数選んだときにポップアップへ「Copy all selected tabs」が出る画面
- アップロード後に manifest 由来のメタデータ（`name`・`version`・`description` など）はダッシュボードから変更できません。修正が必要な場合は新しい ZIP とバージョンで再提出します

### 7. プライバシー申告（Privacy practices）

- 拡張機能の単一目的、権限、ユーザーデータの扱いを申告します
- 単一目的の記入例: 「選択したタブのタイトルと URL を、指定した書式でクリップボードへコピーする。複数タブの一括取得に対応する。」
- この拡張機能は設定を `chrome.storage` にローカル保存するのみで、外部へのデータ送信はありません。回答はコード（`src/background.js`・`src/content.js`・`src/options.js` など）を確認して正確に申告してください
- 申告内容と実際の動作、ストア掲載情報が食い違わないようにします

### 8. 配布設定（Distribution）

公開範囲を選択します。

- **Public**: ストアで誰でも検索・インストール可能
- **Unlisted**: 検索には出ないが、URL を知っている人はインストール可能
- **Private**: 指定ユーザーまたは Google グループのみ

### 9. 審査への提出

「Submit for Review」を押して提出します。このとき審査通過後に自動公開するか、**公開保留（deferred publishing）** にして後で手動公開するかを選択できます（保留できる期間には上限があります）。

### 10. 審査状況の確認

審査状況は Dashboard で確認できます（Pending / Published / Rejected / Taken Down）。審査中はストアに表示されません。審査日数は変動するため、長く Pending が続く場合は公式ドキュメントを参照してください。

## 更新公開（バージョンアップ）の手順

1. `src/manifest.json` の `version` を**前回提出時より大きい値**に変更する
   ```json
   {
     "name": "Format Link Custom",
     "version": "1.1.0",
     ...
   }
   ```
2. `npm run build` で新しい ZIP を作成し、初回公開の手順 3・4 と同様に中身と動作を確認する
3. Dashboard で該当アイテムを開き、「Package」→「Upload New Package」から新しい ZIP をアップロードする
4. 必要に応じて、前回より大きいバージョンで提出されたことを確認して「Submit for Review」を押す
   - ストア掲載情報を変更する場合は、提出前に Store listing タブを更新しておきます

## 注意事項

- **バージョンは必ず前回より大きくする**: 同一または小さいバージョンではアップロードできません
- **提出物は配布用 ZIP そのもので確認する**: 開発用の `src/` 読み込みだけではなく、アップロードする ZIP を展開した状態でも動作確認してください
- **申告と実態を一致させる**: Privacy practices の回答はコードの実装と一致させる必要があります。不明な点は「ユーザーデータを収集・送信しない」と断定せず、コードを確認してから回答してください
- **掲載文でスパム判定されやすいもの**: 既存拡張と同じ短い説明、フォークである旨の強調、テンプレート構文の掲載、同一語の繰り返し（目安は 5 回未満）
- **審査時の動作**: Chrome ウェブストアのページ上ではコンテンツスクリプトが動かない。審査コメントが書ける場合は、通常のウェブサイトで試してほしい旨を添える
- デベロッパー登録料・審査日数・審査ポリシーなどは変更されるため、最新情報は公式ドキュメントを確認してください

## 公式ドキュメント

- [デベロッパー登録](https://developer.chrome.com/docs/webstore/register/)
- [提出物の準備（ZIP の要件）](https://developer.chrome.com/docs/webstore/prepare)
- [公開手順（アップロード・提出）](https://developer.chrome.com/docs/webstore/publish)
- [更新手順](https://developer.chrome.com/docs/webstore/update/)
- [プライバシー申告の入力](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [審査状況の確認](https://developer.chrome.com/docs/webstore/check-review)
- [配布設定（Public / Unlisted / Private）](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)