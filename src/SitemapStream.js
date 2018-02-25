const path = require('path');
const rand = require('crypto-random-string');
const os = require('os');
const fs = require('fs');
const escapeUnsafe = require('./helpers/escapeUnsafe');

module.exports = function SitemapStream() {
  const tmpPath = path.join(os.tmpdir(), `sitemap_${rand(10)}`);
  const stream = fs.createWriteStream(tmpPath);
  const urls = [];

  const getPath = () => tmpPath;

<<<<<<< HEAD:lib/SitemapStream.js
  const getPiriorityFromDepth = depth => {
    let pir = 0.5;
    let zeroIndexedDepth = depth - 1;
    if(zeroIndexedDepth === 0){
      pir = 1;
    } else if(zeroIndexedDepth === 1){
      pir = 0.9;
    } else if(zeroIndexedDepth === 2){
      pir = .8;
    } else if(zeroIndexedDepth === 3){
      pir = .7;
    } else if(zeroIndexedDepth === 4){
      pir = .6;
    }
    return pir;
  }

  const addURL = url => {
    urls.push(url);
  }

  const initXML = () => {
    stream.write('<?xml version="1.0" encoding="utf-8" standalone="yes" ?>');
    stream.write('\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" >');
  }

  const flushURL = (url) => {
    url.flushed = true;

    const escapedUrl = escapeUnsafe(url.value);

    var date = (new Date()).toLocaleDateString("en-us").replace('/', '-').replace('/', '-');
    stream.write(`\n  <url>\n    <loc>${escapedUrl}</loc>`);
    for (let alternativeUrl of url.alternatives) {
      // Skip self refrence alternative URL
      // if(alternativeUrl.value === url.value){
      //   continue;
      // }
      stream.write(`\n    <xhtml:link rel='alternate' hreflang='` + alternativeUrl.lang +
        `' href='` + escapeUnsafe(alternativeUrl.value) + `' />`);
    }
    stream.write(`\n    <changefreq>daily</changefreq>`);
    stream.write(`\n    <priority>` + getPiriorityFromDepth(url.depth) + `</priority>`);
    stream.write(`\n    <lastmod>` + date + `</lastmod>`);
    stream.write(`\n  </url>`);
  }
  const flush = () => {
    initXML();

    for (let url of urls) {
      flushURL(url);
    }
=======
  const write = (url, currentDateTime, changeFreq, priority) => {
    const escapedUrl = escapeUnsafe(url);
    stream.write('\n  <url>\n');
    stream.write(`    <loc>${escapedUrl}</loc>\n`);
    if (currentDateTime) {
      stream.write(`    <lastmod>${currentDateTime}</lastmod>\n`);
    }
    if (changeFreq) {
      stream.write(`    <changefreq>${changeFreq}</changefreq>\n`);
    }
    if (priority) {
      stream.write(`    <priority>${priority}</priority>\n`);
    }
    stream.write('  </url>');
>>>>>>> fa7d6494d317197b3661b07f3d55756d7537006f:src/SitemapStream.js
  };

  const end = () => {
    stream.write('\n</urlset>');
    stream.end();
  };

  return {
    urls,
    addURL,
    getPath,
    flush,
    end,
  };
};
