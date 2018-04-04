const fs = require('fs');
const http = require('http');
const path = require('path');
const parseURL = require('url-parse');
const cpFile = require('cp-file');
const cheerio = require('cheerio')
const request = require('request');
const normalizeUrl = require('normalize-url');
const cld = require('cld');
const eachSeries = require('async/eachSeries');
const mitt = require('mitt');
const compareUrls = require('compare-urls');
const urlExists = require('url-exists');

const createCrawler = require('./createCrawler');
const SitemapRotator = require('./SitemapRotator');
const createSitemapIndex = require('./createSitemapIndex');
const extendFilename = require('./helpers/extendFilename');
const validChangeFreq = require('./helpers/validChangeFreq');
const getLangCodeMap = require('./helpers/getLangCodeMap');
const isValidURL = require('./helpers/isValidURL');
const discoverResources = require('./discoverResources');

module.exports = function SitemapGenerator(uri, opts) {
  const defaultOpts = {
    ignoreHreflang: true,
    stripQuerystring: true,
    maxEntriesPerFile: 50000,
    maxDepth: 0,
    filepath: path.join(process.cwd(), 'sitemap.xml'),
    userAgent: 'Node/SitemapGenerator',
    respectRobotsTxt: true,
    ignoreInvalidSSL: true,
    recommendAlternatives: false,
    timeout: 30000,
    discoverResources,
    decodeResponses: true,
    lastMod: false,
    changeFreq: '',
    priorityMap: []
  };
  if (!uri) {
    throw new Error('Requires a valid URL.');
  }

  const options = Object.assign({}, defaultOpts, opts);

  let cachedResultURLs = [];
  let realCrawlingDepth = 0;
  let savedOnDiskSitemapPaths = [];

  const stats = {
    add: 0,
    ignore: 0,
    error: 0
  };
  const getStats = () => ({
    added: stats.add || 0,
    ignored: stats.ignore || 0,
    errored: stats.error || 0,
    urls: cachedResultURLs,
    realCrawlingDepth: realCrawlingDepth
  });
  const getPaths = () => {
    return savedOnDiskSitemapPaths;
  }
  // if changeFreq option was passed, check to see if the value is valid
  if (opts && opts.changeFreq) {
    options.changeFreq = validChangeFreq(opts.changeFreq);
  }

  const emitter = mitt();

  const parsedUrl = parseURL(
    normalizeUrl(uri, {
      stripWWW: false,
      removeTrailingSlash: false
    })
  );
  const sitemapPath = path.resolve(options.filepath);

  // we don't care about invalid certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const crawler = createCrawler(parsedUrl, options);

  const start = () => {
    cachedResultURLs = [];
    crawler.start();
    //Add initial URL
    addURL(parsedUrl, 1);
  };

  const stop = () => {
    crawler.stop();
  };
  const createSitemapFromURLs = (urls) => {
    for (let urlObj of urls) {
      sitemap.addURL(urlObj);
    }
    onCrawlerComplete();
  }
  const queueURL = url => {
    crawler.queueURL(url, undefined, false);
  };

  const guessHTMLLang = (html) => {
    const $ = cheerio.load(html)
    const init = (resolve, reject) => {
      let lang = $('html').attr('lang') ? $('html').attr('lang') : '';
      if (lang !== '') {
        resolve(lang);
      } else {
        cld.detect(html, {isHTML: true}, function (err, result) {
          if (err) {
            reject(err);
          }
          lang = result.languages[0].code;
          resolve(lang);
        });
      }
    };
    let promise = new Promise(init);
    return promise;
  };
  const detectUrlLang = (urlObj) => {
    const init = (resolve, reject) => {
      request({
        method: 'GET',
        url: urlObj.value
      }, function (err, response, body) {

        if (err) return reject(err);
        const $ = cheerio.load(body)

        guessHTMLLang(body).then(lang => {
          urlObj.lang = lang;
          // Extract all languages and urls from head
          $('head').find('link[rel="alternate"]').each(function (i, elem) {
            let hreflang = $(this).attr('hreflang');
            let hreflangUrl = $(this).attr('href');

            if (normalizeUrl(urlObj.value) === normalizeUrl(hreflangUrl)) {
              // Update the original URL by it's main language
              urlObj.lang = hreflang;
            }
            if (typeof hreflang !== typeof undefined && hreflang !== false) {
              urlObj.alternatives.push({
                value: hreflangUrl,
                flushed: false,
                lang: hreflang
              });
            }
          });
          resolve(urlObj);
        }).catch((error) => {
          emitError(500, error.message);
        });
      });
    };
    let promise = new Promise(init);

    return promise;
  }

  // create sitemap stream
  const sitemap = SitemapRotator(options);

  const emitError = (code, url) => {
    emitter.emit('error', {
      code,
      message: http.STATUS_CODES[code],
      url
    });
  };
  const addURL = (url, depth) => {
    let urlObj = {value: url, depth: depth, flushed: false, alternatives: [], lang: 'en'};
    const init = (resolve, reject) => {
      let isExisted = cachedResultURLs.filter(function (item) {
        return compareUrls(urlObj.value, item.value);
      }).length;
      urlExists(url, function (err, isNotBroken) {
        if (isExisted) {
          emitError(200, 'URL WAS CRAWLED BEFORE');
          reject({});
        }
        else if (!isNotBroken) {
          emitError(404, 'URL IS BROKEN');
          reject({});
        }
        else if (options.ignoreHreflang) {
          cachedResultURLs.push(urlObj);
          resolve(urlObj);
        }
        else {
          detectUrlLang(urlObj).then(result => {
            urlObj = result;
            cachedResultURLs.push(urlObj);
            resolve(urlObj);
          }).catch((error) => {
            emitError(500, error.message);
            reject(error);
          });
        }
      });
    };

    if (depth > realCrawlingDepth) {
      realCrawlingDepth = depth;
    }

    let promise = new Promise(init);
    return promise;
  };
  const onCrawlerComplete = () => {
    const getLangFreeURL = (url) => {
      const langs = getLangCodeMap(url.lang);
      let pureURL = url.value;
      for (const lang of langs) {
        pureURL = pureURL.replace('/' + lang, '');
      }
      return pureURL;
    };
    const recommendAlternatives = () => {
      for (let url of cachedResultURLs) {
        let pureURL = getLangFreeURL(url);
        for (let otherURL of cachedResultURLs) {
          let otherPureURL = getLangFreeURL(otherURL);
          if (url.value === otherURL.value || pureURL !== otherPureURL) {
            continue;
          }

          let isAlternativeAddedBefore = url.alternatives.filter(function (alter) {
            return compareUrls(alter.value, otherURL.value);
          }).length;

          if (isAlternativeAddedBefore) {
            continue;
          }

          url.alternatives.push({
            value: otherURL.value,
            flushed: false,
            lang: otherURL.lang
          });
        }

        let isSelfRefrencingAlternativeAddedBefore = url.alternatives.filter(function (alter) {
          //IF THE URL WAS ADDED BEFORE OR THERE IS ANOTHER ONE FOR THIS LANG
          return compareUrls(alter.value, url.value) || alter.lang === url.lang;
        }).length;
        if (url.alternatives.length === 0 || isSelfRefrencingAlternativeAddedBefore) {
          continue;
        }

        url.alternatives.push({
          value: url.value,
          flushed: false,
          lang: url.lang
        });
      }
    }
    const init = () => {
      const finish = () => {
        sitemap.finish();

        const sitemaps = sitemap.getPaths();

        const cb = () => emitter.emit('done', getStats());

        // move files
        if (sitemaps && sitemaps.length > 1) {
          // multiple sitemaps
          let count = 1;
          eachSeries(
            sitemaps,
            (tmpPath, done) => {
              const newPath = extendFilename(sitemapPath, `_part${count}`);
              savedOnDiskSitemapPaths.push(newPath);
              // copy and remove tmp file
              cpFile(tmpPath, newPath).then(() => {
                fs.unlink(tmpPath, () => {
                  done();
                });
              });

              count += 1;
            },
            () => {
              const filename = path.basename(sitemapPath);
              savedOnDiskSitemapPaths.push(sitemapPath);
              fs.writeFile(
                sitemapPath,
                createSitemapIndex(parsedUrl.toString(), filename, sitemaps.length),
                cb
              );
            }
          );
        } else if (sitemaps.length) {
          savedOnDiskSitemapPaths.push(sitemapPath);
          cpFile(sitemaps[0], sitemapPath).then(() => {
            fs.unlink(sitemaps[0], cb);
          });
        } else {
          cb();
        }
      };

      if (options.recommendAlternatives) {
        recommendAlternatives();
      }

      for (let url of cachedResultURLs) {
        sitemap.addURL(url);
      }
      sitemap.flush();
      // Wait extra 10 seconds to make sure that sitemaps been saved on disk
      //TODO: Refactor
      setTimeout(finish, 10000);
    };
    // Wait extra 10 seconds to make sure that all pages were handled
    setTimeout(init, 10000);
  };

  crawler.on('fetch404', ({url}) => emitError(404, url));
  crawler.on('fetchtimeout', ({url}) => emitError(408, url));
  crawler.on('fetch410', ({url}) => emitError(410, url));
  crawler.on('fetcherror', (queueItem, response) =>
    emitError(response.statusCode, queueItem.url)
  );

  crawler.on('fetchclienterror', (queueError, errorData) => {
    if (errorData.code === 'ENOTFOUND') {
      throw new Error(`Site "${parsedUrl.href}" could not be found.`);
    } else {
      emitError(400, errorData.message);
    }
  });

  crawler.on('fetchdisallowed', ({url}) => emitter.emit('ignore', url));

  // fetch complete event
  crawler.on('fetchcomplete', (queueItem, page) => {
    const {url, depth} = queueItem;
    // check if robots noindex is present
    if (/<meta(?=[^>]+noindex).*?>/.test(page)) {
      emitter.emit('ignore', queueItem);
    } else if (isValidURL(url)) {
      addURL(url, depth).then(() => {
        emitter.emit('add', queueItem);
      }).catch((error) => {
        console.log(error);
      });
    } else {
      emitError('404', url);
    }
  });

  crawler.on('complete', onCrawlerComplete);
  emitter.on('add', (queueItem, page) => {
    stats.add++;
  });
  emitter.on('ignore', (queueItem, page) => {
    stats.ignore++;
  });
  emitter.on('error', (queueItem, page) => {
    stats.error++;
  });

  return {
    getStats,
    start,
    stop,
    queueURL,
    on: emitter.on,
    off: emitter.off,
    getPaths,
    createSitemapFromURLs
  };
};
