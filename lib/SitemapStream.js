const path = require('path');
const rand = require('crypto-random-string');
const os = require('os');
const fs = require('fs');
const escapeUnsafe = require('./helpers/escapeUnsafe');
const cheerio = require('cheerio')
const request = require('request');

module.exports = function SitemapStream() {
  const tmpPath = path.join(os.tmpdir(), `sitemap_${rand(10)}`);
  const stream = fs.createWriteStream(tmpPath);
  const urls = [];

  const getPath = () => tmpPath;

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
    for(let alternativeUrl of url.alternatives){
      // Skip self refrence alternative URL
      // if(alternativeUrl.value === url.value){
      //   continue;
      // }
      stream.write(`\n    <xhtml:link rel='alternate' hreflang='` + alternativeUrl.lang +
        `' href='`+ alternativeUrl.value + `' />`);
    }
    stream.write(`\n    <changefreq>daily</changefreq>`);
    stream.write(`\n    <priority>1</priority>`);
    stream.write(`\n    <lastmod>` + date + `</lastmod>`);
    stream.write(`\n  </url>`);
  }
  const flush = () => {
    initXML();

    for(let url of urls){
      flushURL(url);
    }
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
