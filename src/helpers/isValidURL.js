const validUrl = require('valid-url');
module.exports = (str) => {
  return validUrl.isUri(str);
};

