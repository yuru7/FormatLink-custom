'use strict';

// FormatLink のテンプレート文字列({{title}}, {{url}}, {{pageUrl}}, {{text}} と
// .s("検索","置換") 置換チェーン)を展開する。
// content script と options ページの双方から使う非モジュールスクリプト。

globalThis.renderFormatTemplate = (format, { url, pageUrl, title, text, newline }) => {
  let result = '';
  let i = 0, len = format.length;

  const parseLiteral = str => {
    if (format.substr(i, str.length) === str) {
      i += str.length;
      return str;
    } else {
      return null;
    }
  };

  const parseString = () => {
    let str = '';
    if (parseLiteral('"')) {
      while (i < len) {
        if (parseLiteral('\\')) {
          if (i < len) {
            str += format.substr(i++, 1);
          } else {
            throw new Error('parse error expected "');
          }
        } else if (parseLiteral('"')) {
          return str;
        } else {
          if (i < len) {
            str += format.substr(i++, 1);
          } else {
            throw new Error('parse error expected "');
          }
        }
      }
    } else {
      return null;
    }
  };

  const processVar = value => {
    let work = value;
    while (i < len) {
      if (parseLiteral('.s(')) {
        let arg1 = parseString();
        if (arg1 != null && parseLiteral(',')) {
          let arg2 = parseString();
          if (arg2 != null && parseLiteral(')')) {
            let regex = new RegExp(arg1, 'g');
            work = work.replace(regex, arg2);
          } else {
            throw new Error('parse error');
          }
        } else {
          throw new Error('parse error');
        }
      } else if (parseLiteral('}}')) {
        result += work;
        return;
      } else {
        throw new Error('parse error');
      }
    }
  };

  while (i < len) {
    if (parseLiteral('\\')) {
      if (parseLiteral('n')) {
        result += newline;
      } else if (parseLiteral('t')) {
        result += "\t";
      } else {
        result += format.substr(i++, 1);
      }
    } else if (parseLiteral('{{')) {
      if (parseLiteral('title')) {
        processVar(title);
      } else if (parseLiteral('url')) {
        processVar(url);
      } else if (parseLiteral('pageUrl')) {
        processVar(pageUrl);
      } else if (parseLiteral('text')) {
        processVar(text);
      }
    } else {
      result += format.substr(i++, 1);
    }
  }
  return result;
};
