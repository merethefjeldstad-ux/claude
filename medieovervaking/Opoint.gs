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
