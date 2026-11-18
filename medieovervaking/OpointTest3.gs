/**
 * OpointTest3.gs
 *
 * Tre frittstående tester av Opoint Search API, kjøres KUN manuelt fra
 * editoren:
 *   opoint_test3_referansesett() → fane "Opoint-test 3 referansesett"
 *   opoint_test4_navn()          → fane "Opoint-test 4 navn"
 *   opoint_test5_norsk()         → fane "Opoint-test 5 norsk"
 *
 * Ingen trigger, ingen e-post, ingen Anthropic-kall. Hver funksjon tømmer
 * og skriver KUN sin egen fane. "Referansesett" leses, men endres aldri.
 *
 * Avhenger av Opoint.gs (kalles, endres ikke): OPOINT_URL, opointTolkSvar,
 * opointHentDokumenter, opointHentContext, opointTekstFelt, opointKort,
 * opointMaskerNokkel, opointTellIdentiske, opoint_byggBody,
 * opoint_harErrors, opoint_language, opoint_firstSource, OPOINT_T2_SPORRINGER.
 *
 * Fra api-docs.opoint.com/references/response-format: "url" er en lenke til
 * Opoints visning av artikkelen, "orig_url" er adressen der artikkelen ble
 * funnet, "url_common" er domenet. Testene bruker derfor orig_url først.
 * Fra references/search-syntax: header:-prefikset må stå på hvert ledd;
 * ord med stor bokstav matcher bare samme skrivemåte, små bokstaver matcher
 * alle; ord* matcher ord som begynner med "ord" (minst 3 tegn før *);
 * lang:no filtrerer på språk.
 */

var OPOINT_T3_TIDSSONE = 'Europe/Oslo';
var OPOINT_T3_PAUSE_MS = 1000;
var OPOINT_T3_SAMMENDRAG_MAKS = 300;

// --- Test 3: referansesett ---
var OPOINT_T3_FANE_KILDE = 'Referansesett';
var OPOINT_T3_FANE = 'Opoint-test 3 referansesett';
var OPOINT_T3_MAKS_KALL = 60;
var OPOINT_T3_REQUESTED = 10;
var OPOINT_T3_DAGER_RUNDT_DATO = 3;
var OPOINT_T3_DAGER_UTEN_DATO = 90;
var OPOINT_T3_TITTELGRENSE = 0.8;
var OPOINT_T3_MAKS_FALLBACK_ORD = 5;

// Overskrifter som gjenkjennes (sammenlignes i små bokstaver, uten mellomrom i endene).
var OPOINT_T3_KOLONNENAVN = {
  tittel: ['overskrift', 'tittel', 'title', 'header', 'headline'],
  url: ['url', 'lenke', 'link', 'artikkel-url', 'artikkel url'],
  dato: ['dato', 'publiseringsdato', 'publisert', 'publiseringstid', 'date', 'published', 'pubdate'],
  sprak: ['språk', 'sprak', 'language', 'lang']
};

// Stoppord for fallback-søket (engelsk + norsk). Ord under 3 tegn droppes uansett.
var OPOINT_T3_STOPPORD = ('the and for with from that this into over after about than are was were will has have ' +
  'its new how why what when who says said can could not but more most out off all also via per amid ' +
  'og for med fra som det den til har ikke kan vil skal blir ble etter over under mot nye nytt ' +
  'første siste mer enn eller men hvor hva når hvem slik sier').split(' ');

// --- Test 4: navn i brødtekst ---
var OPOINT_T4_FANE = 'Opoint-test 4 navn';
var OPOINT_T4_MAKS_KALL = 40;
var OPOINT_T4_REQUESTED = 25;
var OPOINT_T4_MAKS_BATCHER = 4;
var OPOINT_T4_DAGER = 30;
var OPOINT_T4_GRENSE_ENKELTSOK = 8; // under 8 navn → ett søk per navn, ellers ett samlet OR-søk

// --- Test 5: norsk dekning ---
var OPOINT_T5_FANE = 'Opoint-test 5 norsk';
var OPOINT_T5_MAKS_KALL = 20;
var OPOINT_T5_REQUESTED = 25;
var OPOINT_T5_MAKS_BATCHER = 2;
var OPOINT_T5_DAGER = 7;

// Maritim kontekst, felles for alle temaene. Ordvalg:
// skip* (skip, skipet, skipsfart, skipsreder …), fartøy* (fartøy, fartøyet),
// ferge*/ferje* (begge skrivemåter, ferga/ferja/fergen), rederi* (rederi,
// rederiet, rederier), havn/havna/havnen (IKKE havn*, fordi det også
// treffer verbet "havnet"/"havner").
var OPOINT_T5_MARITIM = '(skip* OR fartøy* OR ferge* OR ferje* OR rederi* OR havn OR havna OR havnen)';

// Ett tema per spørring. Ordvalg per tema:
// hydrogen: hydrogen* (også hydrogenferge, hydrogenskip …)
// ammoniakk: ammoniakk* (også ammoniakkdrevet …)
// batteri: batteri* (dekker batteridrift, batterielektrisk, batteriferge)
// landstrøm: landstrøm* (også landstrømanlegg)
// elektrisk ferge: fraser for bøyningene + elferge*/elferje*
var OPOINT_T5_SPORRINGER = [
  { navn: 'hydrogen', searchterm: 'hydrogen* AND ' + OPOINT_T5_MARITIM + ' AND lang:no' },
  { navn: 'ammoniakk', searchterm: 'ammoniakk* AND ' + OPOINT_T5_MARITIM + ' AND lang:no' },
  { navn: 'batteri', searchterm: 'batteri* AND ' + OPOINT_T5_MARITIM + ' AND lang:no' },
  { navn: 'landstrøm', searchterm: 'landstrøm* AND ' + OPOINT_T5_MARITIM + ' AND lang:no' },
  { navn: 'elektrisk ferge', searchterm: '("elektrisk ferge" OR "elektriske ferger" OR "elektrisk ferje" OR ' +
      '"elektriske ferjer" OR elferge* OR elferje*) AND ' + OPOINT_T5_MARITIM + ' AND lang:no' }
];

// =====================================================================
// Hovedfunksjoner
// =====================================================================

function opoint_test3_referansesett() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nuMs = Date.now();
  var d = opoint_t3_datoFunksjoner();

  var kildeArk = ss.getSheetByName(OPOINT_T3_FANE_KILDE);
  if (!kildeArk) {
    opoint_t3_skrivFane(ss, OPOINT_T3_FANE, [['STOPPET', 'Fant ingen fane "' + OPOINT_T3_FANE_KILDE + '".']]);
    Logger.log('STOPPET: fant ingen fane "' + OPOINT_T3_FANE_KILDE + '".');
    return;
  }
  var data = kildeArk.getDataRange().getValues();
  if (data.length < 2) {
    opoint_t3_skrivFane(ss, OPOINT_T3_FANE, [['STOPPET', '"' + OPOINT_T3_FANE_KILDE + '" har ingen datarader.']]);
    return;
  }

  var kol = opoint_t3_finnKolonner(data[0]);
  Logger.log('Referansesett-overskrifter: ' + JSON.stringify(data[0]) + ' → ' + JSON.stringify(kol));
  if (kol.stopp) {
    opoint_t3_skrivFane(ss, OPOINT_T3_FANE, [
      ['STOPPET', kol.stopp],
      ['Overskriftsrad funnet'].concat(data[0].map(String))
    ]);
    Logger.log('STOPPET: ' + kol.stopp);
    return;
  }

  var klient = opoint_t3_lagKlient(apiKey, OPOINT_T3_MAKS_KALL);
  var resultat = opoint_t3_kjorReferansesett(data.slice(1), kol, klient, nuMs, d);
  Logger.log('Test 3: ' + klient.antall() + ' HTTP-kall.');

  var rader = opoint_t3_byggRaderReferansesett(resultat, kol, d, klient.antall(), nuMs);
  opoint_t3_skrivFane(ss, OPOINT_T3_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_T3_FANE + '".');
}

function opoint_test4_navn() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nuMs = Date.now();
  var d = opoint_t3_datoFunksjoner();

  var sporringer;
  try {
    sporringer = opoint_t4_byggSporringer(OPOINT_T2_SPORRINGER);
  } catch (e) {
    opoint_t3_skrivFane(ss, OPOINT_T4_FANE, [['STOPPET', e.message]]);
    Logger.log('STOPPET: ' + e.message);
    return;
  }
  var vindu = opoint_t3_vinduDager(OPOINT_T4_DAGER, nuMs);
  var klient = opoint_t3_lagKlient(apiKey, OPOINT_T4_MAKS_KALL);
  var res = opoint_t3_kjorSporringer(sporringer, vindu, OPOINT_T4_REQUESTED, OPOINT_T4_MAKS_BATCHER, klient);
  Logger.log('Test 4: ' + klient.antall() + ' HTTP-kall.');

  var rader = opoint_t3_byggRaderListe(res, vindu, klient, nuMs, d, false);
  opoint_t3_skrivFane(ss, OPOINT_T4_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_T4_FANE + '".');
}

function opoint_test5_norsk() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nuMs = Date.now();
  var d = opoint_t3_datoFunksjoner();

  var vindu = opoint_t3_vinduDager(OPOINT_T5_DAGER, nuMs);
  var klient = opoint_t3_lagKlient(apiKey, OPOINT_T5_MAKS_KALL);
  var res = opoint_t3_kjorSporringer(OPOINT_T5_SPORRINGER, vindu, OPOINT_T5_REQUESTED, OPOINT_T5_MAKS_BATCHER, klient);
  Logger.log('Test 5: ' + klient.antall() + ' HTTP-kall.');

  var rader = opoint_t3_byggRaderListe(res, vindu, klient, nuMs, d, true);
  opoint_t3_skrivFane(ss, OPOINT_T5_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_T5_FANE + '".');
}

// =====================================================================
// Apps Script-avhengige hjelpere
// =====================================================================

function opoint_t3_hentNokkel() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPOINT_API_KEY');
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('OPOINT_API_KEY mangler i Script Properties. ' +
      'Legg den inn under Prosjektinnstillinger → Script Properties og kjør på nytt.');
  }
  return String(apiKey).trim();
}

function opoint_t3_datoFunksjoner() {
  return {
    fmtSek: function (sek) {
      return Utilities.formatDate(new Date(sek * 1000), OPOINT_T3_TIDSSONE, 'yyyy-MM-dd HH:mm');
    },
    // Dato (Date-objekt fra arket) → 'yyyy-MM-dd' i Oslo-tid
    dagTekst: function (dato) { return Utilities.formatDate(dato, OPOINT_T3_TIDSSONE, 'yyyy-MM-dd'); },
    // 'yyyy-MM-dd HH:mm' i Oslo-tid → Unix-sekunder
    tilSek: function (tekst) {
      return Math.floor(Utilities.parseDate(tekst, OPOINT_T3_TIDSSONE, 'yyyy-MM-dd HH:mm').getTime() / 1000);
    }
  };
}

/**
 * HTTP-klient med kalltak og 1 s pause. Kalles med body; returnerer
 * {status, tekst, ms} eller null når taket er nådd. Nøkkelen logges aldri.
 * fetchFn/sleepFn kan sendes inn for Node-test.
 */
function opoint_t3_lagKlient(apiKey, maksKall, fetchFn, sleepFn) {
  var antall = 0;
  var takNadd = false;
  var fetch = fetchFn || function (body) {
    try {
      var r = UrlFetchApp.fetch(OPOINT_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Token ' + apiKey, 'Accept': 'application/json' },
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
        followRedirects: false
      });
      return { status: r.getResponseCode(), tekst: r.getContentText() };
    } catch (e) {
      // Nettverksfeil o.l. – meldingen maskeres før den brukes.
      return { status: 0, tekst: 'Nettverksfeil: ' + opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey) };
    }
  };
  var sleep = sleepFn || function (ms) { Utilities.sleep(ms); };
  return {
    kall: function (body) {
      if (antall >= maksKall) { takNadd = true; return null; }
      if (antall > 0) sleep(OPOINT_T3_PAUSE_MS);
      var t0 = Date.now();
      var svar = fetch(body);
      antall++;
      return { status: svar.status, tekst: svar.tekst, ms: Date.now() - t0 };
    },
    antall: function () { return antall; },
    takNadd: function () { return takNadd; },
    maksKall: maksKall,
    masker: function (s) { return opointMaskerNokkel(s, apiKey); }
  };
}

function opoint_t3_skrivFane(ss, navn, rader, apiKey) {
  var bredde = 1;
  for (var i = 0; i < rader.length; i++) bredde = Math.max(bredde, rader[i].length);
  var verdier = rader.map(function (rad) {
    var ny = rad.map(function (v) {
      if (v === undefined || v === null) return '';
      return typeof v === 'string' && apiKey ? opointMaskerNokkel(v, apiKey) : v;
    });
    while (ny.length < bredde) ny.push('');
    return ny;
  });
  var ark = ss.getSheetByName(navn);
  if (!ark) ark = ss.insertSheet(navn);
  ark.clear();
  ark.getRange(1, 1, verdier.length, bredde).setValues(verdier);
}

// =====================================================================
// Felles logikk (uten Apps Script-avhengigheter, testet med Node)
// =====================================================================

function opoint_t3_vinduDager(dager, nuMs) {
  var nu = Math.floor(nuMs / 1000);
  return { oldest: nu - dager * 86400, newest: nu, kilde: 'siste ' + dager + ' dager' };
}

/** Kort feilbeskrivelse for ett svar, eller '' hvis svaret er OK. */
function opoint_t3_feilTekst(svar, tolket, masker) {
  if (!tolket.ok) return masker(opointKort(tolket.feil, 300));
  if (opoint_harErrors(tolket.searchresult)) {
    return masker('searchresult.errors: ' + opointKort(JSON.stringify(tolket.searchresult.errors), 300));
  }
  return '';
}

/** Beste URL for visning: orig_url (artikkelens adresse) før url (Opoint-visning). */
function opoint_t3_artikkelUrl(doc) {
  if (doc && doc.orig_url) return String(doc.orig_url);
  if (doc && doc.url) return String(doc.url);
  return '';
}

/** Normalisert URL: små bokstaver, uten protokoll, "www.", query, fragment og avsluttende "/". */
function opoint_t3_normUrl(u) {
  if (u === undefined || u === null) return '';
  var s = String(u).trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split('#')[0].split('?')[0];
  s = s.replace(/\/+$/, '');
  return s;
}

/** Domene fra URL (uten www.). */
function opoint_t3_domene(u) {
  var s = opoint_t3_normUrl(u);
  return s ? s.split('/')[0] : '';
}

/** Ord i tittel: små bokstaver, tegnsetting fjernet. */
function opoint_t3_ord(tekst) {
  return String(tekst || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(function (w) { return w.length > 0; });
}

/**
 * Tittellikhet: andel felles (unike) ord, regnet mot den LENGSTE av de to
 * titlene, slik at begge veier må ha minst grensen felles.
 */
function opoint_t3_tittelLikhet(a, b) {
  var ua = {}, ub = {};
  opoint_t3_ord(a).forEach(function (w) { ua[w] = true; });
  opoint_t3_ord(b).forEach(function (w) { ub[w] = true; });
  var na = Object.keys(ua).length, nb = Object.keys(ub).length;
  if (na === 0 || nb === 0) return 0;
  var felles = Object.keys(ua).filter(function (w) { return ub[w]; }).length;
  return felles / Math.max(na, nb);
}

// =====================================================================
// Test 3: referansesett
// =====================================================================

/**
 * Finner kolonneindekser fra overskriftsraden. Tittel er påkrevd og må
 * være entydig. URL/dato/språk er valgfrie, men flere kandidater → stopp.
 */
function opoint_t3_finnKolonner(overskrifter) {
  var norm = overskrifter.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var ut = { tittel: -1, url: -1, dato: -1, sprak: -1, stopp: '', merknad: [] };
  var felt = ['tittel', 'url', 'dato', 'sprak'];
  for (var f = 0; f < felt.length; f++) {
    var navn = felt[f];
    var treff = [];
    for (var i = 0; i < norm.length; i++) {
      if (OPOINT_T3_KOLONNENAVN[navn].indexOf(norm[i]) >= 0) treff.push(i);
    }
    if (treff.length > 1) {
      ut.stopp = 'Flere mulige ' + navn + '-kolonner: ' +
        treff.map(function (i) { return '"' + overskrifter[i] + '" (kolonne ' + (i + 1) + ')'; }).join(', ') +
        '. Angi hvilken som skal brukes.';
      return ut;
    }
    if (treff.length === 1) ut[navn] = treff[0];
  }
  if (ut.tittel < 0) {
    ut.stopp = 'Fant ingen tittelkolonne. Gjenkjente navn: ' + OPOINT_T3_KOLONNENAVN.tittel.join(', ') +
      '. Overskriftene i arket er: ' + overskrifter.map(function (h) { return '"' + h + '"'; }).join(', ');
    return ut;
  }
  if (ut.url < 0) ut.merknad.push('Ingen URL-kolonne funnet: URL-match er ikke mulig, bare tittel-match.');
  if (ut.dato < 0) ut.merknad.push('Ingen datokolonne funnet: alle søk bruker siste ' + OPOINT_T3_DAGER_UTEN_DATO + ' dager.');
  return ut;
}

/**
 * Renser tittel for frasesøk: fjerner anførselstegn, parenteser, klammer,
 * backslash, kolon og søkeoperator-tegn (~ * ? ^), slår sammen mellomrom og
 * gjør om til små bokstaver (små bokstaver matcher alle skrivemåter).
 * Returnerer {tekst, endret (bool, utover små bokstaver)}.
 */
function opoint_t3_rensTittel(tittel) {
  var original = String(tittel || '').replace(/\s+/g, ' ').trim();
  var renset = original.replace(/["“”„«»'‘’`()\[\]{}\\:~*?^]/g, ' ').replace(/\s+/g, ' ').trim();
  return { tekst: renset.toLowerCase(), endret: renset !== original };
}

/** 4–5 mest særegne ord: uten stoppord og ord under 3 tegn, de lengste først. */
function opoint_t3_saeregneOrd(tittel) {
  var sett = {};
  var ord = opoint_t3_ord(tittel).filter(function (w) {
    if (w.length < 3 || OPOINT_T3_STOPPORD.indexOf(w) >= 0 || sett[w]) return false;
    sett[w] = true;
    return true;
  });
  // Stabil sortering på lengde (lengst først), ellers opprinnelig rekkefølge.
  var medIndeks = ord.map(function (w, i) { return { w: w, i: i }; });
  medIndeks.sort(function (a, b) { return (b.w.length - a.w.length) || (a.i - b.i); });
  return medIndeks.slice(0, OPOINT_T3_MAKS_FALLBACK_ORD).map(function (x) { return x.w; });
}

/** Leser dato fra celle: Date-objekt, 'yyyy-MM-dd…' eller 'dd.MM.yyyy'. Returnerer 'yyyy-MM-dd' eller ''. */
function opoint_t3_tolkDato(v, dagTekst) {
  if (v === undefined || v === null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : dagTekst(v);
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

/** Vindu rundt dato (±3 dager, hele dager i Oslo-tid), aldri etter nå. */
function opoint_t3_vinduRundtDato(dagYmd, nuMs, tilSek) {
  var nu = Math.floor(nuMs / 1000);
  var start = tilSek(dagYmd + ' 00:00') - OPOINT_T3_DAGER_RUNDT_DATO * 86400;
  var slutt = tilSek(dagYmd + ' 00:00') + (OPOINT_T3_DAGER_RUNDT_DATO + 1) * 86400 - 1;
  return { oldest: start, newest: Math.min(slutt, nu), kilde: dagYmd + ' ±' + OPOINT_T3_DAGER_RUNDT_DATO + ' d' };
}

/** Vurderer resultatlisten mot referanseartikkelen. */
function opoint_t3_vurder(ref, dokumenter) {
  var refUrl = opoint_t3_normUrl(ref.url);
  var best = null, bestLikhet = -1;
  for (var i = 0; i < dokumenter.length; i++) {
    var doc = dokumenter[i];
    if (refUrl) {
      var kandidater = [doc.orig_url, doc.url];
      for (var k = 0; k < kandidater.length; k++) {
        if (kandidater[k] && opoint_t3_normUrl(kandidater[k]) === refUrl) {
          return { type: 'URL-match', doc: doc, likhet: opoint_t3_tittelLikhet(ref.tittel, opointTekstFelt(doc.header)) };
        }
      }
    }
    var l = opoint_t3_tittelLikhet(ref.tittel, opointTekstFelt(doc.header));
    if (l > bestLikhet) { bestLikhet = l; best = doc; }
  }
  if (best && bestLikhet >= OPOINT_T3_TITTELGRENSE) return { type: 'tittel-match', doc: best, likhet: bestLikhet };
  return { type: 'ikke funnet', doc: best, likhet: best ? bestLikhet : '' };
}

/** Ett søk. Returnerer {antall, dokumenter, feil, status, rangeCount}. */
function opoint_t3_ettSok(klient, searchterm, vindu, requested) {
  var body = opoint_byggBody(searchterm, vindu.oldest, vindu.newest, '', requested);
  var svar = klient.kall(body);
  if (!svar) return { antall: '', dokumenter: [], feil: 'Ikke kjørt: kalltak (' + klient.maksKall + ') nådd', status: '' };
  var tolket = opointTolkSvar(svar.status, svar.tekst);
  var feil = opoint_t3_feilTekst(svar, tolket, klient.masker);
  if (feil) return { antall: '', dokumenter: [], feil: feil, status: svar.status };
  var dok = opointHentDokumenter(tolket.searchresult).liste;
  var rc = tolket.searchresult.range_count;
  return { antall: dok.length, dokumenter: dok, feil: '', status: svar.status, rangeCount: rc === undefined ? '' : rc };
}

function opoint_t3_kjorReferansesett(rader, kol, klient, nuMs, d) {
  var ut = [];
  for (var r = 0; r < rader.length; r++) {
    var rad = rader[r];
    var tittel = String(rad[kol.tittel] || '').trim();
    if (!tittel) continue; // tomme rader hoppes over
    var ref = {
      tittel: tittel,
      url: kol.url >= 0 ? String(rad[kol.url] || '').trim() : '',
      datoRa: kol.dato >= 0 ? rad[kol.dato] : '',
      sprak: kol.sprak >= 0 ? String(rad[kol.sprak] || '').trim() : ''
    };
    var res = { ref: ref, dag: '', vindu: null, sok1: '', sok1Tekst: '', sok2: 'ikke kjørt', sok2Tekst: '',
      tittelEndret: false, vurdering: null, viaFallback: false, feil: '', merknad: '' };

    res.dag = opoint_t3_tolkDato(ref.datoRa, d.dagTekst);
    if (kol.dato >= 0 && ref.datoRa !== '' && !res.dag) res.merknad = 'Dato ikke tolkbar ("' + ref.datoRa + '"), brukte 90 dager.';
    res.vindu = res.dag ? opoint_t3_vinduRundtDato(res.dag, nuMs, d.tilSek)
      : opoint_t3_vinduDager(OPOINT_T3_DAGER_UTEN_DATO, nuMs);

    var rens = opoint_t3_rensTittel(tittel);
    res.tittelEndret = rens.endret;
    if (!rens.tekst) { res.feil = 'Tittelen ble tom etter rensing.'; ut.push(res); continue; }
    res.sok1Tekst = 'header:"' + rens.tekst + '"';
    var s1 = opoint_t3_ettSok(klient, res.sok1Tekst, res.vindu, OPOINT_T3_REQUESTED);
    res.sok1 = s1.feil ? 'feil' : s1.antall;
    if (s1.feil) res.feil = 'Søk 1: ' + s1.feil;

    var dokumenter = s1.dokumenter;
    if (!s1.feil && s1.antall === 0) {
      var ord = opoint_t3_saeregneOrd(tittel);
      if (ord.length === 0) {
        res.sok2 = 'ikke kjørt (ingen særegne ord)';
      } else {
        res.sok2Tekst = ord.map(function (w) { return 'header:' + w; }).join(' AND ');
        var s2 = opoint_t3_ettSok(klient, res.sok2Tekst, res.vindu, OPOINT_T3_REQUESTED);
        res.sok2 = s2.feil ? 'feil' : s2.antall;
        if (s2.feil) res.feil = 'Søk 2: ' + s2.feil;
        dokumenter = s2.dokumenter;
        res.viaFallback = true;
      }
    }

    res.vurdering = opoint_t3_vurder(ref, dokumenter);
    ut.push(res);
  }
  return ut;
}

function opoint_t3_byggRaderReferansesett(resultat, kol, d, antallKall, nuMs) {
  var antall = resultat.length, url = 0, tittel = 0, fallback = 0, ikke = 0, feil = 0;
  resultat.forEach(function (r) {
    if (r.feil) { feil++; return; }
    if (r.vurdering.type === 'URL-match') url++;
    else if (r.vurdering.type === 'tittel-match') tittel++;
    else ikke++;
    if (r.vurdering.type !== 'ikke funnet' && r.viaFallback) fallback++;
  });
  var funnet = url + tittel;
  var andel = antall ? Math.round(1000 * funnet / antall) / 10 + ' %' : '';
  var rader = [];
  rader.push(['Antall artikler', antall, 'Funnet', funnet, 'Andel funnet', andel, 'Via URL-match', url,
    'Via tittel-match', tittel, 'Via fallback-søk', fallback, 'Ikke funnet', ikke, 'Feil', feil,
    'HTTP-kall', antallKall, 'Kjørt', d.fmtSek(Math.floor(nuMs / 1000))]);
  rader.push(['Kolonner brukt i "' + OPOINT_T3_FANE_KILDE + '"',
    'tittel=kol ' + (kol.tittel + 1), 'url=' + (kol.url >= 0 ? 'kol ' + (kol.url + 1) : 'ingen'),
    'dato=' + (kol.dato >= 0 ? 'kol ' + (kol.dato + 1) : 'ingen'),
    'språk=' + (kol.sprak >= 0 ? 'kol ' + (kol.sprak + 1) : 'ingen'), kol.merknad.join(' ')]);
  rader.push(['']);
  rader.push(['Tittel', 'URL', 'Dato', 'Språk', 'Søk 1 antall', 'Søk 2 antall', 'Resultat',
    'Beste treff tittel', 'Beste treff URL', 'id_site', 'Kilde (first_source)', 'Beste treff dato (lokal)',
    'Tittellikhet', 'Søk 1 tekst', 'Søk 2 tekst', 'Tittel endret ved rensing?', 'Vindu', 'Feil', 'Merknad',
    'Beste treff språk']);
  resultat.forEach(function (r) {
    var v = r.vurdering, doc = v && v.doc;
    var ts = doc ? doc.unix_timestamp : undefined;
    rader.push([
      r.ref.tittel, r.ref.url, r.dag || (r.ref.datoRa === '' ? '' : String(r.ref.datoRa)), r.ref.sprak,
      r.sok1, r.sok2, r.feil ? 'feil' : v.type,
      doc ? opointTekstFelt(doc.header) : '', doc ? opoint_t3_artikkelUrl(doc) : '',
      doc && doc.id_site !== undefined ? doc.id_site : '', doc ? opoint_firstSource(doc.first_source) : '',
      typeof ts === 'number' ? d.fmtSek(ts) : '',
      v && v.likhet !== '' ? Math.round(v.likhet * 100) + ' %' : '',
      r.sok1Tekst, r.sok2Tekst, r.tittelEndret ? 'Ja' : 'Nei',
      r.vindu ? d.fmtSek(r.vindu.oldest) + ' – ' + d.fmtSek(r.vindu.newest) + ' (' + r.vindu.kilde + ')' : '',
      r.feil, r.merknad, doc ? opoint_language(doc.language) : ''
    ]);
  });
  return rader;
}

// =====================================================================
// Test 4 og 5: spørringer med paging og equalgroup-markering
// =====================================================================

/**
 * Prosjektnavn hentes fra spørring d) i OPOINT_T2_SPORRINGER (Opoint.gs),
 * ikke hardkodet. Spørringene blir "Maritime CleanTech" som frase og
 * prosjektnavnene uten header:-prefiks.
 */
function opoint_t4_byggSporringer(t2Sporringer) {
  var d = null;
  for (var i = 0; i < t2Sporringer.length; i++) {
    if (String(t2Sporringer[i].navn).indexOf('d)') === 0) { d = t2Sporringer[i]; break; }
  }
  if (!d) throw new Error('Fant ikke spørring d) i OPOINT_T2_SPORRINGER (Opoint.gs).');
  var navn = [];
  var re = /header:("[^"]*"|[^\s()]+)/g, m;
  while ((m = re.exec(d.searchterm)) !== null) navn.push(m[1]);
  if (navn.length === 0) throw new Error('Fant ingen prosjektnavn i spørring d).');

  var ut = [{ navn: 'a) Maritime CleanTech (frase)', searchterm: '"Maritime CleanTech"' }];
  if (navn.length < OPOINT_T4_GRENSE_ENKELTSOK) {
    navn.forEach(function (n) { ut.push({ navn: 'b) ' + n.replace(/"/g, ''), searchterm: n }); });
  } else {
    ut.push({ navn: 'b) prosjektnavn (' + navn.length + ', samlet OR)', searchterm: '(' + navn.join(' OR ') + ')' });
  }
  return ut;
}

/** Kjører spørringer med context-paging. Feil per spørring logges, og kjøringen går videre. */
function opoint_t3_kjorSporringer(sporringer, vindu, requested, maksBatcher, klient) {
  var ut = [];
  for (var i = 0; i < sporringer.length; i++) {
    var sp = sporringer[i];
    var res = { navn: sp.navn, searchterm: sp.searchterm, statuser: [], batcher: 0, artikler: [],
      contextTom: '', rangeCount: [], feil: '', merknad: '' };
    ut.push(res);
    var context = '';
    for (var b = 0; b < maksBatcher; b++) {
      var svar = klient.kall(opoint_byggBody(sp.searchterm, vindu.oldest, vindu.newest, context, requested));
      if (!svar) {
        var m = 'Kalltaket (' + klient.maksKall + ') nådd.';
        if (b === 0) res.feil = 'Ikke kjørt: ' + m; else res.merknad = m;
        break;
      }
      res.statuser.push(svar.status);
      var tolket = opointTolkSvar(svar.status, svar.tekst);
      var feil = opoint_t3_feilTekst(svar, tolket, klient.masker);
      if (feil) { res.feil = 'Batch ' + (b + 1) + ': ' + feil; Logger.log(sp.navn + ': ' + res.feil); break; }
      var sr = tolket.searchresult;
      res.batcher++;
      res.rangeCount.push(sr.range_count === undefined ? '–' : sr.range_count);
      var dok = opointHentDokumenter(sr).liste;
      for (var d = 0; d < dok.length; d++) res.artikler.push({ doc: dok[d], batch: b + 1 });
      context = opointHentContext(sr);
      res.contextTom = context === '';
      if (context === '') break;
    }
    Logger.log(sp.navn + ': status=' + res.statuser.join(',') + ', artikler=' + res.artikler.length +
      (res.feil ? ', FEIL: ' + res.feil : ''));
  }
  return ut;
}

/**
 * Markerer duplikater innen én spørring (på tvers av batcher):
 * samme equalgroup som en tidligere artikkel, eller samme id_site+id_article.
 * Returnerer {merker[], unikeGrupper, uten equalgroup}.
 */
function opoint_t3_markerDuplikater(artikler) {
  var grupper = {}, ider = {}, merker = [], unike = 0, uten = 0;
  for (var i = 0; i < artikler.length; i++) {
    var doc = artikler[i].doc;
    var eg = doc.equalgroup;
    var id = doc.id_site + '_' + doc.id_article;
    var merke = '';
    if (ider[id] !== undefined) {
      merke = 'Duplikat: samme artikkel som rad ' + (ider[id] + 1);
    } else if (eg !== undefined && eg !== null && eg !== '') {
      if (grupper[eg] !== undefined) merke = 'Duplikat: equalgroup ' + eg + ' (som rad ' + (grupper[eg] + 1) + ')';
      else { grupper[eg] = i; unike++; }
    } else {
      uten++;
    }
    if (ider[id] === undefined) ider[id] = i;
    merker.push(merke);
  }
  return { merker: merker, unikeGrupper: unike, utenEqualgroup: uten };
}

function opoint_t3_byggRaderListe(resultater, vindu, klient, nuMs, d, medDomene) {
  var totalt = 0;
  resultater.forEach(function (r) { totalt += r.artikler.length; });
  var rader = [];
  rader.push(['Kjørt', d.fmtSek(Math.floor(nuMs / 1000)), 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest) +
    ' (' + vindu.kilde + ')', 'Unix', vindu.oldest + ' – ' + vindu.newest, 'HTTP-kall', klient.antall(),
    'Kalltak nådd?', klient.takNadd() ? 'Ja (maks ' + klient.maksKall + ')' : 'Nei', 'Artikler totalt', totalt]);
  rader.push(['']);
  rader.push(['Spørring', 'Searchterm', 'Status per batch', 'Antall dokumenter', 'Unike grupper (equalgroup)',
    'Uten equalgroup', 'Batcher', 'Context tom etter siste?', 'range_count per batch', 'Feil', 'Merknad']);
  var dupPerSporring = [];
  resultater.forEach(function (r) {
    var dup = opoint_t3_markerDuplikater(r.artikler);
    dupPerSporring.push(dup);
    var ctx = r.contextTom === '' ? '(ukjent)' : (r.contextTom ? 'Ja (ingen flere)' : 'Nei (det finnes flere)');
    rader.push([r.navn, r.searchterm, r.statuser.join(', '), r.artikler.length, dup.unikeGrupper, dup.utenEqualgroup,
      r.batcher, ctx, r.rangeCount.join(', '), r.feil, r.merknad]);
  });
  rader.push(['']);
  var hode = ['Spørring', 'Dato (lokal)', 'Tittel', 'URL', 'Summary (maks 300)', 'Språk', 'Countrycode',
    'id_site', 'id_article', 'Antall identiske', 'equalgroup', 'first_source', 'unix_timestamp', 'Duplikat', 'Batch'];
  if (medDomene) hode.push('Kilde-domene');
  rader.push(hode);
  resultater.forEach(function (r, ri) {
    r.artikler.forEach(function (a, ai) {
      var doc = a.doc, ts = doc.unix_timestamp, url = opoint_t3_artikkelUrl(doc);
      var rad = [r.navn, typeof ts === 'number' ? d.fmtSek(ts) : '', opointTekstFelt(doc.header), url,
        opointKort(opointTekstFelt(doc.summary), OPOINT_T3_SAMMENDRAG_MAKS), opoint_language(doc.language),
        doc.countrycode || '', doc.id_site !== undefined ? doc.id_site : '', doc.id_article !== undefined ? doc.id_article : '',
        opointTellIdentiske(doc), doc.equalgroup !== undefined && doc.equalgroup !== null ? doc.equalgroup : '',
        opoint_firstSource(doc.first_source), ts !== undefined ? ts : '', dupPerSporring[ri].merker[ai], a.batch];
      if (medDomene) rad.push(doc.url_common ? String(doc.url_common).replace(/^www\./, '') : opoint_t3_domene(url));
      rader.push(rad);
    });
  });
  return rader;
}
