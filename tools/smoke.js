#!/usr/bin/env node
/**
 * tools/smoke.js — behavioural checks against the running dev server.
 *
 * Usage
 *   node tools/smoke.js [--base http://localhost:4321]
 *
 * Covers the things a screenshot cannot: that every page loads, that internal
 * links and assets resolve, that the mobile drawer opens and closes, that the
 * form refuses an empty submit, and that nothing overflows horizontally.
 * Exits non-zero if any check fails.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PAGES = [
  '/',
  '/services.html',
  '/commodities.html',
  '/for-candidates.html',
  '/insights.html',
  '/contact.html',
];

const SYSTEM_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function isFile(p) {
  return typeof p === 'string' && p.length > 0 && fs.existsSync(p);
}

function resolveBrowser() {
  if (isFile(process.env.PUPPETEER_EXECUTABLE_PATH)) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    const bundled = puppeteer.executablePath();
    if (isFile(bundled)) return bundled;
  } catch (_) { /* fall through */ }
  const found = SYSTEM_CHROME.find(isFile);
  if (found) return found;
  throw new Error('No Chrome found. Run: npx puppeteer browsers install chrome');
}

let base = 'http://localhost:4321';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') base = argv[++i];
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: resolveBrowser(),
    headless: true,
    args: ['--hide-scrollbars', '--allow-file-access-from-files'],
  });

  try {
    for (const route of PAGES) {
      const page = await browser.newPage();
      const consoleErrors = [];
      const badRequests = [];

      page.on('pageerror', (e) => consoleErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('requestfailed', (r) => badRequests.push(r.url()));
      page.on('response', (r) => { if (r.status() >= 400) badRequests.push(r.status() + ' ' + r.url()); });

      await page.setViewport({ width: 1440, height: 900 });
      const res = await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 30000 });

      check(`${route} responds 200`, res && res.status() === 200, res ? String(res.status()) : 'no response');
      check(`${route} loads every asset`, badRequests.length === 0, badRequests.slice(0, 4).join(', '));
      check(`${route} has no script errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

      const meta = await page.evaluate(() => ({
        title: document.title,
        desc: (document.querySelector('meta[name="description"]') || {}).content || '',
        h1: document.querySelectorAll('h1').length,
        imgsNoAlt: Array.from(document.images).filter((i) => !i.hasAttribute('alt')).length,
      }));
      check(`${route} has a title and description`, !!meta.title && meta.desc.length > 40, meta.title);
      check(`${route} has exactly one h1`, meta.h1 === 1, 'found ' + meta.h1);
      check(`${route} images all carry alt`, meta.imgsNoAlt === 0, meta.imgsNoAlt + ' missing');

      // Internal links must point at something that exists.
      const links = await page.evaluate(() => Array.from(
        new Set(Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h)))
      ));
      const broken = [];
      for (const href of links) {
        const target = new URL(href, base + route).toString();
        const r = await page.evaluate(async (u) => {
          try { const res = await fetch(u, { method: 'GET' }); return res.status; }
          catch (e) { return 0; }
        }, target);
        if (r !== 200) broken.push(href + ' -> ' + r);
      }
      check(`${route} internal links resolve`, broken.length === 0, broken.join(', '));

      // In-page anchors must have a matching id.
      const deadAnchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#"]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h !== '#' && !document.querySelector(h)));
      check(`${route} in-page anchors have targets`, deadAnchors.length === 0, deadAnchors.join(', '));

      // Cross-page fragments (page.html#section) must resolve too — the page
      // loading is not enough if the id it scrolls to does not exist.
      const crossLinks = await page.evaluate(() => Array.from(
        new Set(Array.from(document.querySelectorAll('a[href*=".html#"]'))
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && !/^https?:/.test(h)))
      ));
      const deadFragments = [];
      for (const href of crossLinks) {
        const [file, frag] = href.split('#');
        const target = new URL(file, base + route).toString();
        const ok = await page.evaluate(async (u, id) => {
          try {
            const res = await fetch(u);
            if (!res.ok) return false;
            const html = await res.text();
            return new DOMParser().parseFromString(html, 'text/html').getElementById(id) !== null;
          } catch (e) { return false; }
        }, target, frag);
        if (!ok) deadFragments.push(href);
      }
      check(`${route} cross-page anchors resolve`, deadFragments.length === 0, deadFragments.join(', '));

      // Horizontal overflow across the range, narrowest first. body has
      // overflow-x:hidden, so this never shows as a scrollbar — it shows as
      // content silently cut off the side of a small phone.
      for (const w of [320, 360, 390, 834]) {
        await page.setViewport({ width: w, height: 844 });
        await new Promise((r) => setTimeout(r, 150));
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        check(`${route} fits at ${w}px`, over <= 1, over > 1 ? over + 'px clipped' : '');
      }

      await page.setViewport({ width: 390, height: 844 });
      await new Promise((r) => setTimeout(r, 250));
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
        /* Both checks matter: an element can sit inside the viewport while its
           own content scrolls past it, which is what actually widens the page. */
        culprits: Array.from(document.querySelectorAll('body *'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const spills = el.scrollWidth > el.clientWidth + 1 &&
              getComputedStyle(el).overflowX === 'visible';
            return r.right > window.innerWidth + 1 || spills;
          })
          .slice(0, 5)
          .map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]),
      }));
      check(`${route} no horizontal overflow at 390px`,
        overflow.doc <= overflow.win + 1,
        `${overflow.doc} > ${overflow.win} · ${overflow.culprits.join(', ')}`);

      // Mobile drawer.
      const drawer = await page.evaluate(async () => {
        const burger = document.getElementById('burger');
        const panel = document.getElementById('drawer');
        if (!burger || !panel) return { present: false };

        const visible = getComputedStyle(burger).display !== 'none';
        burger.click();
        await new Promise((r) => setTimeout(r, 350));
        const opened = panel.classList.contains('is-open') &&
          getComputedStyle(panel).visibility === 'visible';
        const links = panel.querySelectorAll('a').length;
        burger.click();
        await new Promise((r) => setTimeout(r, 350));
        const closed = !panel.classList.contains('is-open') &&
          !document.body.classList.contains('nav-open');
        return { present: true, visible, opened, closed, links };
      });
      check(`${route} burger is shown at 390px`, drawer.present && drawer.visible);
      check(`${route} drawer opens with links`, drawer.opened && drawer.links >= 5, 'links: ' + drawer.links);
      check(`${route} drawer closes and releases scroll`, drawer.closed);

      await page.close();
    }

    // Form: an empty submit must be refused in the page, not posted away.
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(base + '/contact.html', { waitUntil: 'networkidle2' });
    const form = await page.evaluate(async () => {
      const f = document.querySelector('form[data-enquiry]');
      if (!f) return { present: false };
      const before = location.href;
      f.querySelector('button[type="submit"]').click();
      await new Promise((r) => setTimeout(r, 200));
      const status = f.querySelector('.form__status');
      return {
        present: true,
        navigated: location.href !== before,
        warned: status && !status.hidden,
        invalid: f.querySelectorAll('[aria-invalid="true"]').length,
        honeypot: !!f.querySelector('input[name="_honey"]'),
        endpoint: f.getAttribute('data-endpoint') || '',
        mailto: f.getAttribute('data-mailto') || '',
      };
    });
    check('contact form blocks an empty submit', form.present && !form.navigated && form.warned);
    check('contact form marks the bad fields', form.invalid > 0, 'marked ' + form.invalid);
    check('contact form has a honeypot', form.honeypot);
    await page.close();

    // The landing page brief card is deliberately four fields. If it grows,
    // it has stopped being the low-friction route in.
    const brief = await browser.newPage();
    await brief.setViewport({ width: 1440, height: 900 });
    await brief.goto(base + '/', { waitUntil: 'networkidle2' });
    const shape = await brief.evaluate(async () => {
      const f = document.querySelector('.briefcard form[data-enquiry]');
      if (!f) return { present: false };
      const fields = Array.from(f.querySelectorAll('input, textarea, select'))
        .map((el) => el.name)
        .filter((n) => n && n[0] !== '_' && n !== 'consent');
      f.querySelector('button[type="submit"]').click();
      await new Promise((r) => setTimeout(r, 200));
      const status = f.querySelector('.form__status');
      return { present: true, fields, warned: status && !status.hidden };
    });
    check('landing brief card exists', shape.present);
    check('landing brief card is name/company/email/brief',
      JSON.stringify(shape.fields) === JSON.stringify(['name', 'company', 'email', 'brief']),
      (shape.fields || []).join(', '));
    check('landing brief card blocks an empty submit', shape.warned);
    await brief.close();

    // Every form on the site must deliver to the mining desk inbox.
    const DESK = 'recruitment@futuretalentarabia.com';
    for (const route of ['/', '/contact.html', '/for-candidates.html']) {
      const p = await browser.newPage();
      await p.goto(base + route, { waitUntil: 'networkidle2' });
      const wiring = await p.evaluate(() => Array.from(document.querySelectorAll('form[data-enquiry]'))
        .map((f) => ({
          endpoint: f.getAttribute('data-endpoint') || '',
          mailto: f.getAttribute('data-mailto') || '',
          subject: f.getAttribute('data-subject') || '',
        })));
      check(`${route} has an enquiry form`, wiring.length > 0);
      wiring.forEach((w) => {
        check(`${route} form posts to the mining desk`,
          w.endpoint.indexOf(DESK) !== -1, w.endpoint || 'no endpoint');
        check(`${route} form falls back to the mining desk`, w.mailto === DESK, w.mailto);
        check(`${route} form sets a subject`, w.subject.length > 0, w.subject);
      });
      await p.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log('  · ' + f.name + (f.detail ? ' — ' + f.detail : '')));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nsmoke.js failed: ' + err.message);
  process.exit(1);
});
