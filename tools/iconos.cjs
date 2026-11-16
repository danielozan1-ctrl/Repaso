// Regenera los PNG a partir de icons/icon.svg (necesita Playwright): node tools/iconos.cjs
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
(async () => {
  const dir = join(__dirname, '..', 'icons');
  const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const hacer = async (nombre, lado, relleno) => {
    await p.setViewportSize({ width: lado, height: lado });
    const s = relleno ? svg.replace('rx="112"', 'rx="0"') : svg;
    const pad = relleno === 'maskable' ? '12%' : '0';
    await p.setContent(`<body style="margin:0;background:${relleno ? '#1f5fb0' : 'transparent'}"><div style="padding:${pad};box-sizing:border-box;width:${lado}px;height:${lado}px">${s}</div>`);
    await p.screenshot({ path: join(dir, nombre), omitBackground: !relleno });
  };
  await hacer('icon-192.png', 192);
  await hacer('icon-512.png', 512);
  await hacer('icon-maskable-512.png', 512, 'maskable');
  await hacer('apple-touch-icon.png', 180, 'opaco');
  await b.close();
})();
