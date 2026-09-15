#!/usr/bin/env node
/**
 * tools/screenshot.js — deterministic page screenshots via Puppeteer.
 *
 * Usage
 *   node tools/screenshot.js <url-or-file> [options]
 *
 * Options
 *   --out <path>        Output file (single shot) or directory (with --all).
 *                       Default: .tmp/screenshots/
 *   --viewport <name>   desktop | laptop | tablet | mobile, or WxH (e.g. 1600x1000)
 *                       Default: desktop
 *   --all               Shoot every preset viewport in one run.
 *   --theme <t>         light | dark  — emulates prefers-color-scheme. Default: light
 *   --both-themes       Shoot the chosen viewport(s) in light and dark.
 *   --viewport-only     Capture just the visible viewport instead of the full page.
 *   --selector <css>    Clip to a single element (implies --viewport-only).
 *   --wait <ms>         Extra settle time after load. Default: 400
 *   --animate           Keep CSS animations/transitions running (default: frozen,
 *                       so repeat runs of the same page are byte-comparable).
 *   --scale <n>         Device pixel ratio. Default: 2
 *
 * Examples
 *   node tools/screenshot.js index.html --all --both-themes
 *   node tools/screenshot.js index.html --viewport mobile --out .tmp/hero.png
 *   node tools/screenshot.js https://example.com --selector "#contact"
 */

'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop:  { width: 1280, height: 800 },
  tablet:  { width: 834,  height: 1112 },
  mobile:  { width: 390,  height: 844 },
};

/* Chrome resolution order: explicit override, Puppeteer's own download,
   then the browsers Windows ships with. Keeps this working without a
   200MB Chrome-for-Testing download on machines that already have one. */
const SYSTEM_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

/** Non-string / missing paths are skipped: executablePath() can come back
    empty when no browser has been downloaded. */
function isFile(p) {
  return typeof p === 'string' && p.length > 0 && fs.existsSync(p);
}

function resolveBrowser() {
  if (isFile(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const bundled = puppeteer.executablePath();
    if (isFile(bundled)) return bundled;
  } catch (_) {
    /* no browser downloaded — fall through to the system ones */
  }
  const found = SYSTEM_CHROME.find(isFile);
  if (found) return found;

  throw new Error(
    'No Chrome found. Either install one for Puppeteer:\n' +
    '  npx puppeteer browsers install chrome\n' +
    'or point at an existing binary:\n' +
    '  PUPPETEER_EXECUTABLE_PATH="C:/path/to/chrome.exe" node tools/screenshot.js ...'
  );
}

function parseArgs(argv) {
  const opts = {
    target: null,
    out: null,
    viewports: null,
    themes: null,
    fullPage: true,
    selector: null,
    wait: 400,
    animate: false,
    scale: 2,
    all: false,
    bothThemes: false,
  };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--out':       opts.out = argv[++i]; break;
      case '--viewport':  opts.viewports = [argv[++i]]; break;
      case '--theme':     opts.themes = [argv[++i]]; break;
      case '--selector':  opts.selector = argv[++i]; break;
      case '--wait':      opts.wait = Number(argv[++i]); break;
      case '--scale':     opts.scale = Number(argv[++i]); break;
      case '--all':           opts.all = true; break;
      case '--both-themes':   opts.bothThemes = true; break;
      case '--viewport-only': opts.fullPage = false; break;
      case '--animate':       opts.animate = true; break;
      case '-h':
      case '--help':          opts.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
        rest.push(a);
    }
  }

  opts.target = rest[0] || null;
  if (opts.all) opts.viewports = Object.keys(VIEWPORTS);
  if (!opts.viewports) opts.viewports = ['desktop'];
  if (opts.bothThemes) opts.themes = ['light', 'dark'];
  if (!opts.themes) opts.themes = ['light'];
  if (opts.selector) opts.fullPage = false;

  return opts;
}

function resolveViewport(name) {
  if (VIEWPORTS[name]) return { name, ...VIEWPORTS[name] };
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (m) return { name: `${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]) };
  throw new Error(
    `Unknown viewport "${name}". Use one of ${Object.keys(VIEWPORTS).join(', ')} or WxH.`
  );
}

/** A local path becomes a file:// URL; anything with a scheme is left alone. */
function resolveTarget(target) {
  if (/^[a-z]+:\/\//i.test(target)) return { url: target, slug: slugFromUrl(target) };
  const abs = path.resolve(process.cwd(), target);
  if (!fs.existsSync(abs)) throw new Error(`No such file: ${abs}`);
  return {
    url: 'file:///' + abs.replace(/\\/g, '/'),
    slug: path.basename(abs, path.extname(abs)),
  };
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\/+$/, '').split('/').pop();
    return (tail || u.hostname).replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
  } catch (_) {
    return 'page';
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.target) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
    process.exit(opts.target ? 0 : 1);
  }

  const { url, slug } = resolveTarget(opts.target);
  const viewports = opts.viewports.map(resolveViewport);
  const shots = [];
  for (const vp of viewports) {
    for (const theme of opts.themes) shots.push({ vp, theme });
  }

  /* One output path was given but several shots were asked for — treat it as a
     directory so nothing gets silently overwritten. */
  const outIsDir = shots.length > 1 || !opts.out || !/\.(png|jpe?g|webp)$/i.test(opts.out);
  const outDir = outIsDir ? (opts.out || path.join('.tmp', 'screenshots')) : path.dirname(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const executablePath = resolveBrowser();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files'],
  });

  const written = [];

  try {
    for (const { vp, theme } of shots) {
      const page = await browser.newPage();
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: opts.scale,
      });
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: theme },
        // Frozen animations are also the reduced-motion path, so shots settle.
        { name: 'prefers-reduced-motion', value: opts.animate ? 'no-preference' : 'reduce' },
      ]);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Webfonts must be in before measuring, or headings reflow mid-capture.
      await page.evaluate(() => document.fonts && document.fonts.ready);

      if (!opts.animate) {
        await page.addStyleTag({
          content: `*, *::before, *::after {
            animation-delay: -1ms !important;
            animation-duration: 1ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0ms !important;
            scroll-behavior: auto !important;
          }`,
        });
      }

      if (opts.fullPage) {
        // Walk the page so lazy-loaded images and sticky states resolve,
        // then return to the top before capturing.
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.8;
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.evaluate(
          () => Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
          )
        );
      }

      if (opts.wait > 0) {
        await new Promise((r) => setTimeout(r, opts.wait));
      }

      const parts = [slug, vp.name];
      if (opts.themes.length > 1) parts.push(theme);
      const file = outIsDir
        ? path.join(outDir, `${parts.join('-')}.png`)
        : opts.out;

      const shooter = opts.selector ? await page.$(opts.selector) : page;
      if (opts.selector && !shooter) {
        throw new Error(`Selector not found on page: ${opts.selector}`);
      }

      await shooter.screenshot({ path: file, fullPage: opts.fullPage && !opts.selector });

      const kb = Math.round(fs.statSync(file).size / 1024);
      const dims = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      // Horizontal overflow is the most common responsive bug — flag it here.
      const overflow = dims.w > vp.width + 1;
      console.log(
        `${file}  ${vp.width}x${vp.height} ${theme}  page ${dims.w}x${dims.h}  ${kb}KB` +
        (overflow ? `  ** horizontal overflow: content is ${dims.w - vp.width}px wider than the viewport **` : '')
      );

      written.push(file);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${written.length} screenshot${written.length === 1 ? '' : 's'} written.`);
}

main().catch((err) => {
  console.error(`\nscreenshot.js failed: ${err.message}`);
  process.exit(1);
});
