module.exports = (code) => {
  const langs = {
    'es': ['es', 'espanol', 'spanish'],
    'en': ['en', 'english'],
    'fr': ['fr', 'french']
  };
  return langs[code] ? langs[code] : [];
};
