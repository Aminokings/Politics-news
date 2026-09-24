#!/usr/bin/env node
// Assembles the deployable site: the app files + config + the news data.
//   node scripts/build-site.mjs --data data --out _site
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dataDir = path.resolve(opt('data', path.join(ROOT, 'data')));
const outDir = path.resolve(opt('out', path.join(ROOT, '_site')));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(ROOT, f), path.join(outDir, f));
fs.cpSync(path.join(ROOT, 'assets'), path.join(outDir, 'assets'), { recursive: true });
fs.cpSync(path.join(ROOT, 'config'), path.join(outDir, 'config'), { recursive: true });
if (fs.existsSync(dataDir)) fs.cpSync(dataDir, path.join(outDir, 'data'), { recursive: true });
else console.warn(`No data folder at ${dataDir} — the site will show "no news yet".`);

// Stamp the service worker with a build id so browsers pick up new versions.
const build = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace('__BUILD__', build);
fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
console.log(`Built site in ${outDir} (build ${build}).`);
