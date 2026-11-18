/**
 * Opoint.gs
 *
 * Frittstående test av Opoints Search API. Kjøres KUN manuelt fra
 * Apps Script-editoren (testOpoint). Kobles IKKE til daglig kjøring eller
 * utløsere, sender ALDRI e-post, kaller ALDRI Anthropic API, skriver KUN
 * til fanen "Opoint-test".
 *
 * API-nøkkelen leses fra Script Properties (OPOINT_API_KEY). Den skal
 * aldri havne i kode, logg, ark eller e-post: headers/options logges
 * aldri, og all tekst fra svaret som logges eller skrives til arket går
 * gjennom opointMaskerNokkel() for sikkerhets skyld.
 *
 * Feltnavn i svaret er IKKE verifisert mot dokumentasjonen (den var ikke
 * tilgjengelig da filen ble skrevet). Koden leter derfor tolerant etter
 * feltene og skriver rå feltnavn til arket, slik at formatet kan
 * kontrolleres manuelt.
 */

var OPOINT_URL = 'https://api.opoint.com/search/';
var OPOINT_FANE = 'Opoint-test';
var OPOINT_REQUESTED_ARTICLES = 10;
var OPOINT_MAKS_BATCHER = 3;
var OPOINT_PAUSE_MS = 1000;
var OPOINT_VINDU_SEK = 24 * 60 * 60;
var OPOINT_SAMMENDRAG_MAKS = 300;

var OPOINT_SPORRINGER = [
  'header:ammonia AND (vessel OR ship OR shipping)',
  'ammonia AND (vessel OR ship OR shipping)'
];

/**
 * Hovedfunksjon. Kjør manuelt fra editoren.
 */
function testOpoint() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPOINT_API_KEY');
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('OPOINT_API_KEY mangler i Script Properties. ' +
      'Legg den inn under Prosjektinnstillinger → Script Properties og kjør på nytt.');
  }
  apiKey = String(apiKey).trim();

  var newest = Math.floor(Date.now() / 1000);
  var oldest = newest - OPOINT_VINDU_SEK;
  Logger.log('=== testOpoint: vindu oldest=' + oldest + ' newest=' + newest + ' (Unix-sekunder) ===');

  var teller = { kall: 0 };
  var resultater = [];

  for (var i = 0; i < OPOINT_SPORRINGER.length; i++) {
    if (i > 0) Utilities.sleep(OPOINT_PAUSE_MS);
    var res;
    try {
      res = opointKjorSporring(apiKey, OPOINT_SPORRINGER[i], oldest, newest, teller);
    } catch (e) {
      res = opointTomtResultat(OPOINT_SPORRINGER[i]);
      res.feil = 'Uventet feil: ' + opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey);
    }
    Logger.log('Spørring "' + res.sporring + '": status=' + res.sisteStatus +
      ', artikler=' + res.artikler.length + ', batcher=' + res.batcher +
      (res.feil ? ', FEIL: ' + res.feil : ''));
    resultater.push(res);
  }

  Logger.log('Totalt antall HTTP-kall mot Opoint: ' + teller.kall);

  try {
    opointSkrivTilArk(resultater, oldest, newest, teller.kall, apiKey);
    Logger.log('Skrevet til fanen "' + OPOINT_FANE + '".');
  } catch (e) {
    Logger.log('FEIL ved skriving til ark: ' + opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey));
  }
}

/**
 * Kjører én spørring med paging (maks OPOINT_MAKS_BATCHER batcher).
 */
function opointKjorSporring(apiKey, sporring, oldest, newest, teller) {
  var res = opointTomtResultat(sporring);
  var context = '';
  var start = Date.now();

  for (var b = 0; b < OPOINT_MAKS_BATCHER; b++) {
    if (b > 0) Utilities.sleep(OPOINT_PAUSE_MS);

    var body = opointByggBody(sporring, oldest, newest, context);
    var t0 = Date.now();
    var respons = UrlFetchApp.fetch(OPOINT_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Accept': 'application/json'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: false
    });
    teller.kall++;
    res.httpMs += Date.now() - t0;
    res.batcher++;

    var status = respons.getResponseCode();
    var tekst = respons.getContentText();
    res.statuser.push(status);
    res.sisteStatus = status;

    var tolket = opointTolkSvar(status, tekst);
    if (!tolket.ok) {
      res.feil = opointMaskerNokkel(tolket.feil, apiKey);
      Logger.log('Batch ' + res.batcher + ' feilet: ' + res.feil);
      break;
    }

    var sr = tolket.searchresult;
    if (b === 0) {
      res.searchresultFelt = opointBeskrivFelt(sr);
      res.totalFelt = opointFinnTotalFelt(sr);
    }

    if (sr.errors !== undefined && sr.errors !== null &&
        !(Array.isArray(sr.errors) && sr.errors.length === 0) && sr.errors !== '') {
      res.feil = 'searchresult.errors: ' + opointMaskerNokkel(opointKort(JSON.stringify(sr.errors), 500), apiKey);
      Logger.log('Batch ' + res.batcher + ': ' + res.feil);
      break;
    }

    var dok = opointHentDokumenter(sr);
    if (b === 0) res.dokumentFeltKilde = dok.kilde;
    if (b === 0 && dok.liste.length > 0) res.forsteDokFelt = Object.keys(dok.liste[0]).join(', ');
    for (var d = 0; d < dok.liste.length; d++) res.artikler.push(dok.liste[d]);

    context = opointHentContext(sr);
    res.contextTomEtterSiste = (context === '');
    if (context === '') break;
  }

  res.totalMs = Date.now() - start;
  return res;
}

function opointTomtResultat(sporring) {
  return {
    sporring: sporring, statuser: [], sisteStatus: '', httpMs: 0, totalMs: 0,
    batcher: 0, artikler: [], contextTomEtterSiste: '', totalFelt: '',
    searchresultFelt: '', dokumentFeltKilde: '', forsteDokFelt: '', feil: ''
  };
}

// ---------- Rene funksjoner (testet med Node i tests/opoint/) ----------

function opointByggBody(sporring, oldest, newest, context) {
  return {
    searchterm: sporring,
    params: {
      requestedarticles: OPOINT_REQUESTED_ARTICLES,
      context: context || '',
      oldest: oldest,
      newest: newest,
      groupidentical: 1,
      identical: { inherit: true },
      main: { header: 1, summary: 1 }
    }
  };
}

/** Returnerer {ok:true, searchresult} eller {ok:false, feil}. Logger aldri headers. */
function opointTolkSvar(status, tekst) {
  if (status !== 200) {
    return { ok: false, feil: 'HTTP ' + status + ': ' + opointKort(tekst || '(tomt svar)', 500) };
  }
  if (!tekst || !String(tekst).trim()) {
    return { ok: false, feil: 'HTTP 200, men tomt svar' };
  }
  var json;
  try {
    json = JSON.parse(tekst);
  } catch (e) {
    return { ok: false, feil: 'Parsefeil (ikke gyldig JSON): ' + opointKort(tekst, 300) };
  }
  if (!json || typeof json !== 'object' || !json.searchresult || typeof json.searchresult !== 'object') {
    var nokler = (json && typeof json === 'object') ? Object.keys(json).join(', ') : typeof json;
    return { ok: false, feil: 'Mangler searchresult i svaret. Toppnivåfelt: ' + nokler };
  }
  return { ok: true, searchresult: json.searchresult };
}

/** Finner artikkellisten uten å anta feltnavn: "document" eller "documents" (det som er en liste). */
function opointHentDokumenter(sr) {
  if (Array.isArray(sr.document)) return { liste: sr.document, kilde: 'searchresult.document' };
  if (Array.isArray(sr.documents)) return { liste: sr.documents, kilde: 'searchresult.documents' };
  return { liste: [], kilde: '(fant ingen liste i document/documents)' };
}

function opointHentContext(sr) {
  var c = sr.context;
  if (c === undefined || c === null) return '';
  return String(c);
}

/** Tallfelt i searchresult som kan ligne totalt antall treff. */
function opointFinnTotalFelt(sr) {
  var ut = [];
  var nokler = Object.keys(sr);
  for (var i = 0; i < nokler.length; i++) {
    var k = nokler[i];
    if (/count|total|documents|hits|range/i.test(k) && typeof sr[k] === 'number') {
      ut.push(k + '=' + sr[k]);
    }
  }
  return ut.join('; ');
}

/** Feltnavn + type i searchresult (ikke verdier), for å kunne verifisere formatet. */
function opointBeskrivFelt(sr) {
  return Object.keys(sr).map(function (k) {
    var v = sr[k];
    var type = Array.isArray(v) ? 'liste[' + v.length + ']' : (v === null ? 'null' : typeof v);
    return k + ':' + type;
  }).join(', ');
}

/** Antall i identical_documents, tolerant for liste, {document:[...]} eller {cnt:n}. */
function opointTellIdentiske(doc) {
  var idd = doc ? doc.identical_documents : undefined;
  if (idd === undefined || idd === null) return '';
  if (Array.isArray(idd)) return idd.length;
  if (typeof idd === 'object') {
    if (typeof idd.cnt === 'number') return idd.cnt;
    if (Array.isArray(idd.document)) return idd.document.length;
    return '(ukjent format: ' + Object.keys(idd).join(',') + ')';
  }
  if (typeof idd === 'number') return idd;
  return '(ukjent format)';
}

function opointTekstFelt(obj) {
  if (obj === undefined || obj === null) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object' && obj.text !== undefined && obj.text !== null) return String(obj.text);
  return '';
}

function opointKort(s, maks) {
  s = String(s === undefined || s === null ? '' : s);
  return s.length > maks ? s.substring(0, maks) + '…' : s;
}

function opointMaskerNokkel(s, apiKey) {
  s = String(s === undefined || s === null ? '' : s);
  if (apiKey && apiKey.length >= 4) s = s.split(apiKey).join('***');
  return s;
}

/** Én artikkelrad. formaterDato sendes inn, slik at funksjonen kan testes uten Apps Script. */
function opointArtikkelRad(sporring, doc, formaterDato) {
  var ts = doc.unix_timestamp;
  var dato = (typeof ts === 'number' && isFinite(ts)) ? formaterDato(new Date(ts * 1000)) : '';
  return [
    sporring,
    dato,
    opointTekstFelt(doc.header),
    doc.url !== undefined ? String(doc.url) : '',
    opointKort(opointTekstFelt(doc.summary), OPOINT_SAMMENDRAG_MAKS),
    doc.language !== undefined ? (typeof doc.language === 'object' ? JSON.stringify(doc.language) : String(doc.language)) : '',
    doc.countrycode !== undefined ? String(doc.countrycode) : '',
    doc.id_site !== undefined ? doc.id_site : '',
    doc.id_article !== undefined ? doc.id_article : '',
    opointTellIdentiske(doc),
    ts !== undefined ? ts : '',
    doc.orig_url !== undefined ? String(doc.orig_url) : ''
  ];
}

// ---------- Skriving til ark ----------

function opointSkrivTilArk(resultater, oldest, newest, antallKall, apiKey) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var fmt = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss'); };

  var ark = ss.getSheetByName(OPOINT_FANE);
  if (!ark) ark = ss.insertSheet(OPOINT_FANE);
  ark.clear();

  var rader = [];
  rader.push(['Opoint-test kjørt', fmt(new Date()), 'Vindu fra', fmt(new Date(oldest * 1000)),
    'Vindu til', fmt(new Date(newest * 1000)), 'HTTP-kall totalt', antallKall]);
  rader.push(['']);
  rader.push(['Spørring', 'HTTP-status (per batch)', 'Tid totalt ms (inkl. pauser)', 'Tid HTTP ms',
    'Artikler hentet', 'Batcher', 'Context tom etter siste batch?', 'Total-lignende felt',
    'Feil', 'searchresult-felt', 'Artikkelliste fra', 'Felt i første dokument']);
  for (var i = 0; i < resultater.length; i++) {
    var r = resultater[i];
    var ctxTekst = r.contextTomEtterSiste === '' ? '(ukjent)' :
      (r.contextTomEtterSiste ? 'Ja (ingen flere)' : 'Nei (det finnes flere)');
    rader.push([r.sporring, r.statuser.join(', '), r.totalMs, r.httpMs, r.artikler.length, r.batcher,
      ctxTekst, r.totalFelt, r.feil, r.searchresultFelt, r.dokumentFeltKilde, r.forsteDokFelt]);
  }
  rader.push(['']);
  rader.push(['Spørring', 'Dato (lokal tid)', 'Tittel', 'URL', 'Sammendrag (maks 300)', 'Language',
    'Countrycode', 'id_site', 'id_article', 'Antall identical_documents', 'unix_timestamp (rå)', 'orig_url']);
  for (var j = 0; j < resultater.length; j++) {
    for (var k = 0; k < resultater[j].artikler.length; k++) {
      rader.push(opointArtikkelRad(resultater[j].sporring, resultater[j].artikler[k], fmt));
    }
  }

  var bredde = 12;
  var normalisert = rader.map(function (rad) {
    var ny = rad.slice(0, bredde).map(function (v) {
      return typeof v === 'string' ? opointMaskerNokkel(v, apiKey) : v;
    });
    while (ny.length < bredde) ny.push('');
    return ny;
  });
  ark.getRange(1, 1, normalisert.length, bredde).setValues(normalisert);
  ark.getRange(3, 1, 1, bredde).setFontWeight('bold');
  ark.getRange(3 + resultater.length + 2, 1, 1, bredde).setFontWeight('bold');
}

// =====================================================================
// opoint_test2(): utvidet test (eget tidsvindu, flere spørringer,
// requestedarticles 25 med fallback til 10, maks 6 batcher per spørring,
// maks 40 HTTP-kall per kjøring). Skriver KUN til fanen "Opoint-test 2".
// Ingen trigger, ingen e-post, ingen Anthropic-kall. testOpoint() og
// funksjonene over er uendret; noen av dem gjenbrukes (opointTolkSvar,
// opointHentDokumenter, opointHentContext, opointTellIdentiske,
// opointTekstFelt, opointKort, opointMaskerNokkel).
//
// Verifisert mot api-docs.opoint.com (guides/search,
// references/search-syntax, references/response-format), 2026-11-18:
// - "header:(a OR b)": prefikset ignoreres stille og hele artikkelen
//   søkes. Prefikset må stå på hvert ledd: (header:a OR header:b).
// - Ord med stor bokstav matcher bare samme store/små bokstaver.
// - globalrank<N, countryrank<N, site:ID, source:ID, firstsource:ID finnes.
// - context tom = ingen flere artikler. debug-feltet viser korrigeringer.
// - equalgroup krever param include_equalgroup_id (ikke satt her).
// - similarweb krever lisens; finnes bare hvis det er data.
// Ikke funnet i dokumentasjonen: maks requestedarticles, rate limits,
// betydningen av searchresult.count.
// =====================================================================

// Tidsvindu, 'yyyy-MM-dd HH:mm' i Europe/Oslo. Begge tomme = siste 24 t.
var OPOINT_VINDU_START = '';
var OPOINT_VINDU_SLUTT = '';

var OPOINT_T2_TIDSSONE = 'Europe/Oslo';
var OPOINT_T2_FANE = 'Opoint-test 2';
var OPOINT_T2_REQUESTED_FORSTE = 25;
var OPOINT_T2_REQUESTED_FALLBACK = 10;
var OPOINT_T2_MAKS_BATCHER = 6;
var OPOINT_T2_MAKS_KALL = 40;
var OPOINT_T2_PAUSE_MS = 1000;
var OPOINT_T2_SIMILARWEB_MAKS = 200;

var OPOINT_T2_SPORRINGER = [
  { navn: 'a) ammonia header + skip', searchterm: 'header:ammonia AND (vessel OR ship OR shipping)' },
  { navn: 'b) ammoniakk header + skip (no)', searchterm: 'header:ammoniakk AND (skip OR fartøy OR rederi OR skipsfart)' },
  { navn: 'c) Maritime CleanTech header', searchterm: 'header:"Maritime CleanTech"', dagerTilbake: 7 },
  // Prefikset header: står på hvert ledd fordi header:( ... ) ifølge
  // syntaksreferansen ignoreres stille (da søkes hele artikkelen).
  { navn: 'd) prosjektnavn header', dagerTilbake: 7, searchterm:
      '(header:"Orcelle Horizon" OR header:HyShip OR header:AIMPERES OR header:"FIT-HORIZONS"' +
      ' OR header:LOWNOISER OR header:STEESMAT OR header:"Ocean Charger" OR header:Medstraum' +
      ' OR header:SeaThrive OR header:"Ship-aH2oy" OR header:H2NOR OR header:"Corvus Pelican")' },
  { navn: 'e) ammonia + skip + maritim', searchterm: 'ammonia AND (vessel OR ship OR shipping) AND (maritime OR bunker OR bunkering OR shipowner)' },
  // Syntaks fra references/search-syntax ("Ranks"). Grenseverdien 50 er et valg, ikke fra dokumentasjonen.
  { navn: 'f) a) + countryrank<50', searchterm: 'header:ammonia AND (vessel OR ship OR shipping) AND countryrank<50' }
];

/**
 * Hovedfunksjon. Kjør manuelt fra editoren.
 */
function opoint_test2() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPOINT_API_KEY');
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('OPOINT_API_KEY mangler i Script Properties. ' +
      'Legg den inn under Prosjektinnstillinger → Script Properties og kjør på nytt.');
  }
  apiKey = String(apiKey).trim();

  var nuMs = Date.now();
  var parse = function (s) { return Utilities.parseDate(s, OPOINT_T2_TIDSSONE, 'yyyy-MM-dd HH:mm'); };
  var fmt = function (sek) { return Utilities.formatDate(new Date(sek * 1000), OPOINT_T2_TIDSSONE, 'yyyy-MM-dd HH:mm:ss'); };

  var hovedvindu;
  try {
    hovedvindu = opoint_beregnVindu(OPOINT_VINDU_START, OPOINT_VINDU_SLUTT, undefined, nuMs, parse);
  } catch (e) {
    Logger.log('FEIL i tidsvindu: ' + e.message);
    throw e;
  }
  Logger.log('=== opoint_test2: vindu ' + fmt(hovedvindu.oldest) + ' – ' + fmt(hovedvindu.newest) +
    ' (' + OPOINT_T2_TIDSSONE + '), oldest=' + hovedvindu.oldest + ' newest=' + hovedvindu.newest + ' ===');

  var deps = {
    fetch: function (body) {
      var r = UrlFetchApp.fetch(OPOINT_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Token ' + apiKey, 'Accept': 'application/json' },
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
        followRedirects: false
      });
      return { status: r.getResponseCode(), tekst: r.getContentText() };
    },
    sleep: function (ms) { Utilities.sleep(ms); },
    now: function () { return Date.now(); },
    log: function (s) { Logger.log(opointMaskerNokkel(s, apiKey)); },
    masker: function (s) { return opointMaskerNokkel(s, apiKey); },
    vindu: function (sp) {
      return opoint_beregnVindu(OPOINT_VINDU_START, OPOINT_VINDU_SLUTT, sp.dagerTilbake, nuMs, parse);
    },
    fmt: fmt
  };

  var kjoring = opoint_kjorAlle(OPOINT_T2_SPORRINGER, deps);
  Logger.log('Totalt antall HTTP-kall mot Opoint: ' + kjoring.kall +
    (kjoring.kalltakNadd ? ' (kalltaket på ' + OPOINT_T2_MAKS_KALL + ' ble nådd, kjøringen stoppet kontrollert)' : ''));

  try {
    opoint_skrivTilArk(kjoring, hovedvindu, nuMs, fmt, deps.masker);
    Logger.log('Skrevet til fanen "' + OPOINT_T2_FANE + '".');
  } catch (e) {
    Logger.log('FEIL ved skriving til ark: ' + opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey));
  }
}

// ---------- Logikk uten Apps Script-avhengigheter (testet med Node) ----------

/**
 * Beregner {oldest, newest} i Unix-sekunder.
 * dagerTilbake (tall > 0) overstyrer: newest = nå, oldest = nå − dager.
 * Ellers: begge konstanter tomme → siste 24 t; begge satt → de; bare én satt → feil.
 */
function opoint_beregnVindu(startTekst, sluttTekst, dagerTilbake, nuMs, parse) {
  var nuSek = Math.floor(nuMs / 1000);
  if (typeof dagerTilbake === 'number' && dagerTilbake > 0) {
    return { oldest: nuSek - Math.round(dagerTilbake * 86400), newest: nuSek, kilde: 'dagerTilbake=' + dagerTilbake };
  }
  var s = String(startTekst || '').trim();
  var e = String(sluttTekst || '').trim();
  if (!s && !e) return { oldest: nuSek - 86400, newest: nuSek, kilde: 'siste 24 t' };
  if (!s || !e) {
    throw new Error('Sett både OPOINT_VINDU_START og OPOINT_VINDU_SLUTT, eller la begge stå tomme.');
  }
  var re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
  if (!re.test(s) || !re.test(e)) {
    throw new Error('Tidsvindu må ha formatet yyyy-MM-dd HH:mm (fikk "' + s + '" og "' + e + '").');
  }
  var o = Math.floor(parse(s).getTime() / 1000);
  var n = Math.floor(parse(e).getTime() / 1000);
  if (!(o < n)) throw new Error('OPOINT_VINDU_START må være før OPOINT_VINDU_SLUTT.');
  return { oldest: o, newest: n, kilde: 'konstanter' };
}

function opoint_byggBody(searchterm, oldest, newest, context, requested) {
  return {
    searchterm: searchterm,
    params: {
      requestedarticles: requested,
      context: context || '',
      oldest: oldest,
      newest: newest,
      groupidentical: 1,
      identical: { inherit: true },
      main: { header: 1, summary: 1 }
    }
  };
}

function opoint_harErrors(sr) {
  var e = sr ? sr.errors : undefined;
  if (e === undefined || e === null || e === '') return false;
  if (Array.isArray(e) && e.length === 0) return false;
  return true;
}

function opoint_verdi(v) {
  return v === undefined ? '–' : (v === null ? 'null' : String(v));
}

/**
 * Kjører alle spørringene. deps: fetch(body)→{status,tekst}, sleep(ms), now(), log(s), masker(s), vindu(sp).
 * Returnerer {kall, kalltakNadd, requested, fallbackLogg, resultater[]}.
 */
function opoint_kjorAlle(sporringer, deps) {
  var tilstand = { kall: 0, kalltakNadd: false, requested: OPOINT_T2_REQUESTED_FORSTE, requestedBekreftet: false, fallbackLogg: '' };
  var resultater = [];

  var gjorKall = function (body) {
    if (tilstand.kall >= OPOINT_T2_MAKS_KALL) {
      tilstand.kalltakNadd = true;
      return null;
    }
    if (tilstand.kall > 0) deps.sleep(OPOINT_T2_PAUSE_MS);
    var t0 = deps.now();
    var svar = deps.fetch(body);
    tilstand.kall++;
    return { status: svar.status, tekst: svar.tekst, ms: deps.now() - t0 };
  };

  for (var i = 0; i < sporringer.length; i++) {
    var sp = sporringer[i];
    var res = {
      navn: sp.navn, searchterm: sp.searchterm, vindu: null, statuser: [], batcher: 0, artikler: [],
      contextTom: '', count: [], rangeCount: [], documents: [], debug: '', rangeInfo: '',
      httpMs: 0, requestedBrukt: '', feil: '', merknad: ''
    };
    resultater.push(res);

    if (tilstand.kalltakNadd) {
      res.feil = 'Ikke kjørt: kalltaket på ' + OPOINT_T2_MAKS_KALL + ' HTTP-kall var nådd.';
      continue;
    }

    try {
      res.vindu = deps.vindu(sp);
    } catch (e) {
      res.feil = 'Tidsvindu: ' + e.message;
      deps.log(sp.navn + ': ' + res.feil);
      continue;
    }

    var context = '';
    for (var b = 0; b < OPOINT_T2_MAKS_BATCHER; b++) {
      var body = opoint_byggBody(sp.searchterm, res.vindu.oldest, res.vindu.newest, context, tilstand.requested);
      var svar = gjorKall(body);
      if (!svar) break;
      res.httpMs += svar.ms;
      res.statuser.push(svar.status);
      var tolket = opointTolkSvar(svar.status, svar.tekst);
      var avvist = !tolket.ok || opoint_harErrors(tolket.searchresult);

      // Fallback: første gang 25 forsøkes og svaret avvises, prøv samme batch med 10.
      if (avvist && !tilstand.requestedBekreftet && tilstand.requested === OPOINT_T2_REQUESTED_FORSTE) {
        var feil25 = !tolket.ok ? tolket.feil : 'searchresult.errors: ' + opointKort(JSON.stringify(tolket.searchresult.errors), 300);
        body = opoint_byggBody(sp.searchterm, res.vindu.oldest, res.vindu.newest, context, OPOINT_T2_REQUESTED_FALLBACK);
        var svar10 = gjorKall(body);
        if (!svar10) { res.feil = deps.masker(feil25); break; }
        res.httpMs += svar10.ms;
        res.statuser.push(svar10.status + '(10)');
        var tolket10 = opointTolkSvar(svar10.status, svar10.tekst);
        if (tolket10.ok && !opoint_harErrors(tolket10.searchresult)) {
          tilstand.requested = OPOINT_T2_REQUESTED_FALLBACK;
          tilstand.requestedBekreftet = true;
          tilstand.fallbackLogg = 'requestedarticles=25 avvist (' + deps.masker(opointKort(feil25, 200)) +
            '); 10 fungerte og brukes resten av kjøringen.';
          deps.log(tilstand.fallbackLogg);
          tolket = tolket10;
          avvist = false;
        } else {
          // Både 25 og 10 avvist: feilen gjelder trolig spørringen, ikke requestedarticles.
          res.feil = deps.masker(!tolket10.ok ? tolket10.feil :
            'searchresult.errors: ' + opointKort(JSON.stringify(tolket10.searchresult.errors), 500));
          deps.log(sp.navn + ' avvist (med både 25 og 10): ' + res.feil);
          break;
        }
      }

      if (avvist) {
        res.feil = deps.masker(!tolket.ok ? tolket.feil :
          'searchresult.errors: ' + opointKort(JSON.stringify(tolket.searchresult.errors), 500));
        deps.log(sp.navn + ' avvist: ' + res.feil);
        break;
      }

      if (!tilstand.requestedBekreftet) tilstand.requestedBekreftet = true;
      res.requestedBrukt = tilstand.requested;
      res.batcher++;
      var sr = tolket.searchresult;
      res.count.push(opoint_verdi(sr.count));
      res.rangeCount.push(opoint_verdi(sr.range_count));
      res.documents.push(opoint_verdi(sr.documents));
      if (b === 0) {
        if (sr.debug !== undefined) res.debug = deps.masker(opointKort(JSON.stringify(sr.debug), 500));
        if (sr.range_start !== undefined || sr.range_end !== undefined) {
          res.rangeInfo = 'range_start=' + opoint_verdi(sr.range_start) + ', range_end=' + opoint_verdi(sr.range_end);
        }
      }
      var dok = opointHentDokumenter(sr).liste;
      for (var d = 0; d < dok.length; d++) res.artikler.push(dok[d]);

      context = opointHentContext(sr);
      res.contextTom = (context === '');
      if (context !== '' && dok.length < tilstand.requested && res.merknad === '') {
        res.merknad = 'Batch ' + res.batcher + ' ga ' + dok.length + ' av ' + tilstand.requested +
          ' artikler selv om context ikke var tom (mulig tak/gruppering).';
      }
      if (context === '') break;
    }

    if (tilstand.kalltakNadd) {
      var m = 'Kalltaket på ' + OPOINT_T2_MAKS_KALL + ' HTTP-kall nådd; spørringen ble avbrutt.';
      res.merknad = res.merknad ? res.merknad + ' ' + m : m;
      deps.log(sp.navn + ': ' + m);
    }
    deps.log(sp.navn + ': status=' + res.statuser.join(',') + ', artikler=' + res.artikler.length +
      ', batcher=' + res.batcher + (res.feil ? ', FEIL: ' + res.feil : ''));
  }

  return { kall: tilstand.kall, kalltakNadd: tilstand.kalltakNadd, requested: tilstand.requested,
    fallbackLogg: tilstand.fallbackLogg, resultater: resultater };
}

function opoint_language(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return v.text !== undefined && v.text !== null ? String(v.text) : '';
  return String(v);
}

function opoint_firstSource(v) {
  if (!v || typeof v !== 'object') return v === undefined || v === null ? '' : String(v);
  var navn = [v.sitename, v.name].filter(function (x) { return x !== undefined && x !== null && x !== ''; }).join(' / ');
  return navn + (v.id !== undefined ? ' (' + v.id + ')' : '');
}

function opoint_siteRank(v) {
  if (!v || typeof v !== 'object') return v === undefined || v === null ? '' : String(v);
  var deler = [];
  if (v.rank_global !== undefined) deler.push('global=' + v.rank_global);
  if (v.rank_country !== undefined) deler.push('land=' + v.rank_country);
  return deler.join('; ');
}

function opoint_mediatype(v) {
  if (!v || typeof v !== 'object') return v === undefined || v === null ? '' : String(v);
  return v.text !== undefined && v.text !== null ? String(v.text) : JSON.stringify(v);
}

function opoint_artikkelRad(navn, doc, fmtSek) {
  var ts = doc.unix_timestamp;
  return [
    navn,
    (typeof ts === 'number' && isFinite(ts)) ? fmtSek(ts) : '',
    opointTekstFelt(doc.header),
    doc.url !== undefined && doc.url !== null ? String(doc.url) : '',
    opointKort(opointTekstFelt(doc.summary), OPOINT_SAMMENDRAG_MAKS),
    opoint_language(doc.language),
    doc.countrycode !== undefined && doc.countrycode !== null ? String(doc.countrycode) : '',
    doc.id_site !== undefined ? doc.id_site : '',
    doc.id_article !== undefined ? doc.id_article : '',
    opointTellIdentiske(doc),
    doc.equalgroup !== undefined && doc.equalgroup !== null ? doc.equalgroup : '',
    opoint_firstSource(doc.first_source),
    opoint_siteRank(doc.site_rank),
    opoint_mediatype(doc.mediatype),
    doc.similarweb !== undefined && doc.similarweb !== null ? opointKort(JSON.stringify(doc.similarweb), OPOINT_T2_SIMILARWEB_MAKS) : '',
    doc.word_count !== undefined && doc.word_count !== null ? doc.word_count : '',
    ts !== undefined ? ts : ''
  ];
}

/** Bygger alle rader til fanen (ren funksjon). */
function opoint_byggRader(kjoring, hovedvindu, nuMs, fmtSek) {
  var rader = [];
  rader.push(['Kjørt', fmtSek(Math.floor(nuMs / 1000)), 'Vindu brukt (' + OPOINT_T2_TIDSSONE + ')',
    fmtSek(hovedvindu.oldest) + ' – ' + fmtSek(hovedvindu.newest),
    'Unix', hovedvindu.oldest + ' – ' + hovedvindu.newest,
    'HTTP-kall totalt', kjoring.kall,
    'Kalltak nådd?', kjoring.kalltakNadd ? 'Ja (maks ' + OPOINT_T2_MAKS_KALL + ')' : 'Nei',
    'requestedarticles', kjoring.requested + (kjoring.fallbackLogg ? ' – ' + kjoring.fallbackLogg : '')]);
  rader.push(['']);
  rader.push(['Spørring', 'Searchterm', 'HTTP-status per batch', 'Artikler hentet', 'Batcher',
    'Context tom etter siste batch?', 'count per batch', 'range_count per batch', 'documents per batch',
    'Tid HTTP totalt ms', 'Feil', 'Vindu for spørringen', 'requestedarticles brukt',
    'debug (korrigeringer)', 'range_start/range_end (batch 1)', 'Merknad']);
  for (var i = 0; i < kjoring.resultater.length; i++) {
    var r = kjoring.resultater[i];
    var ctx = r.contextTom === '' ? '(ukjent)' : (r.contextTom ? 'Ja (ingen flere)' : 'Nei (det finnes flere)');
    var vindu = r.vindu ? fmtSek(r.vindu.oldest) + ' – ' + fmtSek(r.vindu.newest) + ' (' + r.vindu.kilde + ')' : '';
    rader.push([r.navn, r.searchterm, r.statuser.join(', '), r.artikler.length, r.batcher, ctx,
      r.count.join(', '), r.rangeCount.join(', '), r.documents.join(', '), r.httpMs, r.feil, vindu,
      r.requestedBrukt, r.debug, r.rangeInfo, r.merknad]);
  }
  rader.push(['']);
  rader.push(['Spørring', 'Dato (' + OPOINT_T2_TIDSSONE + ')', 'Tittel', 'URL', 'Sammendrag (maks 300)',
    'Language', 'Countrycode', 'id_site', 'id_article', 'Antall identical_documents', 'equalgroup',
    'first_source', 'site_rank', 'mediatype', 'similarweb (maks 200)', 'word_count', 'unix_timestamp']);
  for (var j = 0; j < kjoring.resultater.length; j++) {
    var rr = kjoring.resultater[j];
    for (var k = 0; k < rr.artikler.length; k++) rader.push(opoint_artikkelRad(rr.navn, rr.artikler[k], fmtSek));
  }
  return rader;
}

// ---------- Skriving til ark ----------

function opoint_skrivTilArk(kjoring, hovedvindu, nuMs, fmtSek, masker) {
  var rader = opoint_byggRader(kjoring, hovedvindu, nuMs, fmtSek);
  var bredde = 0;
  for (var i = 0; i < rader.length; i++) bredde = Math.max(bredde, rader[i].length);
  var normalisert = rader.map(function (rad) {
    var ny = rad.map(function (v) { return typeof v === 'string' ? masker(v) : v; });
    while (ny.length < bredde) ny.push('');
    return ny;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ark = ss.getSheetByName(OPOINT_T2_FANE);
  if (!ark) ark = ss.insertSheet(OPOINT_T2_FANE);
  ark.clear();
  ark.getRange(1, 1, normalisert.length, bredde).setValues(normalisert);
  ark.getRange(3, 1, 1, bredde).setFontWeight('bold');
  ark.getRange(3 + kjoring.resultater.length + 2, 1, 1, bredde).setFontWeight('bold');
}
