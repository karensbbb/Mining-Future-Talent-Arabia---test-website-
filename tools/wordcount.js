#!/usr/bin/env node
// tools/wordcount.js: visible word count per page (text nodes only, no markup or scripts).
'use strict';
const fs = require('fs');
const path = require('path');
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['index.html', 'services.html', 'commodities.html', 'for-candidates.html', 'insights.html', 'contact.html', 'privacy.html'];
for (const f of files) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  console.log(f.padEnd(22), (s.match(/[A-Za-z0-9'$%]+/g) || []).length);
}
