const SitemapStream = require('./SitemapStream');

module.exports = function SitemapRotator(maxEntries) {
  const langs = {};
  let current = null;

  // return temp sitemap paths
  const getPaths = () => {
    let arr = [];
    for(let key in langs){
      let onlyMe = langs[key].length === 1;
      for(let sitemap of langs[key]){
        arr.push({lang: sitemap.lang, path: sitemap.getPath(), onlyMe: onlyMe});
      }
    }
    return arr;
  }
  // adds url to stream
  const addURL = url => {
    // create stream if none exists
    if (!langs[url.lang]) {
      current = SitemapStream(url.lang);
      langs[url.lang] = [current];
    }
    else {
      current = langs[url.lang][langs[url.lang].length - 1];
    }

    // rotate stream
   if (current.urls.length === maxEntries) {
      current = SitemapStream(url.lang);
      langs[url.lang].push(current);
    }
    current.addURL(url);
  };
  const flush = () => {
    for(let key in langs){
      for(let sitemap of langs[key]){
        sitemap.flush();
      }
    }
  }
  // close stream
  const finish = () => {
    for(let key in langs){
      for(let sitemap of langs[key]){
        sitemap.end();
      }
    }
  };

  return {
    getPaths,
    languageBasedSitemaps: langs,
    addURL,
    flush,
    finish,
  };
};
