const fs = require('fs');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const path = require('path');
const parseURL = require('url-parse');
const cpFile = require('cp-file');
const cheerio = require('cheerio');
const urlParser = require('url');
const normalizeUrl = require('normalize-url');
const cld = require('cld');
const eachSeries = require('async/eachSeries');
const mitt = require('mitt');
const urlExists = require('url-exists');
const async = require('async');

const createCrawler = require('./createCrawler');
const SitemapRotator = require('./SitemapRotator');
const createSitemapIndex = require('./createSitemapIndex');
const extendFilename = require('./helpers/extendFilename');
const validChangeFreq = require('./helpers/validChangeFreq');
const getLangCodeMap = require('./helpers/getLangCodeMap');
const isValidURL = require('./helpers/isValidURL');
const msg = require('./helpers/msg-helper');
const getCurrentDateTime = require('./helpers/getCurrentDateTime');

module.exports = function SitemapGenerator(uri, opts) {
  const defaultOpts = {
    stripQuerystring: true,
    maxEntriesPerFile: 50000,
    filterByDomain: true,
    ignoreWWWDomain: true,
    maxDepth: 0,
    maxConcurrency: 10,
    filepath: path.join(process.cwd(), 'sitemap.xml'),
    userAgent: 'Node/SitemapGenerator',
    respectRobotsTxt: true,
    ignoreInvalidSSL: true,
    replaceByCanonical: true,
    recommendAlternatives: false,
    timeout: 120000,
    decodeResponses: true,
    lastModEnabled: true,
    changeFreq: '',
    priorityMap: [],
    forcedURLs: []
  };
  if (!uri) {
    throw new Error('Requires a valid URL.');
  }

  const options = Object.assign({}, defaultOpts, opts);

  let cachedResultURLs = [];
  let realCrawlingDepth = 0;
  let savedOnDiskSitemapPaths = [];

  let queuedItems = [];
  let schadulerId = '';
  let isCrawling = false;

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
  };
  const addBaseSitemapURLs = () => {
    for (const url of options.forcedURLs) {
      url.depth = 100;
      url.flushed = false;
      url.lastMod = '';
      cachedResultURLs.push(url);
    }
  };
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
    isCrawling = true;
    clearInterval(schadulerId);
    triggerSchadulers(options.interval);

    cachedResultURLs = [];
    addBaseSitemapURLs();

    //Add initial URL
    crawler.queueURL(uri, {}, true);
    crawler.start();
  };

  const stop = () => {
    if (!isCrawling) {
      return;
    }

    isCrawling = false;
    clearInterval(schadulerId);
    crawler.stop();

    setTimeout(() => {
      onCrawlerComplete();
      msg.error('STOPPING THE CRAWLER');
    }, 60000);

  };
  const createSitemapFromURLs = (urls) => {
    for (let urlObj of urls) {
      sitemap.addURL(urlObj);
    }
    onCrawlerComplete();
  };
  const queueURL = url => {
    crawler.queueURL(url, undefined, false);
  };

  const guessHTMLLang = (html) => {
    const $ = cheerio.load(html);
    const init = (resolve, reject) => {
      let lang = $('html').attr('lang') ? $('html').attr('lang') : '';
      if (lang !== '') {
        resolve(lang);
      } else {
        cld.detect(html, { isHTML: true }, function(err, result) {
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
  const detectUrlLang = (urlObj, body) => {
    const init = (resolve, reject) => {
      const $ = cheerio.load(body);

      guessHTMLLang(body).then(lang => {
        urlObj.lang = lang;
        // Extract all languages and urls from head
        $('head').find('link[rel="alternate"]').each(function() {
          let hreflang = $(this).attr('hreflang');
          let hreflangUrl = $(this).attr('href').replace('\n', '').trim();

          if (hreflangUrl !== '' && normalizeUrl(urlObj.value, { normalizeHttps: true }) === normalizeUrl(hreflangUrl, { normalizeHttps: true })) {
            // Update the original URL by it's main language
            urlObj.lang = hreflang;
          }
          if (typeof hreflang !== typeof undefined && hreflang !== false && hreflangUrl !== '') {
            urlObj.alternatives.push({
              value: hreflangUrl,
              flushed: false,
              lang: hreflang
            });
          }
        });
        resolve(urlObj);
      }).catch((error) => {
        reject(error);
      });
    };

    let promise = new Promise(init);
    return promise;
  };

  // create sitemap stream
  const sitemap = SitemapRotator(options);

  const emitError = (code, url) => {
    emitter.emit('error', {
      code,
      message: http.STATUS_CODES[code],
      url
    });
  };
  const triggerSchadulers = (interv) => {
    schadulerId = setInterval(() => {
      if (!isCrawling && queuedItems.length === 0) {
        return clearInterval(schadulerId);
      } else if (isCrawling && queuedItems.length === 0) {
        msg.info('WAITING FOR FETCHED URLs...');
        return;
      }
      const items = queuedItems.splice(0, options.maxConcurrency);
      for (const queueItem of items) {
        const { url, depth, busy } = queueItem;
        if (busy) {
          msg.info('SKIPPING ' + url);
          return;
        }
        queueItem.busy = true;
        // msg.yellowBright('ADDING PROCESS FOR: ' + url);
        const lastMod = options.lastModEnabled ? queueItem.stateData.headers['last-modified'] : null;
        addURL(url, depth, lastMod).then(() => {
          msg.yellowBright('ADDING PROCESS FOR: ' + url + ' WAS DONE');
          emitter.emit('add', queueItem);
        }).catch((error) => {
          if (!error) {
            return;
          }
          msg.error('========');
          msg.error('Error during adding the following URL: ' + url);
          msg.error(error);
          msg.error('========');
        });
      }
    }, interv);
  };
  const addURL = (url, depth, lastMod) => {
    url = url.trim().replace('\n', '');
    msg.info('ADDING: ' + url);
    let urlObj = {
      value: url, depth: depth, lastMod: getCurrentDateTime(lastMod),
      flushed: false, alternatives: [], lang: 'en'
    };

    const getHTML = (done) => {
      // msg.yellow('RETRIEVING HTML FOR: ' + urlObj.value);
      var options = urlParser.parse(urlObj.value);
      options.maxRedirects = 10;
      const protocol = urlObj.value.indexOf('https://') !== -1 ? https : http;
      protocol.get(options, (res) => {
        let html = '';
        res.on('data', (chunk) => {
          html += chunk;
        });
        res.on('end', () => {
          // msg.green('HTML DOWNLOADED FOR: ' + url);
          done(null, html);
        });
      }).on('error', (err) => {
        done(err);
      });
    };

    const init = (resolve, reject) => {
      const mergeURLObj = (from, to) => {
        to.depth = to.depth > from.depth ? depth : from.depth;
        to.lastMod = to.lastMod === '' ? from.lastMod : to.lastMod;
        for (const fromAlter of from.alternatives) {
          const isExisted = to.alternatives.filter((item) => {
            return normalizeUrl(item.value, { normalizeHttps: true }) === normalizeUrl(fromAlter.value, { normalizeHttps: true });
          }).length;
          if (!isExisted) {
            to.alternatives.push(fromAlter);
          }
        }
      };
      const handleURL = (isNotBroken, body) => {
        if (!isNotBroken) {
          emitError(404, 'URL IS BROKEN');
          reject();
        } else {
          detectUrlLang(urlObj, body).then(result => {
            urlObj = result;
            let existedURL = cachedResultURLs.filter(function(item) {
              return normalizeUrl(urlObj.value, { normalizeHttps: true }) === normalizeUrl(item.value, { normalizeHttps: true });
            });

            if (existedURL.length) {
              mergeURLObj(urlObj, existedURL[0]);
              emitError(200, 'URL WAS CRAWLED BEFORE');
              reject();
            }
            else if (existedURL.length === 0) {
              cachedResultURLs.push(urlObj);
              resolve(urlObj);
            }

          }).catch((error) => {
            emitError(500, error.message);
            reject(error);
          });
        }
      };
      urlExists(url, function(err, isNotBroken) {
        getHTML(function(err, body) {
          if (err) {
            msg.error(err);
            return;
          }
          const $ = cheerio.load(body);
          if (options.replaceByCanonical) {
            let canonicalURL = '';
            $('head').find('link[rel="canonical"]').each(function() {
              canonicalURL = $(this).attr('href').replace('\n', '').trim();
            });
            urlExists(canonicalURL, function(err, isCanNotBroken) {
              if (isCanNotBroken) {
                urlObj.value = canonicalURL;
                getHTML(function(err, body) {
                  handleURL(isCanNotBroken, body);
                });
              }
              else {
                handleURL(isNotBroken, body);
              }
            });
          } else {
            handleURL(isNotBroken, body);
          }

        });
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

          let isAlternativeAddedBefore = url.alternatives.filter(function(alter) {

            return (normalizeUrl(alter.value, { normalizeHttps: true }) === normalizeUrl(otherURL.value, { normalizeHttps: true })) || alter.lang === otherURL.lang;
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

        let isSelfRefrencingAlternativeAddedBefore = url.alternatives.filter(function(alter) {
          //IF THE URL WAS ADDED BEFORE OR THERE IS ANOTHER ONE FOR THIS LANG
          return (normalizeUrl(alter.value, { normalizeHttps: true }) === normalizeUrl(url.value, { normalizeHttps: true })) || alter.lang === url.lang;
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
    };
    const init = () => {
      msg.green('CRAWLER COMPLETE CRAWLING THE WEBSITE');

      isCrawling = false;
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
              (async () => {
                await cpFile(tmpPath, newPath);
                fs.unlink(tmpPath, () => {
                  done();
                });
              })();

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

          (async () => {
            await cpFile(sitemaps[0], sitemapPath);
            msg.green('MOVING SITEMAP TO THE TARGET DIR: ' + sitemapPath);
            fs.unlink(sitemaps[0], cb);
          })();
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

    // Wait extra 30 seconds to make sure that all pages were handled
    setTimeout(init, 30000);
  };

  crawler.on('fetch404', ({ url }) => emitError(404, url));
  crawler.on('fetchtimeout', ({ url }) => emitError(408, url));
  crawler.on('fetch410', ({ url }) => emitError(410, url));
  crawler.on('invaliddomain', ({ url }) => emitError(403, url));

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

  crawler.on('fetchdisallowed', ({ url }) => emitter.emit('ignore', url));

  // fetch complete event
  crawler.on('fetchcomplete', (queueItem, page) => {
    const { url } = queueItem;
    // msg.info('FETCH COMPLETE FOR ' + url);
    // check if robots noindex is present
    if (/<meta(?=[^>]+noindex).*?>/.test(page)) {
      emitter.emit('ignore', queueItem);
    } else if (isValidURL(url)) {
      queueItem.busy = false;
      queuedItems.push(queueItem);

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
