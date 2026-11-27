const { app, BrowserWindow, protocol, session } = require('electron');
import { writeFile } from 'node:fs/promises';
const { registerOdProtocol } = require('../../apps/packaged/src/protocol.ts');

app.setPath('userData', process.argv[3]!);
app.on('window-all-closed', () => {});
const requests = [
  { name: 'redirect', path: process.argv[5]! },
  { name: 'redirectHttp', path: process.argv[6]! },
  { name: 'private', path: '/api/plugins/preview-authority-private/asset/private.txt' },
  { name: 'undeclared', path: '/api/plugins/example-open-design-homepage/asset/SKILL.md' },
  { name: 'bundled', path: '/api/plugins/example-open-design-homepage/asset/assets/model/hello.gltf' },
  { name: 'write', path: '/api/plugins/preview-authority-private/uninstall', method: 'POST' },
  { name: 'forged', path: '/api/plugins/preview-authority-private/asset/private.txt', headers: { 'X-OD-Protocol-Frame-Token': 'forged' } },
];
const expression = `(async () => {
  const results = {};
  for (const request of ${JSON.stringify(requests)}) {
    try {
      const response = await fetch(request.path.startsWith('http:') ? request.path : 'od://app' + request.path, {method: request.method || 'GET', headers: request.headers});
      results[request.name] = {status: response.status, body: await response.text()};
    } catch (error) { results[request.name] = {error: String(error)}; }
  }
  for (const [name, path] of [
    ['privateImage', '/api/plugins/preview-authority-private/asset/private.webp'],
    ['bundledImage', '/api/plugins/example-open-design-homepage/asset/assets/sticker_img/s_01.webp'],
  ]) {
    results[name] = await new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        try { resolve({loaded: true, width: image.naturalWidth, pixel: Array.from(context.getImageData(0,0,1,1).data)}); }
        catch (error) { resolve({loaded: true, error: String(error)}); }
      };
      image.onerror = () => resolve({loaded: false});
      image.src = 'od://app' + path;
    });
  }
  for (const [name, path] of [
    ['privateFont', '/api/plugins/preview-authority-private/asset/private.ttf'],
    ['bundledFont', '/api/plugins/example-open-design-homepage/asset/assets/fonts/TikTokSans.ttf'],
  ]) {
    try { await new FontFace(name, 'url("od://app' + path + '")').load(); results[name] = {loaded: true}; }
    catch (error) { results[name] = {loaded: false, error: String(error)}; }
  }
  return results;
})()`;

async function probe() {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.on('console-message', (_event: unknown, _level: unknown, message: string) => console.error(message));
  await window.loadURL('od://app/');
  const trusted = await window.webContents.executeJavaScript(expression.replace(JSON.stringify(requests), JSON.stringify(requests.filter(request => request.name === 'private'))));
  const opaque = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.sandbox = 'allow-scripts';
    const timeout = setTimeout(() => reject(new Error('opaque renderer did not report')), 30000);
    addEventListener('message', function receive(event) {
      if (event.source !== frame.contentWindow) return;
      removeEventListener('message', receive);
      clearTimeout(timeout);
      resolve({origin: event.origin, results: event.data});
    });
    frame.srcdoc = '<script>' + ${JSON.stringify(expression)} + '.then(result => parent.postMessage(result, "*"))<\\/script>';
    document.body.append(frame);
  })`);
  window.destroy();
  return {trusted, opaque};
}
async function main() {
  await app.whenReady();
  session.defaultSession.webRequest.onCompleted({urls: ["od://*/*"]}, (details: {url: string; statusCode: number; resourceType: string}) => { if (/\/(private\.(webp|ttf)|TikTokSans\.ttf|s_01\.webp)$/.test(details.url)) console.error(JSON.stringify({url: details.url, status: details.statusCode, resourceType: details.resourceType})); });
  registerOdProtocol(() => process.argv[2]!);
  session.defaultSession.webRequest.onSendHeaders({urls: ["od://*/*"]}, (details: {url: string; requestHeaders: Record<string,string>; frame?: {origin: string}}) => { if (/\/(private\.(webp|ttf)|TikTokSans\.ttf|s_01\.webp)$/.test(details.url)) console.error(JSON.stringify({url: details.url, origin: details.requestHeaders.Origin, frameOrigin: details.frame?.origin})); });
  const first = await probe();
  const second = await probe();
  protocol.unhandle('od');
  registerOdProtocol(() => process.argv[2]!);
  const reregistered = await probe();
  await writeFile(process.argv[4]!, JSON.stringify({ electron: process.versions.electron, ...first, second, reregistered }));
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
