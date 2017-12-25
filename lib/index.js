const fs = require('fs');
const http = require('http');
const path = require('path');
const parseURL = require('url-parse');
const each = require('async/each');
const cpFile = require('cp-file');
const cheerio = require('cheerio')
const request = require('request');

const createCrawler = require('./createCrawler');
const SitemapRotator = require('./SitemapRotator');
const createSitemapIndex = require('./createSitemapIndex');
const extendFilename = require('./helpers/extendFilename');
const Logger = require('./Logger');

module.exports = function SitemapGenerator(uri, opts) {
  const defaultOpts = {
    ignoreHreflang: true,
    stripQuerystring: true,
    maxEntriesPerFile: 50000,
    crawlerMaxDepth: 0,
    filepath: path.join(process.cwd(), 'sitemap.xml'),
    userAgent: 'Node/SitemapGenerator',
  };

  const options = Object.assign({}, defaultOpts, opts);
  if(!options.ignoreHreflang){
    // Increase limit becuase sitemap will be generated for every hreflang
    options.maxEntriesPerFile = 1000000;
  }
  const { log, on, off, stats } = Logger();

  let status = 'waiting';

  const setStatus = newStatus => {
    status = newStatus;
  };

  const getStatus = () => status;

  const getStats = () => ({
    added: stats.add || 0,
    ignored: stats.ignore || 0,
    errored: stats.error || 0,
  });

  const paths = [];

  const getPaths = () => paths;

  const parsedUrl = parseURL(uri);
  const sitemapPath = path.resolve(options.filepath);

  if (parsedUrl.protocol === '') {
    throw new TypeError('Invalid URL.');
  }

  // we don't care about invalid certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const crawler = createCrawler(parsedUrl, options);

  const start = () => {
    setStatus('started');
    crawler.start();
  };

  const stop = () => {
    setStatus('stopped');
    crawler.stop();
  };

  const queueURL = url => {
    crawler.queueURL(url, undefined, false);
  };

  const detectUrlLang = (urlObj) => {
    const init = (resolve, reject) => {
      request({
        method: 'GET',
        url: urlObj.value
      }, function(err, response, body) {

        if (err) return reject(err);
        const $ = cheerio.load(body)
        urlObj.lang = $('html').attr('lang');

        // Extract all languages and urls from head
        $('head').find('link[rel="alternate"]').each(function (i, elem) {
          let hreflang = $(this).attr('hreflang');
          let hreflangUrl = $(this).attr('href');

          if (urlObj.value === hreflangUrl) {
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
      });
    };
    let promise = new Promise(init);

    return promise;
  }

  // create sitemap stream
  const sitemap = SitemapRotator(options.maxEntriesPerFile);

  const logError = (code, url) => {
    log('error', {
      code,
      message: http.STATUS_CODES[code],
      url,
    });
  };

  crawler.on('fetch404', ({ url }) => logError(404, url));
  crawler.on('fetchtimeout', ({ url }) => logError(408, url));
  crawler.on('fetch410', ({ url }) => logError(410, url));
  crawler.on('fetcherror', (queueItem, response) =>
    logError(response.statusCode, queueItem.url)
  );

  crawler.on('fetchclienterror', (queueError, errorData) => {
    if (errorData.code === 'ENOTFOUND') {
      throw new Error(`Site "${parsedUrl.href}" could not be found.`);
    } else {
      logError(400, errorData.message);
    }
  });

  crawler.on('fetchdisallowed', ({ url }) => log('ignore', url));

  // fetch complete event
  crawler.on('fetchcomplete', (queueItem, page) => {
    const { url } = queueItem;
    let urlObj = {value: url, flushed: false, alternatives: []};
    // check if robots noindex is present
    if (/<meta(?=[^>]+noindex).*?>/.test(page)) {
      log('ignore', url);
    } else {
      log('add', url);
      if(options.ignoreHreflang){
        sitemap.addURL(urlObj);
      }
      else{
        detectUrlLang(urlObj).then(result => {
          urlObj = result;
        sitemap.addURL(urlObj);
      }).catch((error) => {
          logError(500, error.message);
      });
      }
    }
  });

  crawler.on('complete', () => {
    sitemap.flush();
    sitemap.finish();

    const sitemaps = sitemap.getPaths();

    const cb = () => {
      setStatus('done');
      log('done', getStats());
    };

    // move files
    if (sitemaps.length > 1) {
      // multiple sitemaps
      let count = 1;
      each(
        sitemaps,
        (tmpPath, done) => {
          const newPath = extendFilename(sitemapPath, `_part${count}`);
          paths.push(newPath);

          // copy and remove tmp file
          cpFile(tmpPath, newPath).then(() => {
            fs.unlink(tmpPath, () => {
              done();
            });
          });

          count += 1;
        },
        () => {
          paths.unshift(sitemapPath);
          const filename = path.basename(sitemapPath);
          fs.writeFile(
            sitemapPath,
            createSitemapIndex(parsedUrl.toString(), filename, sitemaps.length),
            cb
          );
        }
      );
    } else if (sitemaps.length) {
      paths.unshift(sitemapPath);
      cpFile(sitemaps[0], sitemapPath).then(() => {
        fs.unlink(sitemaps[0], cb);
      });
    } else {
      cb();
    }
  });

  return {
    getPaths,
    getStats,
    getStatus,
    start,
    stop,
    queueURL,
    on,
    off,
  };
};
