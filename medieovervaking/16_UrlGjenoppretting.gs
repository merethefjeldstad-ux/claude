/**
 * 16_UrlGjenoppretting.gs
 *
 * ENGANGSVERKTOY - kjores manuelt fra editoren, kalles ALDRI fra den
 * daglige kjoringen.
 *
 * Bakgrunn: fra 17.-20. oktober til 19. november var live-versjonen av
 * 05_Deduplisering.gs eldre enn 07_Hovedkjoring.gs, slik at
 * leggTilSendteUrler() leste a.url (som ikke lenger fantes) i stedet for
 * t.lenke. Resultat: rader i "Sendte artikler" med tom URL (kol A), men
 * med dato (B) og overskrift (C). Rettet i Steg 2.
 *
 * Denne fila finner URL-ene igjen fra de daglige e-postene i Sendt-mappa
 * i Gmail (href-en i e-posten ER treff.lenke, dvs. noyaktig samme streng
 * som dedupliseringen sammenligner mot), med "Artikkellogg" som
 * kryssjekk/reserve for 18.-19. november.
 *
 * To funksjoner a kjore:
 *   - gjenopprettUrlFraSendtPost():      TORRKJORING (standard). Skriver
 *                                        INGENTING - logger bare hva som
 *                                        ville blitt satt.
 *   - gjenopprettUrlFraSendtPostSkriv(): skriver URL i TOMME celler i kol A,
 *                                        og lister rader som ikke kunne
 *                                        avgjores i fanen "URL-gjenoppretting".
 *
 * Garantier:
 *   - Skriver KUN i kol A, og KUN i celler som er tomme rett for skriving.
 *   - Skriver ikke hvis overskriften (kol C) i raden er endret siden
 *     lesing (beskytter mot at rader har flyttet seg).
 *   - Endrer aldri andre celler, sletter/flytter/sorterer aldri rader.
 *   - Rader med 0 eller flere mulige URL-er (eller motstrid mellom Gmail og
 *     Artikkellogg) skrives IKKE - de listes i "URL-gjenoppretting".
 *   - Tidsvakt pa 4,5 min. Gjenopptak: kjor samme funksjon pa nytt - allerede
 *     fylte celler hoppes over, og ferdig leste e-poster er mellomlagret i
 *     CacheService i 6 timer (ikke Script Properties).
 *
 * Kjor IKKE samtidig med den daglige kjoringen (ca. kl. 07:08).
 */

var FANE_URL_GJENOPPRETTING = 'URL-gjenoppretting';

// Gmail-sok: Sendt-mappa, etter 20.10.2026, daglig e-post. Emnet ma i
// tillegg BEGYNNE med prefikset under - det utelukker "Re:", "Fwd:" og
// "[TEST] ..." (testEpostMerkevare) automatisk.
var URL_GJENOPPRETTING_GMAIL_SOK = 'in:sent after:2026/10/20 subject:"Medieovervåking Maritime CleanTech"';
var URL_GJENOPPRETTING_EMNE_PREFIKS = 'Medieovervåking Maritime CleanTech';

// En rad i "Sendte artikler" skrives SEKUNDER etter at e-posten er sendt
// (leggTilSendteUrler kjores rett etter sendEpostMedLogo). E-poster sendt
// inntil 20 min for / 5 min etter radens tidsstempel regnes som "samme
// kjoring". Det skiller artikler som ble sendt flere dager pa rad.
var URL_GJENOPPRETTING_VINDU_FOER_MS = 20 * 60 * 1000;
var URL_GJENOPPRETTING_VINDU_ETTER_MS = 5 * 60 * 1000;

var URL_GJENOPPRETTING_TIDSGRENSE_MS = 4.5 * 60 * 1000;
var URL_GJENOPPRETTING_CACHE_PREFIKS = 'urlgj_v1_';
var URL_GJENOPPRETTING_CACHE_SEKUNDER = 6 * 60 * 60; // CacheService-maks

// false (anbefalt): skriv href-en akkurat slik den sto i e-posten - samme
// streng som leggTilSendteUrler() ville skrevet, og samme format som
// radene for 21. oktober (inkl. google.com/url?...-omdirigeringer).
// true: skriv den utpakkede artikkel-URL-en i stedet. Penere a lese, men
// matcher IKKE det RSS-en leverer, og hjelper derfor ikke dedupliseringen.
var URL_GJENOPPRETTING_SKRIV_UTPAKKET = false;

// ---------------------------------------------------------------------
// Inngangspunkter
// ---------------------------------------------------------------------

/** TORRKJORING (standard): skriver ingenting, logger hva som ville blitt satt. */
function gjenopprettUrlFraSendtPost() {
  kjorUrlGjenoppretting_(false);
}

/** SKRIVER: fyller tomme URL-celler i kol A og oppdaterer fanen "URL-gjenoppretting". */
function gjenopprettUrlFraSendtPostSkriv() {
  kjorUrlGjenoppretting_(true);
}

// ---------------------------------------------------------------------
// Hovedlogikk (Apps Script-avhengig)
// ---------------------------------------------------------------------

function kjorUrlGjenoppretting_(skriv) {
  var startTid = new Date().getTime();
  var tidsvaktNadd = function () {
    return new Date().getTime() - startTid > URL_GJENOPPRETTING_TIDSGRENSE_MS;
  };

  Logger.log('=== URL-gjenoppretting - ' + (skriv ? 'SKRIVEMODUS' : 'TORRKJORING (skriver ingenting)') + ' ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ark = ss.getSheetByName(FANE_SENDTE_ARTIKLER);
  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) {
    Logger.log('"' + FANE_SENDTE_ARTIKLER + '" er tom. Ingenting a gjore.');
    return;
  }

  // --- 1. Rader med tom URL ---
  var data = ark.getRange(2, 1, sisteRad - 1, 3).getValues();
  var tommeRader = [];
  for (var i = 0; i < data.length; i++) {
    var url = data[i][0];
    var dato = data[i][1];
    var tittel = data[i][2];
    if (url !== '' && url !== null) continue;
    if (!tittel) continue; // helt tom rad - ikke var sak
    tommeRader.push({
      rad: i + 2,
      tid: (dato instanceof Date) ? dato.getTime() : null,
      dato: dato,
      tittel: String(tittel)
    });
  }
  Logger.log('Fant ' + tommeRader.length + ' rad(er) med tom URL i "' + FANE_SENDTE_ARTIKLER + '".');
  if (tommeRader.length === 0) return;

  // --- 2. Artikkellogg (kryssjekk / reserve) ---
  // "Kjøringslogg" leses ikke: den har ingen URL-kolonne (kun kilde/status/antall).
  var artikkellogg = lesArtikkelloggForGjenoppretting_(ss);
  Logger.log('Artikkellogg: ' + artikkellogg.length + ' rad(er) med URL lest.');

  // --- 3. Daglige e-poster fra Gmail (med mellomlager for gjenopptak) ---
  var gmail = hentDagligeEposterForGjenoppretting_(tidsvaktNadd);
  Logger.log('Gmail: ' + gmail.eposter.length + ' daglig(e) e-post(er) lest (' + gmail.fraCache +
    ' fra mellomlager).');
  if (!gmail.fullfort) {
    Logger.log('STOPP: tidsvakten (4,5 min) ble nadd under Gmail-lesingen. Ingenting er skrevet. ' +
      'Kjor samme funksjon igjen - allerede leste e-poster hentes fra mellomlageret.');
    return;
  }

  // --- 4. Matching (ren funksjon) ---
  var beslutninger = matchRaderMotEposter(tommeRader, gmail.eposter, artikkellogg, {
    foerMs: URL_GJENOPPRETTING_VINDU_FOER_MS,
    etterMs: URL_GJENOPPRETTING_VINDU_ETTER_MS
  });

  var antallAmpEntitet = 0;
  beslutninger.forEach(function (b) {
    var tilSkriving = (b.status === 'OK' && URL_GJENOPPRETTING_SKRIV_UTPAKKET) ? pakkUtGoogleOmdirigering(b.url) : b.url;
    b.urlTilSkriving = tilSkriving;
    if (tilSkriving && tilSkriving.indexOf('&amp;') !== -1) antallAmpEntitet++;

    if (b.status === 'OK') {
      var utpakket = pakkUtGoogleOmdirigering(b.url);
      Logger.log('Rad ' + b.rad + ' [OK, ' + b.kilde + ']: "' + b.tittel + '"\n    -> ' + tilSkriving +
        (utpakket !== tilSkriving ? '\n    (artikkel: ' + utpakket + ')' : ''));
    } else {
      Logger.log('Rad ' + b.rad + ' [' + b.status + ']: "' + b.tittel + '" - ' + b.forklaring +
        (b.kandidater.length ? '\n    kandidater:\n      ' + b.kandidater.join('\n      ') : ''));
    }
  });
  if (antallAmpEntitet > 0) {
    Logger.log('ADVARSEL: ' + antallAmpEntitet + ' URL(er) inneholder "&amp;". Det tyder pa at e-postens HTML er ' +
      'escapet annerledes enn forventet. Ikke skriv for dette er sjekket.');
  }

  var ok = beslutninger.filter(function (b) { return b.status === 'OK'; });
  var ikkeOk = beslutninger.filter(function (b) { return b.status !== 'OK'; });

  if (!skriv) {
    Logger.log('=== TORRKJORING ferdig: ' + ok.length + ' ville blitt skrevet, ' + ikkeOk.length +
      ' ville blitt listet i "' + FANE_URL_GJENOPPRETTING + '" (' + tellStatuser_(ikkeOk) + '). ' +
      'Ingenting er skrevet. ===');
    return;
  }

  // --- 5. Skriv - kun tomme celler i kol A, med sjekk rett for skriving ---
  var antallSkrevet = 0;
  var avbrutt = false;
  for (var k = 0; k < ok.length; k++) {
    if (tidsvaktNadd()) {
      avbrutt = true;
      break;
    }
    var b = ok[k];
    var naa = ark.getRange(b.rad, 1, 1, 3).getValues()[0];
    if (naa[0] !== '' && naa[0] !== null) {
      Logger.log('Rad ' + b.rad + ': kol A er ikke lenger tom - hopper over.');
      continue;
    }
    if (String(naa[2]) !== b.tittel) {
      b.status = 'ENDRET';
      b.forklaring = 'Overskriften i raden er endret siden lesing - ikke skrevet. Kjor pa nytt.';
      ikkeOk.push(b);
      Logger.log('Rad ' + b.rad + ': ' + b.forklaring);
      continue;
    }
    ark.getRange(b.rad, 1).setValue(b.urlTilSkriving);
    antallSkrevet++;
  }

  if (avbrutt) {
    Logger.log('STOPP: tidsvakten (4,5 min) ble nadd etter ' + antallSkrevet + ' skrevne celler. ' +
      'Kjor gjenopprettUrlFraSendtPostSkriv() igjen for a fortsette. "' + FANE_URL_GJENOPPRETTING +
      '" oppdateres forst nar en kjoring blir ferdig.');
    return;
  }

  skrivGjenopprettingsfane_(ss, ikkeOk);
  Logger.log('=== Ferdig: ' + antallSkrevet + ' URL(er) skrevet. ' + ikkeOk.length + ' rad(er) listet i "' +
    FANE_URL_GJENOPPRETTING + '" (' + tellStatuser_(ikkeOk) + '). ===');
}

/**
 * Leser Artikkellogg: tidspunkt (A), normalisert URL (B), overskrift (E).
 * Testrader ([TEST] i kilde) hoppes over. Mangler fanen -> tom liste.
 */
function lesArtikkelloggForGjenoppretting_(ss) {
  var ark = ss.getSheetByName(typeof FANE_ARTIKKELLOGG !== 'undefined' ? FANE_ARTIKKELLOGG : 'Artikkellogg');
  if (!ark || ark.getLastRow() < 2) return [];
  var data = ark.getRange(2, 1, ark.getLastRow() - 1, 5).getValues();
  var resultat = [];
  for (var i = 0; i < data.length; i++) {
    var url = data[i][1];
    var kilde = String(data[i][2] || '');
    if (!url || kilde.indexOf('[TEST]') === 0) continue;
    resultat.push({
      tid: (data[i][0] instanceof Date) ? data[i][0].getTime() : null,
      url: String(url),
      tittel: String(data[i][4] || '')
    });
  }
  return resultat;
}

/**
 * Henter alle daglige e-poster (Sendt, etter 20.10.2026) med lenker fra
 * htmlBody. Ferdig leste e-poster mellomlagres i CacheService i 6 timer,
 * slik at en ny kjoring etter tidsvakt-stopp slipper a lese dem pa nytt.
 *
 * @param {function(): boolean} tidsvaktNadd
 * @return {{eposter: Array, fullfort: boolean, fraCache: number}}
 */
function hentDagligeEposterForGjenoppretting_(tidsvaktNadd) {
  var cache = CacheService.getUserCache();
  var eposter = [];
  var sett = {};
  var fraCache = 0;
  var start = 0;
  var SIDE = 50;

  while (true) {
    if (tidsvaktNadd()) return { eposter: eposter, fullfort: false, fraCache: fraCache };
    var traader = GmailApp.search(URL_GJENOPPRETTING_GMAIL_SOK, start, SIDE);
    if (traader.length === 0) break;

    for (var t = 0; t < traader.length; t++) {
      var meldinger = traader[t].getMessages();
      for (var m = 0; m < meldinger.length; m++) {
        if (tidsvaktNadd()) return { eposter: eposter, fullfort: false, fraCache: fraCache };

        var melding = meldinger[m];
        var id = melding.getId();
        if (sett[id]) continue;

        var cachet = cache.get(URL_GJENOPPRETTING_CACHE_PREFIKS + id);
        if (cachet) {
          sett[id] = true;
          var fraLager = JSON.parse(cachet);
          if (fraLager.relevant) eposter.push(fraLager);
          fraCache++;
          continue;
        }

        var emne = melding.getSubject() || '';
        var epost = {
          id: id,
          relevant: emne.indexOf(URL_GJENOPPRETTING_EMNE_PREFIKS) === 0,
          tid: melding.getDate().getTime(),
          emne: emne,
          lenker: []
        };
        if (epost.relevant) {
          epost.lenker = hentLenkerFraHtml(melding.getBody());
          eposter.push(epost);
        }
        sett[id] = true;
        try {
          cache.put(URL_GJENOPPRETTING_CACHE_PREFIKS + id, JSON.stringify(epost), URL_GJENOPPRETTING_CACHE_SEKUNDER);
        } catch (e) {
          // For stor for mellomlageret (>100 KB) - helt ufarlig, leses bare pa nytt neste gang.
        }
      }
    }

    if (traader.length < SIDE) break;
    start += SIDE;
  }
  return { eposter: eposter, fullfort: true, fraCache: fraCache };
}

/**
 * Skriver (overskriver) fanen "URL-gjenoppretting" med radene som IKKE
 * fikk URL. Fanen opprettes bakerst hvis den mangler. Rorer ingen andre faner.
 */
function skrivGjenopprettingsfane_(ss, ikkeOk) {
  var ark = ss.getSheetByName(FANE_URL_GJENOPPRETTING);
  if (!ark) ark = ss.insertSheet(FANE_URL_GJENOPPRETTING, ss.getNumSheets());
  ark.clearContents();

  var overskrifter = ['Rad i «Sendte artikler»', 'Dato lagt til', 'Overskrift', 'Status',
    'Kandidat-URL-er', 'Forklaring', 'Sist kjørt'];
  ark.getRange(1, 1, 1, overskrifter.length).setValues([overskrifter]).setFontWeight('bold');

  if (ikkeOk.length === 0) return;
  var naa = new Date();
  var rader = ikkeOk
    .sort(function (a, b) { return a.rad - b.rad; })
    .map(function (b) {
      return [b.rad, b.dato || '', b.tittel, b.status, b.kandidater.join('\n'), b.forklaring, naa];
    });
  ark.getRange(2, 1, rader.length, overskrifter.length).setValues(rader);
}

function tellStatuser_(liste) {
  var teller = {};
  liste.forEach(function (b) { teller[b.status] = (teller[b.status] || 0) + 1; });
  var deler = Object.keys(teller).map(function (s) { return s + ': ' + teller[s]; });
  return deler.length ? deler.join(', ') : 'ingen';
}

// ---------------------------------------------------------------------
// Rene funksjoner (testet med Node - tests/url-gjenoppretting/test.js)
// ---------------------------------------------------------------------

/**
 * Normaliserer en overskrift for sammenligning: NFC, fjerner myk bindestrek
 * (U+00AD), fjerner « - kilde»-suffiks (siste « - », « – », « — » eller
 * « | » med mellomrom rundt), sma bokstaver, all tegnsetting -> mellomrom.
 *
 * @param {*} tittel
 * @return {string} tom streng hvis ingenting gjenstar
 */
function normaliserTittelForMatching(tittel) {
  if (tittel === null || tittel === undefined) return '';
  var t = String(tittel);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  t = t.replace(/­/g, '');
  t = t.replace(/[   ]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+[-–—|]\s+[^-–—|]{1,80}$/, '');
  t = t.toLowerCase();
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Dekoder HTML-entiteter i lenketekst (escapeHtml() i 06_Epost.gs + vanlige
 * navngitte/numeriske). &amp; dekodes sist for a unnga dobbel dekoding.
 */
function dekodHtmlEntiteter(tekst) {
  if (!tekst) return '';
  return String(tekst)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&shy;/g, '­')
    .replace(/&amp;/g, '&');
}

/**
 * Henter alle http(s)-lenker med lenketekst fra en HTML-streng.
 * href returneres UENDRET (ikke entitet-dekodet): escapeAttributt() i
 * 06_Epost.gs escaper ikke &, sa href-en er allerede lik treff.lenke.
 * mailto:, cid: o.l. hoppes over.
 *
 * @param {string} html
 * @return {Array<{href: string, tekst: string}>}
 */
function hentLenkerFraHtml(html) {
  var resultat = [];
  if (!html) return resultat;
  var lenkeRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  var hrefRe = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
  var treff;
  while ((treff = lenkeRe.exec(html)) !== null) {
    var hrefTreff = hrefRe.exec(treff[1]);
    if (!hrefTreff) continue;
    var href = (hrefTreff[1] !== undefined ? hrefTreff[1] :
      hrefTreff[2] !== undefined ? hrefTreff[2] : hrefTreff[3]).trim();
    if (!/^https?:\/\//i.test(href)) continue;
    var tekst = dekodHtmlEntiteter(treff[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    resultat.push({ href: href, tekst: tekst });
  }
  return resultat;
}

/**
 * Pakker ut Google-omdirigering (google.xx/url?...&url=... eller &q=...).
 * Andre URL-er returneres uendret. Bruker hentQueryParameter() og
 * sikkerDecodeURIComponent() fra 12_Artikkellogg.gs.
 */
function pakkUtGoogleOmdirigering(url) {
  if (!url) return '';
  var u = String(url).trim();
  if (/^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?/i.test(u)) {
    var indre = hentQueryParameter(u, 'url') || hentQueryParameter(u, 'q');
    if (indre) return sikkerDecodeURIComponent(indre);
  }
  return u;
}

/**
 * Avgjor URL for hver rad med tom URL.
 *
 * Regler per rad:
 *   1. Grunnlag = e-poster sendt i tidsvinduet rundt radens tidsstempel
 *      (samme kjoring). Finnes ingen slik e-post (eller raden mangler
 *      dato), brukes ALLE e-poster.
 *   2. Kandidater = ulike href-er i grunnlaget der normalisert lenketekst
 *      == normalisert overskrift.
 *   3. Artikkellogg-kandidater = ulike URL-er med samme normaliserte
 *      overskrift (samme tidsvindu-regel).
 *   4. Noyaktig 1 Gmail-kandidat -> OK, med mindre Artikkellogg har
 *      kandidater og ingen av dem er lik den normaliserte Gmail-URL-en
 *      (da KONFLIKT). 0 Gmail-kandidater -> Artikkellogg avgjor hvis den
 *      har noyaktig 1. Ellers FLERE_TREFF eller MANGLER.
 *
 * @param {Array<{rad:number, tid:?number, tittel:string}>} rader
 * @param {Array<{tid:number, lenker:Array<{href:string, tekst:string}>}>} eposter
 * @param {Array<{tid:?number, url:string, tittel:string}>} artikkellogg
 * @param {{foerMs:number, etterMs:number}} vindu
 * @return {Array<Object>} {rad, dato, tittel, status, url, kilde, kandidater, forklaring}
 */
function matchRaderMotEposter(rader, eposter, artikkellogg, vindu) {
  var epostIndeks = (eposter || []).map(function (e) {
    return {
      tid: e.tid,
      lenker: (e.lenker || []).map(function (l) {
        return { href: l.href, nt: normaliserTittelForMatching(l.tekst) };
      })
    };
  });
  var alIndeks = (artikkellogg || []).map(function (a) {
    return { tid: a.tid, url: a.url, nt: normaliserTittelForMatching(a.tittel) };
  });

  function iVindu(elementTid, radTid) {
    return elementTid !== null && elementTid !== undefined &&
      elementTid >= radTid - vindu.foerMs && elementTid <= radTid + vindu.etterMs;
  }
  function velgGrunnlag(liste, radTid) {
    if (radTid === null || radTid === undefined) return { liste: liste, iVindu: false };
    var innen = liste.filter(function (x) { return iVindu(x.tid, radTid); });
    return innen.length ? { liste: innen, iVindu: true } : { liste: liste, iVindu: false };
  }
  function unike(liste) {
    var sett = {};
    return liste.filter(function (x) {
      if (sett[x]) return false;
      sett[x] = true;
      return true;
    });
  }

  return rader.map(function (rad) {
    var b = {
      rad: rad.rad, dato: rad.dato, tittel: rad.tittel,
      status: '', url: '', kilde: '', kandidater: [], forklaring: ''
    };
    var nt = normaliserTittelForMatching(rad.tittel);
    if (!nt) {
      b.status = 'MANGLER';
      b.forklaring = 'Overskriften er tom etter normalisering.';
      return b;
    }

    var epostGrunnlag = velgGrunnlag(epostIndeks, rad.tid);
    var gmailKandidater = [];
    epostGrunnlag.liste.forEach(function (e) {
      e.lenker.forEach(function (l) { if (l.nt === nt) gmailKandidater.push(l.href); });
    });
    gmailKandidater = unike(gmailKandidater);

    var alGrunnlag = velgGrunnlag(alIndeks, rad.tid);
    var alKandidater = unike(alGrunnlag.liste
      .filter(function (a) { return a.nt === nt; })
      .map(function (a) { return a.url; }));

    var gmailKildeTekst = epostGrunnlag.iVindu ? 'Gmail, samme kjøring' : 'Gmail, alle e-poster';

    if (gmailKandidater.length === 1) {
      var normalisertGmail = normaliserUrlForLogging(gmailKandidater[0]);
      if (alKandidater.length > 0 && alKandidater.indexOf(normalisertGmail) === -1) {
        b.status = 'KONFLIKT';
        b.kandidater = gmailKandidater.concat(alKandidater);
        b.forklaring = 'Gmail og Artikkellogg peker pa ulike URL-er.';
        return b;
      }
      b.status = 'OK';
      b.url = gmailKandidater[0];
      b.kilde = gmailKildeTekst + (alKandidater.length ? ' + bekreftet av Artikkellogg' : '');
      return b;
    }

    if (gmailKandidater.length > 1) {
      b.status = 'FLERE_TREFF';
      b.kandidater = gmailKandidater;
      b.forklaring = gmailKandidater.length + ' ulike URL-er med samme overskrift (' + gmailKildeTekst + ').';
      return b;
    }

    if (alKandidater.length === 1) {
      b.status = 'OK';
      b.url = alKandidater[0];
      b.kilde = 'Artikkellogg (normalisert URL - ikke i Gmail)';
      return b;
    }
    if (alKandidater.length > 1) {
      b.status = 'FLERE_TREFF';
      b.kandidater = alKandidater;
      b.forklaring = alKandidater.length + ' ulike URL-er i Artikkellogg, ingen i Gmail.';
      return b;
    }

    b.status = 'MANGLER';
    b.forklaring = epostGrunnlag.iVindu
      ? 'Fant e-post fra samme kjoring, men ingen lenke med denne overskriften.'
      : 'Fant verken e-post fra samme kjoring eller lenke med denne overskriften.';
    return b;
  });
}
