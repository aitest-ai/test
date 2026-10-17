// 把 `vite build --mode single` 的輸出合成單一 HTML：dist-single/dongxin.html → dongxin_single.html
import fs from 'fs';
import path from 'path';
const dir = new URL('../dist-single/', import.meta.url).pathname;
let html = fs.readFileSync(path.join(dir, 'dongxin.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(dir, href), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, h) => `<style>${read(h)}</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, h) => `<script type="module">${read(h).replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('仍有未內嵌的資源');
const out = new URL('../dongxin_single.html', import.meta.url).pathname;
fs.writeFileSync(out, html);
console.log(path.basename(out), Math.round(html.length / 1024), 'KB');
