module.exports = (code) => {
  const langs = {
    'es': ['es', 'espanol', 'spanish'],
    'en': ['en', 'english']
  };
  return langs[code] ? langs[code] : [];
};
