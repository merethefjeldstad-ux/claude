/**
 * FellesTest.gs – felles e-post med Apps Script-kildene og Opoint (KUN testkopien).
 *
 *   kjorFellesTest()            hele løpet for vinduet i FELLES_START/FELLES_SLUTT (tomt = automatisk)
 *   opoint_ft_kjor1819()        DEL G: vinduet 2026-11-18 07:30 – 2026-11-19 07:30
 *   planleggFellesTest()        DEL F: én engangsutløser i morgen 07:35 (sletter seg selv)
 *   avbrytFellesTest()          DEL F: fjerner utløseren
 *   opoint_ft_simulerHistorikk17/18/19()   DEL D: simulert historikk i «Sendte saker»
 *   opoint_ft_sikkerhet()       DEL E: utløsere, nøkler og mottaker i loggen
 *
 * Endrer ingen eksisterende filer. Gjenbruker originalens funksjoner (kaller, endrer ikke):
 * hentKilder, hentSokeord, hentRSSFeed, erInnenTidsvindu, finnMatchendeSokeord,
 * finnKategoriForForsteSokeord, hentSendteUrler, vurderTreffMedAI, leggTilSendteUrler,
 * loggArtikler, samt Opoint-funksjonene i OpointKjoring.gs.
 *
 * Skriver IKKE til «Kilder» eller «Kjøringslogg» (originalens oppdaterKildeStatus/loggKjoring
 * kalles ikke). Skriver til «Sendte artikler»/«Artikkellogg» (som originalen) bare ved ekte
 * kjøringer med LOGG_SENDTE = true. E-post sendes KUN til Script Property TEST_EPOST.
 */

// --- Konfigurasjon ---
var FELLES_START = '';                 // 'yyyy-MM-dd HH:mm' (Europe/Oslo). Tomt = automatisk (se opoint_ft_vindu)
var FELLES_SLUTT = '';
var VIS_OPPRINNELSE = true;            // «[AS]», «[OP]», «[AS+OP]» etter kildenavnet (bare test)
var LOGG_SENDTE = true;                // legg sendte saker i «Sendte saker» (og Sendte artikler/Artikkellogg) etter ekte sending
var FELLES_FANE = 'Felles-test';
var FELLES_AS_FRIST_MS = 2 * 60 * 1000;        // Apps Script-henting stoppes etter 2 min (originalen har 5 min alene)
var FELLES_OPOINT_FRIST_MS = 4 * 60 * 1000;    // DEL C: Opoint avbrytes etter 4 min
var FELLES_SAMMENDRAG_FRIST_MS = 4.5 * 60 * 1000; // DEL C: etter 4,5 min hoppes IMO-vinkling og sammendrag over
var FELLES_SISTE_KI_FRIST_MS = 5.25 * 60 * 1000;  // ingen nye KI-kall etter dette
var FELLES_TRIGGER_TID = '2026-11-20 07:35';      // DEL F
var FELLES_TRIGGER_FUNKSJON = 'opoint_ft_triggerKjor';

// =====================================================================
// DEL B: kjorFellesTest
// =====================================================================

function kjorFellesTest(startTekst, sluttTekst) {
  var t0 = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var d = opoint_t3_datoFunksjoner();
  var faser = {}, merknader = [];
  var fase = function (navn, fn) { var s0 = Date.now(); try { return fn(); } finally { faser[navn] = (faser[navn] || 0) + (Date.now() - s0); } };
  var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
  var vindu = opoint_ft_vindu(typeof startTekst === 'string' ? startTekst : FELLES_START,
    typeof sluttTekst === 'string' ? sluttTekst : FELLES_SLUTT, t0, parse);
  var historisk = vindu.newest * 1000 < t0 - 2 * 3600 * 1000;
  Logger.log('kjorFellesTest: vindu ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest) + (historisk ? ' (historisk)' : ''));

  // 1) Apps Script-kildene (som originalen)
  var as = fase('Apps Script-henting', function () { return opoint_ft_hentAppsScript(ss, vindu, historisk, t0); });
  merknader = merknader.concat(as.merknader);
  fase('Apps Script KI', function () {
    try { as.aiStat = vurderTreffMedAI(as.treff); }
    catch (e) { merknader.push('Apps Script KI feilet: ' + e.message); }
  });

  // 2) Opoint (feil eller tidsavbrudd stopper aldri e-posten)
  var op = { ok: false, feil: '', forb: null, saker: [], ki: opoint_kj_tomKi(), sm: null, imo: null, tjeneste: null };
  var apiKey = '';
  try {
    apiKey = opoint_t3_hentNokkel();
    var tidUte = opoint_kj_tidsvakt(t0, FELLES_OPOINT_FRIST_MS);
    op.forb = fase('Opoint-henting', function () { return opoint_kj_forberedKandidater(ss, apiKey, vindu, tidUte, OPOINT_KJOR_MAX_HTTP, false); });
    opoint_ft_kobleAS(op.forb.kandidater, as.treff);
    op.tjeneste = opoint_kj_lagKiTjeneste(OPOINT_KJOR_MAKS_KI_KALL, t0, { frist: t0 + FELLES_OPOINT_FRIST_MS });
    var grupper = fase('Gruppering', function () { return opoint_kj_grupperSaker(op.forb.kandidater, op.tjeneste); });
    op.saker = opoint_kj_lagSaker(op.forb.kandidater, grupper);
    opoint_ft_merkSaker(op.saker);
    opoint_kj_settOppfolging(op.saker, vindu);
    opoint_kj_settDagensEpost(op.saker, op.forb.apps, vindu, d.dagTekst);
    var sendte7 = opoint_kj_lesSendte(ss, (vindu.oldest - OPOINT_KJ_OMTALT_DAGER * 86400) * 1000, vindu.oldest * 1000);
    op.omtalt = fase('Omtalt tidligere', function () { return opoint_kj_settOmtaltTidligere(op.saker, sendte7, op.tjeneste); });
    op.ki = fase('Relevans/prioritet', function () { return opoint_kj_vurderSaker(op.saker, op.forb.oppsett, op.tjeneste, 1, vindu); });
    op.ki.gruppering = grupper.melding;
    if (Date.now() - t0 > FELLES_OPOINT_FRIST_MS || op.forb.klient.takNadd() || !op.ki.ferdig) {
      merknader.push('Opoint avbrutt (tid/kalltak) – sendt med det som fantes (' + op.ki.ikkeVurdert + ' saker uten vurdering).');
    }
    if (Date.now() - t0 < FELLES_SAMMENDRAG_FRIST_MS) {
      op.tjeneste.settFrist(t0 + FELLES_SISTE_KI_FRIST_MS);
      op.imo = fase('IMO-vinkling', function () { return opoint_kj_imoVinkling(op.saker, op.tjeneste, vindu); });
      op.sm = fase('Sammendrag', function () { return opoint_kj_lagSammendrag(op.saker, op.tjeneste); });
    } else {
      merknader.push('Sammendrag utelatt (tid)');
    }
    op.ki.kall = op.tjeneste.kall; op.ki.kostnad = op.tjeneste.kostnad; op.ki.fraBuffer = op.tjeneste.fraBuffer;
    op.ok = true;
  } catch (e) {
    op.feil = opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey);
    Logger.log('Opoint feilet: ' + op.feil);
  }
  try { if (op.tjeneste) opoint_kj_skrivKiFeil(ss, op.tjeneste); } catch (e) { /* bare logg */ }
  if (!op.ok) opoint_ft_loggOpointFeil(ss, op.feil);

  // 3) E-post
  var epost = null, send = { driveUrl: '', melding: '' };
  fase('Sending', function () {
    try {
      epost = opoint_ft_byggFellesEpost(as, op, vindu, d, merknader);
      send = opoint_kj_lagreOgSend(epost, vindu, d.fmtSek, '[Felles-test] Medieovervåking ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest), 'Felles-test');
    } catch (e) {
      send.melding = 'E-post feilet: ' + e.message;
    }
  });

  // 4) Logging av sendte saker (bare ekte kjøringer)
  var logget = '';
  if (!historisk && LOGG_SENDTE && epost && /Sendt/.test(send.melding)) {
    try {
      opoint_ft_loggSendteSaker(ss, opoint_ft_sendteRader(epost, op.saker, new Date(), 'ekte'));
      if (as.treff.length) { leggTilSendteUrler(ss, as.treff); loggArtikler(ss, as.treff); }
      logget = 'Sendte saker logget.';
    } catch (e) { logget = 'Logging av sendte saker feilet: ' + e.message; }
  }

  // 5) Fanen «Felles-test»
  var total = Date.now() - t0;
  try {
    opoint_t3_skrivFane(ss, FELLES_FANE, opoint_ft_byggRader(as, op, epost, send, vindu, d, faser, total, merknader.concat(logget ? [logget] : []), historisk), apiKey);
  } catch (e) { Logger.log('Felles-test-fanen: ' + e.message); }
  Logger.log('kjorFellesTest ferdig på ' + Math.round(total / 1000) + ' s. ' + send.melding);
}

/** DEL G: vinduet 18.–19. nov. */
function opoint_ft_kjor1819() { kjorFellesTest('2026-11-18 07:30', '2026-11-19 07:30'); }

/**
 * DEL B5: vinduet. Begge tomme: slutt = siste 07:30 (Oslo) som er høyst 30 min frem i tid
 * (kjøring 07:40 → i dag 07:30; kjøring 21:30 → i dag 07:30), start = 24 t før.
 */
function opoint_ft_vindu(startTekst, sluttTekst, nuMs, parse) {
  if (String(startTekst || '').trim() || String(sluttTekst || '').trim()) {
    return opoint_beregnVindu(startTekst, sluttTekst, undefined, nuMs, parse);
  }
  var dag = Utilities.formatDate(new Date(nuMs + 30 * 60000), 'Europe/Oslo', 'yyyy-MM-dd');
  var slutt = Math.floor(parse(dag + ' 07:30').getTime() / 1000);
  if (slutt * 1000 > nuMs + 30 * 60000) slutt -= 86400;
  return { oldest: slutt - 86400, newest: slutt, kilde: 'automatisk' };
}

/**
 * Henter Apps Script-kildene som originalen (kjorMedieovervaking), uten å skrive til
 * «Kilder»/«Kjøringslogg». Historisk vindu: artikkeldato innenfor vinduet og ingen
 * dedup mot Sendte artikler. Ellers: originalens 72-timersvindu og dedup.
 */
function opoint_ft_hentAppsScript(ss, vindu, historisk, t0) {
  var ut = { treff: [], kategori: {}, ok: 0, totalt: 0, feilet: [], hoppet: 0, merknader: [] };
  var kilder = hentKilder(ss), sokeord = hentSokeord(ss);
  var sendte = historisk ? {} : hentSendteUrler(ss);
  ut.totalt = kilder.length;
  ut.sokeord = sokeord;
  for (var i = 0; i < kilder.length; i++) {
    if (Date.now() - t0 > FELLES_AS_FRIST_MS) { ut.hoppet = kilder.length - i; ut.merknader.push('Apps Script: ' + ut.hoppet + ' kilder hoppet over (tid).'); break; }
    var r;
    try { r = hentRSSFeed(kilder[i].url); } catch (e) { r = { suksess: false, feilmelding: e.message }; }
    if (!r.suksess) { ut.feilet.push(kilder[i].navn); continue; }
    ut.ok++;
    r.artikler.forEach(function (a) {
      if (!a.lenke) return;
      var innen = historisk ? (a.dato && a.dato.getTime() >= vindu.oldest * 1000 && a.dato.getTime() < vindu.newest * 1000) : erInnenTidsvindu(a.dato);
      if (!innen) return;
      var ord = finnMatchendeSokeord(a.tittel + ' ' + a.ingress, sokeord);
      if (!ord.length || sendte[a.lenke]) return;
      sendte[a.lenke] = true;
      var t = { tittel: a.tittel, lenke: a.lenke, ingress: a.ingress, kilde: kilder[i].navn, matchendeOrd: ord, dato: a.dato };
      ut.kategori[a.lenke] = finnKategoriForForsteSokeord(ord, sokeord);
      ut.treff.push(t);
    });
  }
  if (historisk) ut.merknader.push('Historisk vindu: Apps Script-treff valgt på artikkeldato i vinduet, uten dedup mot Sendte artikler.');
  return ut;
}

/**
 * Kobler Apps Script-treff til Opoint-kandidatene: samme URL (også dokumenter dedupen har
 * slått inn og identical_documents) → treffet festes til kandidaten. Ellers legges treffet
 * til som egen kandidat (erAS), slik at saksgrupperingen kan slå det sammen med Opoint-saker.
 */
function opoint_ft_kobleAS(kandidater, asTreff) {
  var urlKart = {};
  kandidater.forEach(function (k, i) {
    var docs = [k.doc].concat((k.slattSammen || []).map(function (x) { return x.doc; }));
    var idd = k.doc.identical_documents && Array.isArray(k.doc.identical_documents.document) ? k.doc.identical_documents.document : [];
    docs.concat(idd).forEach(function (doc) { var n = opoint_kj_normUrl(opoint_t3_artikkelUrl(doc)); if (n && urlKart[n] === undefined) urlKart[n] = i; });
  });
  (asTreff || []).forEach(function (t) {
    var n = opoint_kj_normUrl(t.lenke);
    if (n && urlKart[n] !== undefined) {
      var k = kandidater[urlKart[n]];
      k.asTreffListe = (k.asTreffListe || []).concat([t]);
      k.ekskludert = false; k.ekskluderGrunn = '';   // Apps Script-treff fjernes aldri
      return;
    }
    var vert = opoint_kj_normDomene(opoint_kj_normUrl(t.lenke));
    kandidater.push({ doc: { header: { text: t.tittel }, summary: { text: t.ingress || '' }, orig_url: t.lenke, url_common: vert,
        unix_timestamp: t.dato ? Math.floor(t.dato.getTime() / 1000) : undefined, language: { text: '' } },
      normUrl: n, domene: vert, strommer: ['AS'], sporringer: ['Apps Script: ' + t.kilde], antallTreff: 1, ekskludert: false,
      ekskluderGrunn: '', sak: '', appsStatus: '', appsArsak: '', soketerm: [], fastRelevant: false, fastNavn: [], niva: 1,
      apen: 'ukjent', nivaGrunnlag: 'Apps Script-kilde', slattSammen: [], erAS: true, asTreffListe: [t] });
  });
}

/** Saker med Apps Script-treff får asTreff (Nevner oss først) og harOp (har Opoint-artikler). */
function opoint_ft_merkSaker(saker) {
  saker.forEach(function (sak) {
    var liste = [];
    sak.medlemmer.forEach(function (m) { (m.asTreffListe || []).forEach(function (t) { liste.push(t); }); });
    sak.harOp = sak.medlemmer.some(function (m) { return !m.erAS; });
    if (!liste.length) return;
    liste.sort(function (a, b) { return (b.aiNevnerOss ? 1 : 0) - (a.aiNevnerOss ? 1 : 0); });
    sak.asTreff = liste[0];
    sak.asTreffAlle = liste;
  });
}

/** Bygger den felles e-posten med originalens mal (via opoint_kj_byggEpost). */
function opoint_ft_byggFellesEpost(as, op, vindu, d, merknader) {
  var asListe = [], vist = {};
  (op.saker || []).forEach(function (sak) {
    (sak.asTreffAlle || []).forEach(function (t, i) {
      if (i > 0) return;                       // ett kort per sak (første Apps Script-treff)
      vist[t.lenke] = true;
      asListe.push({ treff: t, sak: sak, kategori: as.kategori[t.lenke] });
    });
  });
  // Apps Script-treff som ikke ble koblet (f.eks. når Opoint feilet) vises alene
  as.treff.forEach(function (t) {
    var iSak = (op.saker || []).some(function (s) { return (s.asTreffAlle || []).indexOf(t) >= 0; });
    if (!iSak && !vist[t.lenke]) asListe.push({ treff: t, sak: null, kategori: as.kategori[t.lenke] });
  });
  var st = op.forb ? opoint_kj_statistikk(op.forb, op.saker, op.ki) : null;
  var headerAs = 'Apps Script: ' + as.ok + ' av ' + as.totalt + ' kilder hentet OK' +
    (as.feilet.length ? '. ' + as.feilet.length + ' feilet: ' + as.feilet.join(', ') : '') + (as.hoppet ? '. ' + as.hoppet + ' hoppet over (tid)' : '');
  var headerOp = op.ok ? 'Opoint: OK (' + op.forb.resultater.length + ' spørringer, ' + st.dokumenter + ' dokumenter, ' + st.grupper + ' grupper)'
    : 'Opoint feilet: ' + op.feil;
  return opoint_kj_byggEpost(op.saker || [], op.sm, vindu, d.fmtSek, true, st, op.forb ? op.forb.resultater : [],
    { asTreff: asListe, visOpprinnelse: VIS_OPPRINNELSE, headerAs: headerAs, headerOp: headerOp, ekstraLinjer: merknader.filter(function (m) {
      return /utelatt|avbrutt|feilet/.test(m); }) });
}

/** «Opoint feilet» i fanen «KI-feil». */
function opoint_ft_loggOpointFeil(ss, feil) {
  try { opoint_kj_skrivKiFeil(ss, { kiFeil: [{ tid: new Date(), kall: 'Opoint feilet (fellesløpet)', forsok: 1, raa: feil, stopReason: '', inputTokens: '', outputTokens: '', maxTokens: '' }] }); }
  catch (e) { Logger.log('KI-feil-fanen: ' + e.message); }
}

/** DEL B6 + C: rader til fanen «Felles-test». */
function opoint_ft_byggRader(as, op, epost, send, vindu, d, faser, total, merknader, historisk) {
  var kort = epost ? epost.kort : [];
  var asN = kort.filter(function (k) { return k.opphav === 'AS'; }).length, opN = kort.filter(function (k) { return k.opphav === 'OP'; }).length,
    beggeN = kort.filter(function (k) { return k.opphav === 'AS+OP'; }).length;
  var rader = [['Felles-test', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest) + (historisk ? ' (historisk)' : ''),
    'Total kjøretid (s)', Math.round(total / 1000), 'Kort i e-posten', kort.length, 'AS', asN, 'OP', opN, 'AS+OP (sammenslått)', beggeN,
    'Apps Script-treff', as.treff.length, 'Opoint', op.ok ? 'OK' : 'feilet: ' + op.feil, 'KI-kall Opoint', op.ki.kall,
    'Kostnad Opoint USD', Math.round((op.ki.kostnad || 0) * 10000) / 10000,
    'KI-kall Apps Script', as.aiStat ? as.aiStat.antallKall : 0, 'Kostnad Apps Script USD', as.aiStat ? Math.round((as.aiStat.kostnad || 0) * 10000) / 10000 : 0,
    'E-post', send.melding, 'HTML i Drive', send.driveUrl]];
  rader.push(['Varighet per fase (s)'].concat(Object.keys(faser).reduce(function (a, k) { return a.concat([k, Math.round(faser[k] / 100) / 10]); }, [])));
  rader.push(['Merknader', merknader.join(' | '), 'Gruppering', op.ki.gruppering || '', 'IMO', op.imo ? op.imo.melding : '',
    'Omtalt tidligere', op.omtalt ? op.omtalt.melding : '', 'Sammendrag', op.sm ? op.sm.melding : '']);
  rader.push(['']);
  rader.push(['I e-posten?', 'Opprinnelse', 'URL', 'Tittel', 'Prioritet', 'Kategori', 'Sak', 'Slått sammen (gruppe/IMO)', 'Årsak hvis ikke med']);
  kort.forEach(function (k) { rader.push(['ja', k.opphav, k.url, k.tittel, k.prioritet, k.kategori, k.sak, k.imo || (k.opphav === 'AS+OP' ? 'AS+OP i ' + k.sak : ''), '']); });
  // Opoint-saker som ikke fikk eget kort
  var iKort = {};
  kort.forEach(function (k) { String(k.sak).split(', ').forEach(function (s) { iKort[s] = true; }); });
  (op.saker || []).forEach(function (s) {
    if (iKort[s.id] || s.asTreff) return;
    var r = s.kiResultat || {}, dv = opoint_kj_visDoc(s);
    var aarsak = s.imoGruppe ? 'IMO-gruppe ' + s.imoGruppe.id + ' (' + s.imoGruppe.prioritet + ')' :
      (r.relevant === true && (r.prioritet || 'middels') === 'middels' ? 'Middels → «Ellers i bransjen»' : opoint_kj_sakStatus(s));
    rader.push(['nei', s.harOp ? 'OP' : 'AS', opoint_t3_artikkelUrl(dv), opointTekstFelt(dv.header), r.prioritet || '', r.kategori || '', s.id,
      s.imoGruppe ? s.imoGruppe.id + ': ' + s.imoGruppe.begrunnelse : '', aarsak]);
  });
  (op.forb ? op.forb.kandidater : []).forEach(function (k) {
    if (!k.ekskludert) return;
    rader.push(['nei', 'OP', opoint_t3_artikkelUrl(k.doc), opointTekstFelt(k.doc.header), '', '', '', '', 'Ekskludert: ' + k.ekskluderGrunn]);
  });
  return rader;
}

// =====================================================================
// DEL D: «Sendte saker» – historikk for Oppfølging/Omtalt tidligere
// =====================================================================

/** Rader for sendte saker: hvert kort i e-posten (Opoint-saker med alle URL-er i gruppen). */
function opoint_ft_sendteRader(epost, saker, tid, merknad) {
  var sakFor = {};
  (saker || []).forEach(function (s) { sakFor[s.id] = s; });
  var rader = [];
  epost.kort.forEach(function (k) {
    if (k.prioritet === 'irrelevant') return;
    String(k.sak || '').split(', ').filter(function (x) { return x; }).forEach(function (id) {
      var s = sakFor[id];
      rader.push(opoint_ft_sakRad(s, tid, merknad, k.tittel, k.url, k.prioritet));
    });
    if (!k.sak) rader.push([tid, '', k.url, k.url, k.tittel, '', k.prioritet, merknad]);
  });
  // Middels i «Ellers i bransjen»
  (saker || []).forEach(function (s) {
    var r = s.kiResultat || {};
    if (s.asTreff || s.sprakEkskludert || s.oppfolging || r.relevant !== true || (r.prioritet || 'middels') !== 'middels' || s.imoGruppe) return;
    rader.push(opoint_ft_sakRad(s, tid, merknad, null, null, 'middels'));
  });
  return rader;
}

function opoint_ft_sakRad(s, tid, merknad, tittel, url, pri) {
  if (!s) return [tid, '', url || '', url || '', tittel || '', '', pri || '', merknad];
  var urler = [];
  s.medlemmer.forEach(function (m) {
    urler.push(opoint_t3_artikkelUrl(m.doc));
    (m.slattSammen || []).forEach(function (x) { urler.push(opoint_t3_artikkelUrl(x.doc)); });
  });
  var dv = opoint_kj_visDoc(s);
  return [tid, s.id, opoint_t3_artikkelUrl(dv), urler.filter(function (x, i) { return x && urler.indexOf(x) === i; }).join(' '),
    tittel || opointTekstFelt(dv.header), opoint_kj_sakIngress(s).tekst, pri || ((s.kiResultat || {}).prioritet || ''), merknad];
}

/** Legger rader nederst i «Sendte saker» (oppretter fanen). Fjerner først eksisterende rader med samme dato og merknad. */
function opoint_ft_loggSendteSaker(ss, rader) {
  var ark = ss.getSheetByName(OPOINT_FANE_SENDTE_SAKER);
  if (!ark) {
    ark = ss.insertSheet(OPOINT_FANE_SENDTE_SAKER);
    ark.getRange(1, 1, 1, OPOINT_SENDTE_SAKER_KOLONNER.length).setValues([OPOINT_SENDTE_SAKER_KOLONNER]);
  }
  if (!rader.length) return 0;
  var bredde = OPOINT_SENDTE_SAKER_KOLONNER.length;
  ark.getRange(ark.getLastRow() + 1, 1, rader.length, bredde).setValues(rader.map(function (r) { return r.slice(0, bredde); }));
  return rader.length;
}

function opoint_ft_simulerHistorikk17() { opoint_ft_simulerHistorikk('2026-11-16 07:30', '2026-11-17 07:30'); }
function opoint_ft_simulerHistorikk18() { opoint_ft_simulerHistorikk('2026-11-17 07:30', '2026-11-18 07:30'); }
function opoint_ft_simulerHistorikk19() { opoint_ft_simulerHistorikk('2026-11-18 07:30', '2026-11-19 07:30'); }

/**
 * DEL D b: Opoint-løpet (uten Apps Script og uten e-post) for et vindu; høy- og middels-saker
 * legges i «Sendte saker» med dato = vinduets slutt og merknaden «simulert». Eldre simulerte
 * rader for samme dato fjernes først, så funksjonen kan kjøres på nytt.
 */
function opoint_ft_simulerHistorikk(start, slutt) {
  var t0 = Date.now(), ss = SpreadsheetApp.getActiveSpreadsheet(), d = opoint_t3_datoFunksjoner();
  var apiKey = opoint_t3_hentNokkel();
  var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
  var vindu = opoint_beregnVindu(start, slutt, undefined, t0, parse);
  var forb = opoint_kj_forberedKandidater(ss, apiKey, vindu, opoint_kj_tidsvakt(t0, OPOINT_KJOR_TIDSBUDSJETT_MS), OPOINT_KJOR_MAX_HTTP, false);
  var tj = opoint_kj_lagKiTjeneste(OPOINT_KJOR_MAKS_KI_KALL, t0);
  var saker = opoint_kj_lagSaker(forb.kandidater, opoint_kj_grupperSaker(forb.kandidater, tj));
  opoint_kj_settOppfolging(saker, vindu);
  var ki = opoint_kj_vurderSaker(saker, forb.oppsett, tj, 0, vindu);
  opoint_kj_imoVinkling(saker, tj, vindu);
  try { opoint_kj_skrivKiFeil(ss, tj); } catch (e) { /* bare logg */ }
  var tid = new Date(vindu.newest * 1000);
  var rader = [];
  saker.forEach(function (s) {
    var r = s.kiResultat || {};
    if (s.sprakEkskludert || s.oppfolging || r.relevant !== true || r.prioritet === 'lav') return;
    rader.push(opoint_ft_sakRad(s, tid, 'simulert', null, null, s.imoGruppe ? s.imoGruppe.prioritet : r.prioritet));
  });
  opoint_ft_fjernSimulerte(ss, tid);
  var n = opoint_ft_loggSendteSaker(ss, rader);
  Logger.log('Simulert historikk ' + start + ' – ' + slutt + ': ' + n + ' saker lagt i «' + OPOINT_FANE_SENDTE_SAKER + '». ' + ki.melding +
    (ki.ferdig ? '' : ' OBS: KI ikke fullført – kjør på nytt.'));
}

function opoint_ft_fjernSimulerte(ss, tid) {
  var ark = ss.getSheetByName(OPOINT_FANE_SENDTE_SAKER);
  if (!ark || ark.getLastRow() < 2) return;
  var data = ark.getRange(2, 1, ark.getLastRow() - 1, OPOINT_SENDTE_SAKER_KOLONNER.length).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var t = data[i][0];
    if (data[i][7] === 'simulert' && Object.prototype.toString.call(t) === '[object Date]' && t.getTime() === tid.getTime()) ark.deleteRow(i + 2);
  }
}

// =====================================================================
// DEL E: sikkerhet
// =====================================================================

function opoint_ft_sikkerhet() {
  var props = PropertiesService.getScriptProperties();
  var utl = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ' (' + t.getEventType() + ')';
  });
  Logger.log('Utløsere i prosjektet: ' + (utl.length ? utl.join(', ') : 'ingen'));
  Logger.log('TEST_EPOST: ' + (props.getProperty('TEST_EPOST') ? 'satt' : 'MANGLER') + ' · OPOINT_API_KEY: ' +
    (props.getProperty('OPOINT_API_KEY') ? 'satt' : 'MANGLER') + ' · ANTHROPIC_API_KEY: ' + (props.getProperty('ANTHROPIC_API_KEY') ? 'satt' : 'MANGLER') +
    ' · AI_MODEL: ' + (props.getProperty('AI_MODEL') || 'MANGLER'));
  Logger.log('Regneark: ' + SpreadsheetApp.getActiveSpreadsheet().getName() + ' (nøklene leses fra dette prosjektets Script Properties).');
}

// =====================================================================
// DEL F: engangsutløser i morgen
// =====================================================================

/** Oppretter ÉN engangsutløser (FELLES_TRIGGER_TID, Oslo) for kjorFellesTest. Fjerner eventuelle gamle først. */
function planleggFellesTest() {
  avbrytFellesTest();
  var tid = Utilities.parseDate(FELLES_TRIGGER_TID, 'Europe/Oslo', 'yyyy-MM-dd HH:mm');
  ScriptApp.newTrigger(FELLES_TRIGGER_FUNKSJON).timeBased().at(tid).create();
  Logger.log('Satt opp ÉN engangsutløser: ' + FELLES_TRIGGER_FUNKSJON + ' → kjorFellesTest() ' + FELLES_TRIGGER_TID +
    ' (Europe/Oslo). Apps Script kjører den innen noen minutter etter dette tidspunktet. Utløseren sletter seg selv når den har kjørt. ' +
    'E-post går bare til TEST_EPOST. Fjern med avbrytFellesTest().');
}

/** Fjerner alle utløsere for fellestesten. */
function avbrytFellesTest() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === FELLES_TRIGGER_FUNKSJON) { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('avbrytFellesTest: fjernet ' + n + ' utløser(e) for ' + FELLES_TRIGGER_FUNKSJON + '.');
}

/** Kjøres av utløseren: sletter utløseren først, så kjorFellesTest() med automatisk vindu. */
function opoint_ft_triggerKjor() {
  avbrytFellesTest();
  kjorFellesTest('', '');
}
