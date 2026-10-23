#!/usr/bin/env node
// Builds the public static site (GitHub Pages) into dist/site/:
//   index.html    the playable web build (dist/www) with all assets beside it, plus the favicon, share preview tags
//                 and the bundle size for the boot loader's progress bar (game/index.html data-size)
//   download.html redirect to the game: the Android APK is shelved (desktop web is the platform), but links to the
//                 old download page keep working
//   play/         redirect for previously shared browser-play links
//
// Run `node scripts/build-web.mjs` first. The repository (owner/name) comes from $GITHUB_REPOSITORY (set by GitHub
// Actions) or the "repository" field of package.json.
// Caching: GitHub Pages serves everything with ETags and a 10-minute max-age, so repeat visits revalidate cheaply and
// a new deploy is picked up within minutes. There is deliberately no service worker: the assets are not
// content-hashed, and a stale worker could pair an old game.js with new models / maps.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, emblemSvg } from './site-common.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const WWW = path.join(ROOT, 'dist', 'www');
const OUT = path.join(ROOT, 'dist', 'site');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));

const repoField = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
const slug = process.env.GITHUB_REPOSITORY || repoField.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');
const [owner, repo] = slug.split('/');
if (!owner || !repo) {
  console.error('Unknown GitHub repository: set "repository" in package.json or $GITHUB_REPOSITORY.');
  process.exit(1);
}
const SITE_URL = `https://${owner.toLowerCase()}.github.io/${repo}/`;
const TITLE = '災厄前線 CALAMITY FRONT';
const DESC = '1–4 人合作的回合制殭屍防禦 FPS。打開網頁直接遊玩，支援鍵盤＋滑鼠、單人 AI 隊友與多人連線。';

try {
  await fs.access(path.join(WWW, 'index.html'));
} catch {
  console.error('dist/www is missing: run `node scripts/build-web.mjs` first.');
  process.exit(1);
}

/** A tiny page that forwards to the game, keeping the query (dev params, ?join=) and hash. */
const redirect = (to) => `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(TITLE)}</title>
<meta name="robots" content="noindex">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
</head><body><a href="${to}">開啟遊戲</a></body></html>`;

await fs.rm(OUT, { recursive: true, force: true });
await fs.cp(WWW, OUT, { recursive: true });

const bundle = await fs.stat(path.join(OUT, 'game.js'));
const thumb = 'assets/maps/losttown/thumb.jpg';
const hasThumb = await fs.access(path.join(OUT, thumb)).then(() => true, () => false);
const head = [
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  `<link rel="canonical" href="${esc(SITE_URL)}">`,
  '<meta property="og:type" content="website">',
  `<meta property="og:title" content="${esc(TITLE)}">`,
  `<meta property="og:description" content="${esc(DESC)}">`,
  `<meta property="og:url" content="${esc(SITE_URL)}">`,
  hasThumb ? `<meta property="og:image" content="${esc(SITE_URL + thumb)}">` : '',
  '<meta name="twitter:card" content="summary_large_image">',
].filter(Boolean).join('\n');
let gameHtml = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
if (!gameHtml.includes('<script data-size="0">')) {
  console.error('game/index.html: the boot loader (<script data-size="0">) is missing.');
  process.exit(1);
}
gameHtml = gameHtml.replace('</head>', `${head}\n</head>`).replace('<script data-size="0">', `<script data-size="${bundle.size}">`);
await fs.writeFile(path.join(OUT, 'index.html'), gameHtml);
await fs.writeFile(path.join(OUT, 'download.html'), redirect('./'));
await fs.writeFile(path.join(OUT, 'favicon.svg'), emblemSvg({ background: true }));
await fs.writeFile(path.join(OUT, '.nojekyll'), '');
await fs.mkdir(path.join(OUT, 'play'), { recursive: true });
await fs.writeFile(path.join(OUT, 'play', 'index.html'), redirect('../'));
console.log(`site -> ${path.relative(ROOT, OUT)}  (${SITE_URL}, game.js ${(bundle.size / 1048576).toFixed(2)} MB)`);
