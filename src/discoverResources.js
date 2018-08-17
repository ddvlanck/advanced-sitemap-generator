const url = require('url');
const cheerio = require('cheerio');
const superagent = require('superagent-interface-promise');

let browser = null;
const discoverWithCheerio = (buffer, queueItem) => {
  queueItem.plainHTML = buffer.body ? buffer.body : buffer.toString('utf8');
  queueItem.canonical = [];
  const $ = cheerio.load(queueItem.plainHTML);
  const metaRobots = $('meta[name="robots"]');

  if (
    metaRobots &&
    metaRobots.length &&
    /nofollow/i.test(metaRobots.attr('content'))
  ) {
    return [];
  }

  const html = $('a[href], link[rel="canonical"]');
  const links = html.map(function iteratee() {
    let href = $(this).attr('href');
    if (!href || href === '') {
      return null;
    }
    // exclude "mailto:" etc
    if (/^[a-z]+:(?!\/\/)/i.test(href)) {
      return null;
    }

    // exclude rel="nofollow" links
    const rel = $(this).attr('rel');
    if (/nofollow/i.test(rel)) {
      return null;
    }
    else if (rel === 'canonical') {
      queueItem.canonical.push(href);
    }

    // remove anchors
    href = href.replace(/(#.*)$/, '');

    // handle "//"
    if (/^\/\//.test(href)) {
      return `${queueItem.protocol}:${href}`;
    }

    // check if link is relative
    // (does not start with "http(s)" or "//")
    if (!/^https?:\/\//.test(href)) {
      const base = $('base').first();
      if (base && base.length) {
        // base tag is set, prepend it
        if (base.attr('href') !== undefined) {
          // base tags sometimes don't define href, they sometimes they only set target="_top", target="_blank"
          href = url.resolve(base.attr('href'), href);
        }
      }

      // handle links such as "./foo", "../foo", "/foo"
      if (/^\.\.?\/.*/.test(href) || /^\/[^/].*/.test(href)) {
        href = url.resolve(queueItem.url, href);
      }
    }
    return href;
  });
  return links.get();
};
const getHTMLWithHeadlessBrowser = async (url) => {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en'
  });

  const result = { url: url, body: '', endURL: url };
  try {
    await page.goto(url, {
      waitLoad: true,
      waitNetworkIdle: true,
      timeout: 3000000
    });
    await page.waitFor(15000);
    result.body = await page.evaluate('new XMLSerializer().serializeToString(document.doctype) + document.documentElement.outerHTML');
    result.endURL = await page.evaluate('window.location.origin');
    await page.close();

  } catch (ex) {
    console.log(ex);
  }
  return result;
};
const getHTML = async (url) => {
  return superagent.get(url);
};
const discoverWithHeadlessBrowser = async (buffer, queueItem) => {

  const url = queueItem.url;
  const data = await getHTMLWithHeadlessBrowser(url);
  console.log('PUPPETTEER: ' + url);

  return discoverWithCheerio(data, queueItem);
};
module.exports = (optionalBrowser) => {
  browser = optionalBrowser;
  return {
    getLinks: browser ? discoverWithHeadlessBrowser : discoverWithCheerio,
    getHTML: getHTML,
    getHTMLWithHeadlessBrowser: getHTMLWithHeadlessBrowser
  };
};
