const SitemapStream = require('./SitemapStream');
const getCurrentDateTime = require('./helpers/getCurrentDateTime');

<<<<<<< HEAD:lib/SitemapRotator.js
module.exports = function SitemapRotator(options) {
  const maxEntries = options.maxEntriesPerFile;

=======
module.exports = function SitemapRotator(
  maxEntries,
  lastMod,
  changeFreq,
  priorityMap
) {
>>>>>>> fa7d6494d317197b3661b07f3d55756d7537006f:src/SitemapRotator.js
  const sitemaps = [];
  let count = 0;
  let current = null;
  const currentDateTime = lastMod ? getCurrentDateTime() : '';

  // return temp sitemap paths
  const getPaths = () =>
    sitemaps.reduce((arr, map) => {
      arr.push(map.getPath());
      return arr;
    }, []);

  // adds url to stream
<<<<<<< HEAD:lib/SitemapRotator.js
  const addURL = url => {
=======
  const addURL = (url, depth) => {
    // create stream if none exists
>>>>>>> fa7d6494d317197b3661b07f3d55756d7537006f:src/SitemapRotator.js
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
<<<<<<< HEAD:lib/SitemapRotator.js
    current.addURL(url);
=======

    let priority = '';

    // if priorityMap exists, set priority based on depth
    // if depth is greater than map length, use the last value in the priorityMap
    if (priorityMap && priorityMap.length > 0) {
      priority = priorityMap[depth - 1]
        ? priorityMap[depth - 1]
        : priorityMap[priorityMap.length - 1];
    }

    current.write(url, currentDateTime, changeFreq, priority);

>>>>>>> fa7d6494d317197b3661b07f3d55756d7537006f:src/SitemapRotator.js
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
