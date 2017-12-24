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

  const addURL = url => {
    urls.push(url);
  };
  const flush = () => {
    stream.write('<?xml version="1.0" encoding="utf-8" standalone="yes" ?>');
    stream.write(
      '\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    for(let url of urls){
      const escapedUrl = escapeUnsafe(url);

      var date = (new Date()).toLocaleDateString("en-us").replace('/', '-').replace('/', '-');
      stream.write(`\n  <url>\n    <loc>${escapedUrl}</loc>`);
      stream.write(`\n    <changefreq>daily</changefreq>`);
      stream.write(`\n    <priority>1</priority>`);
      stream.write(`\n    <lastmod>` + date + `</lastmod>`);
      stream.write(`\n  </url>`);
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
