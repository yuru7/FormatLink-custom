'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8090;
const srcDirectory = path.join(__dirname, '..', 'src');

const cssWithoutRem = css => css.replace(
  /(-?[\d.]+)rem\b/g,
  (_, value) => `${Number.parseFloat(value) * 16}px`
);

const readModalCss = () => {
  const uiCss = fs.readFileSync(path.join(srcDirectory, 'ui.css'), 'utf8');
  const modalCss = fs.readFileSync(path.join(srcDirectory, 'mobile-modal.css'), 'utf8');
  return cssWithoutRem(`${uiCss}\n${modalCss}`).replace(/:host\b/g, ':root');
};

const buildPreviewPage = () => {
  const template = fs.readFileSync(
    path.join(__dirname, 'modal-preview.html'),
    'utf8'
  );
  const [before, after] = template.split('__MODAL_CSS__');
  return `${before}${readModalCss()}${after ?? ''}`;
};

const getPathname = request => {
  try {
    return new URL(request.url, 'http://localhost').pathname;
  } catch {
    return null;
  }
};

const sendPage = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body);
};

const createModalPreviewServer = ({
  host = HOST,
  port = DEFAULT_PORT,
} = {}) => {
  const server = http.createServer((request, response) => {
    const pathname = getPathname(request);
    if (pathname !== '/') {
      sendPage(response, 404, 'Not found');
      return;
    }
    sendPage(response, 200, buildPreviewPage());
  });

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        const onError = error => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
};

if (require.main === module) {
  const preview = createModalPreviewServer({
    host: HOST,
    port: Number(process.env.PORT || DEFAULT_PORT),
  });

  const shutdown = async () => {
    await preview.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  preview.listen().then(address => {
    console.log(`Mobile modal preview: http://${HOST}:${address.port}/`);
    console.log('Reload the page after CSS or preview HTML changes. Stop with Ctrl-C.');
  }).catch(error => {
    console.error('Failed to start modal preview server:', error);
    process.exitCode = 1;
  });
}

module.exports = { createModalPreviewServer };
