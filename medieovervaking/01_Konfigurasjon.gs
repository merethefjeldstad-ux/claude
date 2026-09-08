/**
 * 01_Konfigurasjon.gs
 *
 * Samler alle faste innstillinger pa ett sted: navn pa faner (ark),
 * hvilken kolonne som er hva, samt hjelpefunksjoner for a lese inn
 * data fra regnearket og skrive resultater tilbake.
 *
 * Hvis du endrer navn pa en fane i regnearket, MA du ogsa endre
 * konstanten under - ellers finner ikke skriptet fanen.
 */

// ---------------------------------------------------------------------
// Navn pa fanene (arkene) i regnearket
// ---------------------------------------------------------------------
var FANE_KILDER = 'Kilder';
var FANE_SOKEORD = 'Søkeord';
var FANE_MOTTAKERE = 'Mottakere';
var FANE_SENDTE_ARTIKLER = 'Sendte artikler';
var FANE_KJORINGSLOGG = 'Kjøringslogg';

// ---------------------------------------------------------------------
// Kolonnenumre (1-indeksert, samme telling som i Google Sheets: A=1, B=2 ...)
// ---------------------------------------------------------------------
var KILDER_KOLONNER = {
  NAVN: 1,
  URL: 2,
  KATEGORI: 3,
  STATUS: 4,
  SIST_VERIFISERT: 5,
  ANTALL_TREFF: 6
};

var SOKEORD_KOLONNER = {
  SOKEORD: 1,
  TIER: 2,
  KONTEKSTORD: 3
};

var MOTTAKERE_KOLONNER = {
  EPOST: 1
};

var SENDTE_KOLONNER = {
  URL: 1,
  DATO: 2,
  OVERSKRIFT: 3
};

var LOGG_KOLONNER = {
  TIDSPUNKT: 1,
  KILDE: 2,
  STATUS: 3,
  FEILMELDING: 4,
  ANTALL_TREFF: 5
};

// Tidssone brukt til datoformatering i e-post og logg
var TIDSSONE = 'Europe/Oslo';

// Hvor lenge (i millisekunder) skriptet kan bruke pa RSS-henting for det
// varsler og hopper over resterende kilder, for a rekke a bygge og sende
// e-posten innenfor Apps Scripts 6-minuttersgrense. Se 07_Hovedkjoring.gs.
var TIDSGRENSE_HENTING_MS = 5 * 60 * 1000;

/**
 * Leser inn alle kilder fra "Kilder"-fanen.
 * Rader uten navn eller URL hoppes stille over (regnes som tomme/ubrukte rader).
 *
 * @param {Spreadsheet} ss - det aktive regnearket
 * @return {Array<Object>} liste med {navn, url, kategori, radnummer}
 */
function hentKilder(ss) {
  var ark = ss.getSheetByName(FANE_KILDER);
  var sisteRad = ark.getLastRow();
  var kilder = [];
  if (sisteRad < 2) return kilder;

  var data = ark.getRange(2, 1, sisteRad - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    var rad = data[i];
    var navn = rad[KILDER_KOLONNER.NAVN - 1];
    var url = rad[KILDER_KOLONNER.URL - 1];
    if (!navn || !url) continue;

    kilder.push({
      navn: String(navn).trim(),
      url: String(url).trim(),
      kategori: String(rad[KILDER_KOLONNER.KATEGORI - 1] || 'Ukategorisert').trim(),
      // Det faktiske radnummeret i arket (rad 1 er overskrift, data starter pa rad 2)
      radnummer: i + 2
    });
  }
  return kilder;
}

/**
 * Leser inn alle sokeord fra "Sokeord"-fanen.
 * Kontekstord (kun brukt for Tier 2) splittes pa komma til en liste.
 *
 * @param {Spreadsheet} ss - det aktive regnearket
 * @return {Array<Object>} liste med {sokeord, tier, kontekstord[]}
 */
function hentSokeord(ss) {
  var ark = ss.getSheetByName(FANE_SOKEORD);
  var sisteRad = ark.getLastRow();
  var sokeord = [];
  if (sisteRad < 2) return sokeord;

  var data = ark.getRange(2, 1, sisteRad - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var rad = data[i];
    var ord = rad[SOKEORD_KOLONNER.SOKEORD - 1];
    if (!ord) continue;

    var tier = Number(rad[SOKEORD_KOLONNER.TIER - 1]) || 1;
    var kontekstTekst = rad[SOKEORD_KOLONNER.KONTEKSTORD - 1];
    var kontekstord = [];
    if (kontekstTekst) {
      kontekstord = String(kontekstTekst)
        .split(',')
        .map(function (k) { return k.trim(); })
        .filter(function (k) { return k.length > 0; });
    }

    sokeord.push({
      sokeord: String(ord).trim(),
      tier: tier,
      kontekstord: kontekstord
    });
  }
  return sokeord;
}

/**
 * Leser inn alle mottaker-e-poster fra "Mottakere"-fanen.
 * Rader uten gyldig "@" i teksten hoppes over.
 *
 * @param {Spreadsheet} ss - det aktive regnearket
 * @return {Array<string>} liste med e-postadresser
 */
function hentMottakere(ss) {
  var ark = ss.getSheetByName(FANE_MOTTAKERE);
  var sisteRad = ark.getLastRow();
  var mottakere = [];
  if (sisteRad < 2) return mottakere;

  var data = ark.getRange(2, MOTTAKERE_KOLONNER.EPOST, sisteRad - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var epost = data[i][0];
    if (epost && String(epost).indexOf('@') !== -1) {
      mottakere.push(String(epost).trim());
    }
  }
  return mottakere;
}

/**
 * Oppdaterer status, dato for siste vellykkede henting og antall treff
 * for en gitt kilde-rad i "Kilder"-fanen.
 *
 * @param {Spreadsheet} ss
 * @param {number} radnummer - faktisk radnummer i "Kilder"-fanen
 * @param {string} status - "OK", "FEILET" eller "IKKE_KJORT"
 * @param {Date|null} dato - dato for vellykket verifisering, eller null hvis ingen endring
 * @param {number} antallTreff
 */
function oppdaterKildeStatus(ss, radnummer, status, dato, antallTreff) {
  var ark = ss.getSheetByName(FANE_KILDER);
  ark.getRange(radnummer, KILDER_KOLONNER.STATUS).setValue(status);
  if (dato) {
    ark.getRange(radnummer, KILDER_KOLONNER.SIST_VERIFISERT).setValue(dato);
  }
  ark.getRange(radnummer, KILDER_KOLONNER.ANTALL_TREFF).setValue(antallTreff);
}

/**
 * Legger til en rad i korekjoringsloggen ("Kjoringslogg"-fanen).
 *
 * @param {Spreadsheet} ss
 * @param {string} kildeNavn
 * @param {string} status - "OK", "FEILET" eller "IKKE_KJORT"
 * @param {string} feilmelding - tom streng hvis ingen feil
 * @param {number} antallTreff
 */
function loggKjoring(ss, kildeNavn, status, feilmelding, antallTreff) {
  var ark = ss.getSheetByName(FANE_KJORINGSLOGG);
  ark.appendRow([new Date(), kildeNavn, status, feilmelding || '', antallTreff]);
}
