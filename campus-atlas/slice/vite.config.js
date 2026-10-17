// Vite：三個入口（東新版 dongxin.html、示意切片 index.html、資產管線檢視頁 glb-viewer.html），相對路徑輸出，可放任何靜態主機或子目錄。
// `vite build --mode single`：只建東新版、所有 JS / 圖片內嵌，再由 scripts/singlefile.mjs 合成單一 HTML（離線／Artifact 用）。
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',            // 近兩年的 Chrome / Edge / Safari 皆支援
      chunkSizeWarningLimit: single ? 4000 : 900,  // three 本體約 700 KB（未壓縮）
      assetsInlineLimit: single ? Infinity : 4096,
      cssCodeSplit: !single,
      rollupOptions: single
        ? { input: resolve(__dirname, 'dongxin.html'), output: { inlineDynamicImports: true } }
        : { input: { dongxin: resolve(__dirname, 'dongxin.html'), slice: resolve(__dirname, 'index.html'), viewer: resolve(__dirname, 'glb-viewer.html') } },
    },
    server: { host: true },
  };
});
