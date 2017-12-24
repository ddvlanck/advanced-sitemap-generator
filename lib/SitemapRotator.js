const SitemapStream = require('./SitemapStream');

module.exports = function SitemapRotator(maxEntries) {
  const sitemaps = [];
  let current = null;

  // return temp sitemap paths
  const getPaths = () =>
    sitemaps.reduce((arr, map) => {
      arr.push(map.getPath());
      return arr;
    }, []);

  // adds url to stream
  const addURL = url => {
    // create stream if none exists
    if (current === null) {
      current = SitemapStream();
      sitemaps.push(current);
    }

    // rotate stream
    if (current.urls.length === maxEntries) {
      current.end();
      current = SitemapStream();
      sitemaps.push(current);
    }

    current.addURL(url);

  };
  const flush = () => {
    for(let sitemap of sitemaps){
      sitemap.flush();
    }
  }
  // close stream
  const finish = () => {
    if (current) {
      current.end();
    }
  };

  return {
    getPaths,
    addURL,
    flush,
    finish,
  };
};
