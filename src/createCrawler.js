const Crawler = require('simplecrawler');
const URLParser = require('url');
const has = require('lodash/has');

const discoverResources = require('./discoverResources');
const stringifyURL = require('./helpers/stringifyURL');
const msg = require('./helpers/msg-helper');

module.exports = (uri, options = {}) => {
  // excluded filetypes
  let exlcudeDefaultArray = [
    'gif',
    'jpg',
    'jpeg',
    'png',
    'ico',
    'bmp',
    'ogg',
    'webp',
    'mp4',
    'webm',
    'mp3',
    'ttf',
    'woff',
    'woff2',
    'eot',
    'json',
    'rss',
    'atom',
    'gz',
    'zip',
    'rar',
    '7z',
    'css',
    'js',
    'gzip',
    'exe',
    'svg',
    'xml'
  ];
  let exlcudeURLsArray = ['/wp-json/'];
  const exclude = (options.excludeFileTypes
      ? options.excludeFileTypes
      : exlcudeDefaultArray
  ).join('|');
  const excludeURLs = (options.excludeURLs
      ? options.excludeURLs
      : exlcudeURLsArray
  ).join('|');

  const extRegex = new RegExp(`\\.(${exclude})$`, 'i');
  const urlRegex = new RegExp(`\\${excludeURLs}`, 'i');

  const crawler = new Crawler(uri.href);

  Object.keys(options).forEach(o => {
    if (has(crawler, o)) {
      crawler[o] = options[o];
    } else if (o === 'crawlerMaxDepth') {
      // eslint-disable-next-line
      msg.warnings('Option "crawlerMaxDepth" is deprecated. Please use "maxDepth".');
      if (!options.maxDepth) {
        crawler.maxDepth = options.crawlerMaxDepth;
      }
    }
  });

  // use custom discoverResources function
  crawler.discoverResources = discoverResources().getLinks;

  // set crawler options
  // see https://github.com/cgiffard/node-simplecrawler#configuration
  crawler.initialPath = uri.pathname !== '' ? uri.pathname : '/';
  crawler.initialProtocol = uri.protocol.replace(':', '');

  // restrict to subpages if path is provided
  crawler.addFetchCondition((parsedUrl, referrer, done) => {
    const initialURLRegex = new RegExp(`${uri.pathname}.*`);
    // console.log(1, uri.pathname, stringifyURL(parsedUrl), stringifyURL(parsedUrl).match(initialURLRegex));
    done(null, stringifyURL(parsedUrl).match(initialURLRegex));
  });
  if(options.filterByDomain){
    crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
      // We only ever want to move one step away from example.com, so if the
      // referrer queue item reports a different domain, don't proceed
      // console.log(2, referrerQueueItem.host, referrerQueueItem.host === crawler.host);
      callback(null, referrerQueueItem.host === crawler.host);
    });
  }

  // file type and urls exclusion
  crawler.addFetchCondition((parsedUrl, referrer, done) => {
    done(null, !parsedUrl.path.match(extRegex) && !parsedUrl.path.match(urlRegex));
  });

  return crawler;
};
