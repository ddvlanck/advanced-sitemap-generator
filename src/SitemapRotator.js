const SitemapStream = require('./SitemapStream');

module.exports = function SitemapRotator(options) {
  const maxEntries = options.maxEntriesPerFile;

  const sitemaps = [];
  let count = 0;
  let current = null;

  // return temp sitemap paths
  const getPaths = () =>
    sitemaps.reduce((arr, map) => {
      arr.push(map.getPath());
      return arr;
    }, []);

  // adds url to stream
  const addURL = (url, depth) => {
    // create stream if none exists
    if (current === null) {
      current = SitemapStream();
      sitemaps.push(current);
    }

    // rotate stream
    if (count === maxEntries) {
      current = SitemapStream();
      sitemaps.push(current);
      count = 0;
    }
    current.addURL(url);
    count += 1;
  };
  const flush = () => {
    for (let sitemap of sitemaps) {
      sitemap.flush();
    }
  }
  // close stream
  const finish = () => {
    for (let sitemap of sitemaps) {
      sitemap.end();
    }
  };

  return {
    getPaths,
    addURL,
    flush,
    finish,
  };
};
