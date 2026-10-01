/**
 * 05_Deduplisering.gs
 *
 * Hindrer at samme artikkel sendes i e-post flere ganger pa tvers av
 * dager (f.eks. hvis en RSS-feed fortsatt lister en artikkel fra i gar
 * fordi kilden har justert publiseringstidspunktet).
 *
 * Fremgangsmate: alle URL-er som noen gang er sendt ligger i fanen
 * "Sendte artikler". For hver artikkel som ellers ville blitt tatt med
 * i e-posten, sjekkes URL-en mot denne listen forst.
 */

/**
 * Leser inn alle tidligere sendte URL-er som et oppslagsobjekt (fungerer
 * som et "set" - rask sjekk med "url in urlSet" eller "urlSet[url]").
 *
 * @param {Spreadsheet} ss
 * @return {Object} objekt der nokkel = URL, verdi = true
 */
function hentSendteUrler(ss) {
  var ark = ss.getSheetByName(FANE_SENDTE_ARTIKLER);
  var sisteRad = ark.getLastRow();
  var urlSet = {};

  if (sisteRad < 2) return urlSet;

  var data = ark.getRange(2, SENDTE_KOLONNER.URL, sisteRad - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var url = data[i][0];
    if (url) urlSet[url] = true;
  }
  return urlSet;
}

/**
 * Legger til nye URL-er i "Sendte artikler"-fanen etter vellykket utsending.
 *
 * @param {Spreadsheet} ss
 * @param {Array<Object>} nyeArtikler - liste med {url, tittel}
 */
function leggTilSendteUrler(ss, nyeArtikler) {
  if (nyeArtikler.length === 0) return;

  var ark = ss.getSheetByName(FANE_SENDTE_ARTIKLER);
  var naa = new Date();
  var rader = nyeArtikler.map(function (a) {
    return [a.url, naa, a.tittel];
  });

  ark.getRange(ark.getLastRow() + 1, 1, rader.length, 3).setValues(rader);
}
