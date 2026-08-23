# Format Link Custom

This project is a fork of [hnakamur/FormatLink-Chrome](https://github.com/hnakamur/FormatLink-Chrome). Thanks to the original author, hnakamur.

## Why do I need it?
To format the link of the active tab instantly to use in Markdown, reST, HTML, Text, Textile or other formats.

## How to use
You can use keyboard shortcuts, context menus, or the toolbar button of Format Link Custom
to copy a link in the specified format. Before doing that, you can optionally select some text 
which may or may not contain a link.

### keyboard shortcut
The keyboard shortcut for "Copy a link in the default format" is shortcut for clicking the
toolbar button. The link is copied in the default format and the popup is shown under
the toolbar button.

Also there are shortcuts for copying in the link in the corresponding format regardless of
the default format.

You can change shortcuts at chrome://extensions/shortcuts

### context menu
Open the context menu and select the "as XXX" menu item for the format you want.
One menu item is created for each format configured on the [options page](#flexible-settings).

### toolbar button
When you press the toolbar button of "Format Link Custom", the link is copied in the default format,
the popup page becomes open, and the formatted text is shown in the text area.

If you want to copy the link in different format, you can press one of the radio buttons.

If you want to change the default format, you can select the "Default" radio button on the options page and save the changes.

### multiple tabs
Select multiple tabs in the tab strip (Ctrl/Cmd-click or Shift-click) and open the popup
from the toolbar button. A "Copy all selected tabs (N)" button appears below the Copy
button. Pressing it formats every selected tab with its own URL and title, joins the
results with line breaks, and copies the combined text to the clipboard at once.

In this mode, the value of `{{text}}` is always the tab title, and `{{url}}` the tab URL.
Selected text on the page and links are ignored.
If a selected tab cannot be formatted (e.g. a `chrome://` page), it is skipped with a
warning logged. If the whole selection fails, "Failed to get links" is shown instead.

## Flexible settings
You can modify formats in [Tools] -> [Extensions] -> Clik "Options" link in "Format Link Custom" Extension.
In format settings, you can use the mini template language.

* {{variable}}
    * variable = title / url / text
    * The value of variable `title` is the HTML page title.
    * The value of variable `text` is the selected text if some text is selected,
      the link text if you open the context menu over a link (see KNOWN LIMITATION below for link text),
      or the page URL if no text is selected and you open the context menu not over a link.
    * The value of the variable `url` is the link if you open the context menu over a link,
      the first link if selection contains a link, or the HTML page URL otherwise.
    * No spaces are allowed between variable name and braces.
* {{variable.s("foo","bar")}}
    * Which means `variable.replace(new RegExp("foo", 'g'), "bar")`
    * You can use escape character \ in strings.
    * You must escape the first argument for string and regexp.
      For example, `.s("\\[","\\[")` means replacing `\[` with `\\[`
    * You can chain multiple .s("foo","bar")
* You can use the escape character \ in strings. For example, you need to escape `\` with `\` like `\\`,
  and also you need to escape `{` with `\` like `\{`. See the LaTeX example below.
* Other characters are treated as literal strings.

Here are examples:

* Markdown

```
[{{text.s("\\[","\\[").s("\\]","\\]")}}]({{url.s("\\)","%29")}})
```

* reST

```
{{text}} <{{url}}>`_
```

* HTML

```
<a href="{{url.s("\"","&quot;")}}">{{text.s("<","&lt;")}}</a>
```

* Text

```
{{text}}\n{{url}}
```

* Redmine Texitile

```
"{{title.s("\"","&quot;").s("\\[","&#91;")}}":{{url}}
```

* LaTeX

```
\\href\{{{url}}\}\{{{text}}\}
```

## Permissions required by this extension

* To use this extension, the following two permissions are required:
  * "Read and change all your data on the websites you visit"
    * This permission is needed for this extension to run the ["content script"](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts?hl=en) into the content of pages you visit in order to read the page title, the selected text, the page URL, or the link URL. The extension does not change page content; Chrome does not offer a read-only version of this permission, so the warning includes "change".
  * "Modify data you copy and paste"
    * This permission is needed to copy a URL and a text to the clipboard.

For technical details, see the following pages:

* [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions?hl=en)
  * ["content_scripts.matches"](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=en)
    * This extension uses `"<all_urls>"`.
* [Permissions](https://developer.chrome.com/docs/extensions/reference/permissions-list?hl=en)
  * This extension requires the following permissions:
    * "activeTab"
    * "clipboardWrite"
    * "contextMenus"
    * "storage"

## License

MIT License.

## KNOWN LIMITATIONS

* Due to security reason, you cannot copy the URL on some pages like the Chrome Extension Gallary.
* Chrome allow each extension to have at most 4 keyboard shortcuts. One shortcut is used for copying a link with the default format, and the rest of three are used for copying a link with the corresponding format 1 to format 3. So format 4 to format 9 does not have keyboard shortcut.

## Credits

### Icon

The extension icon (`src/icons/`) is based on the ["Link Ui" icon](https://www.svgrepo.com/svg/286903/link-ui) from [SVG Repo](https://www.svgrepo.com/), licensed under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain, no attribution required).

## Running tests

Requires Node.js 18 or later. Run:

```sh
npm test
```

## Manual testing in Chrome

You can start a local test page with no extra dependencies.

1. Enable Developer mode at `chrome://extensions`.
2. Click "Load unpacked" and select the `src/` directory of this repository.
3. Start the test server:

   ```sh
   npm run manual-test
   ```

4. Open `http://127.0.0.1:8080/` in Chrome.

The test page covers three cases: no iframe, a same-origin iframe, and a cross-origin iframe. Press `Ctrl-C` in the terminal to stop the server when you are done.

If the default ports are already in use, you can change them:

```sh
PORT=18080 FRAME_PORT=18081 npm run manual-test
```

## Building a package for the Chrome Web Store

Run `npm run build` to run the tests and create a ZIP package in `dist/`:

```sh
npm run build
# dist/format-link-custom-<version>.zip
```

See [docs/chrome-web-store-release.md](docs/chrome-web-store-release.md) (in Japanese)
for the full build and publishing procedure.

## Project structure

```
├── src/            # Extension source (load this directory as an unpacked extension)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html / popup.js / popup.css
│   ├── options.html / options.js / options.css
│   └── icons/
├── test/           # Unit tests (node --test)
├── manual-test/    # Local test page server for manual testing
├── scripts/        # Build scripts (ZIP packaging for the Chrome Web Store)
├── docs/           # Release procedure (see chrome-web-store-release.md)
├── package.json
└── README.md
```
