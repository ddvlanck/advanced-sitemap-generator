const Crawler = require('simplecrawler');
const has = require('lodash/has');

const stringifyURL = require('./helpers/stringifyURL');

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
  let exlcudeURLsArray = ['%&%&%_'];
  const exclude = (options.excludeFileTypes ? options.excludeFileTypes : exlcudeDefaultArray).join('|');
  const excludeURLs = (options.excludeURLs ? options.excludeURLs : exlcudeURLsArray).join('|');
  console.log(exclude);
  const extRegex = new RegExp(`\\.(${exclude})$`, 'i');
  const urlRegex = new RegExp(`\\${excludeURLs}`, 'i');

  const crawler = new Crawler(uri.href);

  Object.keys(options).forEach(o => {
    if (has(crawler, o)) {
      crawler[o] = options[o];
    } else if (o === 'crawlerMaxDepth') {
      // eslint-disable-next-line
      console.warn(
        'Option "crawlerMaxDepth" is deprecated. Please use "maxDepth".'
      );
      if (!options.maxDepth) {
        crawler.maxDepth = options.crawlerMaxDepth;
      }
    }
  });

  // set crawler options
  // see https://github.com/cgiffard/node-simplecrawler#configuration
  crawler.initialPath = uri.pathname !== '' ? uri.pathname : '/';
  crawler.initialProtocol = uri.protocol.replace(':', '');

  // restrict to subpages if path is provided
  crawler.addFetchCondition(parsedUrl => {
    const initialURLRegex = new RegExp(`${uri.pathname}.*`);
    return stringifyURL(parsedUrl).match(initialURLRegex);
  });

  // file type and urls exclusion
  crawler.addFetchCondition(parsedUrl => {
    if(parsedUrl.path.lastIndexOf('.css?ver') !== -1){
      console.log(parsedUrl.path, !parsedUrl.path.match(extRegex));
    }
    
    return !parsedUrl.path.match(extRegex) && !parsedUrl.path.match(extRegex);
  });

  return crawler;
};
