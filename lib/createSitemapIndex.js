const extendFilename = require('./helpers/extendFilename');

module.exports = (url, filename, count) => {
  let sitemapIndex =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  for (let key in count) {
    for (let i = 1; i < count[key]; i += 1) {
      // generate sitemap part url
      let postfix = `_${key}`;
      postfix += count[key] > 2 ? `_part${i}` : '';

      const newFilename = extendFilename(filename, postfix);

      const sitemapUrl = `${url.replace(/\/$/, '')}/${newFilename}`;
      sitemapIndex += `\n  <sitemap>\n    <loc>${sitemapUrl}</loc>\n  </sitemap>`;
    }
  }
  sitemapIndex += '\n</sitemapindex>';

  return sitemapIndex;
};
