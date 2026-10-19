#!/usr/bin/env node
/**
 * tools/copycheck.js: house style checks on every word a visitor can read.
 *
 * Usage
 *   node tools/copycheck.js            (all live pages plus site.js messages)
 *   node tools/copycheck.js index.html (one file)
 *
 * Two rules, both strict:
 *   1. No dashes of any kind in visible copy. That covers the em dash, the en
 *      dash, the figure dash, the minus sign and the plain hyphen, including
 *      hyphenated compounds. Write "ramp up", "hard rock", "Al Baitha".
 *   2. British English. A list of common American spellings is refused.
 *
 * "Visible copy" means page text, the <title>, meta descriptions and social
 * tags, alt / title / aria-label / placeholder attributes, JSON-LD string
 * values, and the status messages site.js shows on the forms. Markup, URLs,
 * class names, comments and CSS are not copy and are not checked.
 * Exits non-zero if anything is found.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'services.html', 'commodities.html', 'for-candidates.html',
  'insights.html', 'contact.html', 'privacy.html'];

const DASH = /[-‐‑‒–—―−﹘﹣－]/;

/* American spelling -> British. Whole words, case-insensitive. */
const AMERICAN = {
  organization: 'organisation', organizations: 'organisations', organize: 'organise',
  prioritize: 'prioritise', prioritized: 'prioritised', specialize: 'specialise',
  specialized: 'specialised', recognize: 'recognise', recognized: 'recognised',
  optimize: 'optimise', optimization: 'optimisation', mobilize: 'mobilise',
  mobilization: 'mobilisation', localization: 'localisation', nationalization: 'nationalisation',
  saudization: 'Saudisation', emiratization: 'Emiratisation', omanization: 'Omanisation',
  utilize: 'use', utilization: 'utilisation', analyze: 'analyse', analyzed: 'analysed',
  modernize: 'modernise', modernization: 'modernisation', industrialization: 'industrialisation',
  capitalize: 'capitalise', minimize: 'minimise', maximize: 'maximise', authorized: 'authorised',
  center: 'centre', centers: 'centres', color: 'colour', labor: 'labour', favor: 'favour',
  behavior: 'behaviour', defense: 'defence', program: 'programme', programs: 'programmes',
  aluminum: 'aluminium', sulfide: 'sulphide', sulfur: 'sulphur', gray: 'grey', catalog: 'catalogue',
  fulfill: 'fulfil', enrollment: 'enrolment', traveling: 'travelling', modeling: 'modelling',
  canceled: 'cancelled', meter: 'metre', meters: 'metres', liter: 'litre', ton: 'tonne',
  tons: 'tonnes', jewelry: 'jewellery', percent: 'per cent', license: 'licence (noun)',
  licenses: 'licences', offense: 'offence', practicing: 'practising', fiber: 'fibre',
};

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/* Returns [{ line, text, where }] for every piece of copy in an HTML file. */
function htmlCopy(src) {
  const out = [];
  const lineAt = (i) => src.slice(0, i).split('\n').length;

  // JSON-LD string values
  src.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body, i) => {
    body.replace(/"([^"]*)"/g, (q, v, j) => {
      const isKey = body.slice(j + q.length).trimStart().startsWith(':');
      const isUrl = /^(https?:|mailto:)/.test(v);
      const isIsoDate = /^\d{4}-\d{2}-\d{2}/.test(v);
      if (!isKey && !isUrl && !isIsoDate) out.push({ line: lineAt(i), text: v, where: 'JSON-LD' });
      return q;
    });
    return m;
  });

  // Attributes a person reads or hears
  src.replace(/<(meta|img|a|input|textarea|button|section|nav|div|span|label|iframe)\b[^>]*>/g, (tag, name, i) => {
    tag.replace(/\b(alt|title|aria-label|placeholder)="([^"]*)"/g, (_, attr, v) => {
      out.push({ line: lineAt(i), text: decode(v), where: attr });
    });
    if (name === 'meta' && /(name="(description|twitter:[a-z]+)"|property="og:(title|description|site_name)")/.test(tag)) {
      const c = tag.match(/content="([^"]*)"/);
      if (c) out.push({ line: lineAt(i), text: decode(c[1]), where: 'meta' });
    }
    return tag;
  });

  // Text nodes: blank out non-copy regions, keep offsets so line numbers hold.
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const body = src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<script\b[\s\S]*?<\/script>/g, blank)
    .replace(/<style\b[\s\S]*?<\/style>/g, blank)
    .replace(/<[^>]+>/g, blank);
  body.split('\n').forEach((ln, idx) => {
    const t = decode(ln).trim();
    if (t) out.push({ line: idx + 1, text: t, where: 'text' });
  });
  return out;
}

/* User-facing strings in site.js: arguments to say(...) and the subject line. */
function jsCopy(src) {
  const out = [];
  const lines = src.split('\n');
  lines.forEach((ln, idx) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
    if (!/say\(|subject|setAttribute\('aria-label'/.test(ln)) return;
    ln.replace(/'((?:[^'\\]|\\.)*)'/g, (_, v) => {
      if (/\s/.test(v) || /[A-Z]/.test(v[0] || '')) out.push({ line: idx + 1, text: v, where: 'site.js' });
      return _;
    });
  });
  return out;
}

function scan(file, items) {
  const problems = [];
  for (const it of items) {
    const d = it.text.match(DASH);
    if (d) problems.push(`${file}:${it.line}  [${it.where}] dash "${d[0]}" in: ${it.text.slice(0, 110)}`);
    it.text.replace(/[A-Za-z]+/g, (w) => {
      const brit = AMERICAN[w.toLowerCase()];
      if (brit) problems.push(`${file}:${it.line}  [${it.where}] American "${w}" (use ${brit}) in: ${it.text.slice(0, 90)}`);
      return w;
    });
  }
  return problems;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : [...PAGES, 'assets/js/site.js'];
let problems = [];
for (const rel of targets) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const items = rel.endsWith('.js') ? jsCopy(src) : htmlCopy(src);
  problems = problems.concat(scan(rel, items));
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} copy problem(s) found.`);
  process.exit(1);
}
console.log(`Copy clean: no dashes, no American spellings across ${targets.length} file(s).`);
