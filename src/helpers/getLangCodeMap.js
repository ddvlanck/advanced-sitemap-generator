module.exports = (code) => {
  const langs = {
    'es': ['espanol', 'spanish', 'es'],
    'en': ['english', 'en'],
    'fr': ['french', 'fr']
  };
  return langs[code] ? langs[code] : [];
};
