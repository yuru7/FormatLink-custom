'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const HOST = '127.0.0.1';
const DEFAULT_MAIN_PORT = 8080;
const DEFAULT_FRAME_PORT = 8081;
const manualTestDirectory = __dirname;

const readPage = filename => fs.readFileSync(
  path.join(manualTestDirectory, filename),
  'utf8'
);

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

const createPageServer = getPage => http.createServer((request, response) => {
  const pathname = getPathname(request);
  const page = pathname && getPage(pathname);
  if (page === undefined) {
    sendPage(response, 404, 'Not found');
    return;
  }
  sendPage(response, 200, page);
});

const listen = (server, host, port) => new Promise((resolve, reject) => {
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

const close = server => new Promise((resolve, reject) => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close(error => error ? reject(error) : resolve());
});

const createManualTestServers = ({
  host = HOST,
  mainPort = DEFAULT_MAIN_PORT,
  framePort = DEFAULT_FRAME_PORT,
} = {}) => {
  let frameAddress;
  const framePage = readPage('frame.html');
  const mainServer = createPageServer(pathname => {
    if (pathname === '/') {
      const port = frameAddress?.port || framePort;
      const frameOrigin = `http://${host}:${port}`;
      return readPage('index.html').replaceAll('__FRAME_ORIGIN__', frameOrigin);
    }
    if (pathname === '/frame.html') {
      return framePage;
    }
    return undefined;
  });
  const frameServer = createPageServer(pathname => {
    if (pathname === '/frame.html') {
      return framePage;
    }
    return undefined;
  });

  return {
    mainServer,
    frameServer,
    async listen() {
      const addresses = await Promise.all([
        listen(mainServer, host, mainPort),
        listen(frameServer, host, framePort),
      ]);
      frameAddress = addresses[1];
      return {
        main: addresses[0],
        frame: addresses[1],
      };
    },
    async close() {
      await Promise.all([close(mainServer), close(frameServer)]);
    },
  };
};

if (require.main === module) {
  const servers = createManualTestServers({
    host: HOST,
    mainPort: Number(process.env.PORT || DEFAULT_MAIN_PORT),
    framePort: Number(process.env.FRAME_PORT || DEFAULT_FRAME_PORT),
  });

  const shutdown = async () => {
    await servers.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  servers.listen().then(addresses => {
    console.log(`Manual test page: http://${HOST}:${addresses.main.port}/`);
    console.log(`Stop with Ctrl-C. iframe server: http://${HOST}:${addresses.frame.port}/`);
  }).catch(error => {
    console.error('Failed to start manual test server:', error);
    process.exitCode = 1;
  });
}

module.exports = { createManualTestServers };
