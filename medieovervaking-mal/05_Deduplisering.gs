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
 * Legger til nye artikler i "Sendte artikler"-fanen etter vellykket
 * utsending, inkludert AI-vurdering (relevans + notat) hvis den finnes.
 *
 * @param {Spreadsheet} ss
 * @param {Array<Object>} nyeTreff - liste med treffobjekter, dvs.
 *   {lenke, tittel, ...}. aiRelevant/aiNotat er valgfrie felt - treff som
 *   ikke ble AI-vurdert (AI avslatt, tidsbudsjett brukt opp, feil) lagres
 *   med "ikke vurdert".
 */
function leggTilSendteUrler(ss, nyeTreff) {
  if (nyeTreff.length === 0) return;

  var ark = ss.getSheetByName(FANE_SENDTE_ARTIKLER);
  sikreSendteArtiklerKolonner(ark);

  var naa = new Date();
  var rader = nyeTreff.map(function (t) {
    var relevantTekst = (t.aiRelevant === true) ? 'ja' :
      (t.aiRelevant === false) ? 'nei' : 'ikke vurdert';
    return [t.lenke, naa, t.tittel, relevantTekst, t.aiNotat || ''];
  });

  ark.getRange(ark.getLastRow() + 1, 1, rader.length, 5).setValues(rader);
}

/**
 * Sikrer at "Sendte artikler"-fanen har de 5 kolonnene (inkl. AI-kolonnene
 * lagt til for Fase 2). Eldre ark som kun hadde URL/Dato/Overskrift far
 * de to nye kolonneoverskriftene lagt til automatisk - ingen manuell
 * oppdatering av eksisterende ark er nodvendig.
 *
 * @param {Sheet} ark
 */
function sikreSendteArtiklerKolonner(ark) {
  if (ark.getLastColumn() >= 5) return;

  var overskrifter = ['URL', 'Dato lagt til', 'Overskrift', 'AI Relevant', 'AI Notat'];
  ark.getRange(1, 1, 1, overskrifter.length).setValues([overskrifter]);
  ark.getRange(1, 1, 1, overskrifter.length).setFontWeight('bold');
}
