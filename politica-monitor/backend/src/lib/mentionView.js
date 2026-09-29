const { topWords } = require('../scrapers/base');

// Los scrapers guardan los comentarios en dos lugares distintos según de dónde
// vengan: `commentsList` (objetos {text, sentiment} ya analizados al guardar) y
// `extra.comments` (strings crudos del actor de Apify). El front no tiene por
// qué conocer esa historia: esta capa aplana todo a una forma sola.
//
// Sin esto el front leía `mention.comments`, que no existe en ningún documento,
// y la sección de comentarios nunca se mostraba aunque hubiera 20 guardados.
function normalizeComments(mention) {
  const list = Array.isArray(mention.commentsList) ? mention.commentsList : [];
  if (list.length > 0) {
    return list
      .map(c => (typeof c === 'string'
        ? { text: c, sentiment: null, author: null }
        : { text: c.text || '', sentiment: c.sentiment || null, author: c.author || null }))
      .filter(c => c.text);
  }

  const raw = Array.isArray(mention.extra?.comments) ? mention.extra.comments : [];
  return raw
    .map(c => (typeof c === 'string' ? { text: c, sentiment: null, author: null } : c))
    .filter(c => c && c.text);
}

// Forma de una mención tal como la consume el front. Deja los campos crudos
// intactos (para no romper nada que ya los use) y agrega los derivados.
function toMentionView(mention) {
  const comments = normalizeComments(mention);

  // `extra.commentsTopWords` lo calcula el scraper de Apify, pero las menciones
  // de otras fuentes no lo traen. Si falta, se calcula acá sobre los textos.
  const commentsTopWords = mention.extra?.commentsTopWords?.length
    ? mention.extra.commentsTopWords
    : topWords(comments.map(c => c.text).join(' '), 5);

  return {
    ...mention,
    comments,
    commentsCount: comments.length,
    commentsTopWords,
    topWords: mention.extra?.topWords?.length
      ? mention.extra.topWords
      : topWords(mention.content || '', 3),
  };
}

module.exports = { toMentionView, normalizeComments };
