/**
 * FellesTest.gs – felles e-post med Apps Script-kildene og Opoint (KUN testkopien).
 *
 *   kjorFellesTest()            hele løpet for vinduet i FELLES_START/FELLES_SLUTT (tomt = automatisk)
 *   opoint_ft_kjor1819()        DEL G: vinduet 2026-11-18 07:30 – 2026-11-19 07:30
 *   opoint_ft_kjor1920()        rettelsene 20. nov: vinduet 2026-11-19 07:30 – 2026-11-20 07:30 (med recall-sjekk)
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
var VIS_TESTINFO = false;              // Felles DEL 4a: av – tallene står i fanen «Felles-test» og i rapporten
var ARKIV_URL = '';                    // v2 DEL 4: satt → lenken «Se alle treff i arkivet» i e-posten (arkivet er ikke bygget)
var KONTROLL_AKTIV = true;             // v2 DEL 3: kontroll-lesing før sending
var KONTROLL_FANE = 'Kontroll-lesing';
var KONTROLL_PER_KALL = 25;            // over 25 kort → to kall
var KONTROLL_MAKS_FJERN = 2;           // maks kort kontroll-lesingen kan ta ut per e-post

// =====================================================================
// DEL B: kjorFellesTest
// =====================================================================

function kjorFellesTest(startTekst, sluttTekst) {
  var t0 = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var d = opoint_t3_datoFunksjoner();
  var parse = function (x) { return Utilities.parseDate(x, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
  var st0 = typeof startTekst === 'string' ? startTekst : FELLES_START, sl0 = typeof sluttTekst === 'string' ? sluttTekst : FELLES_SLUTT;
  var vindu = opoint_ft_vindu(st0, sl0, t0, parse);
  // v2 DEL 2: et oppgitt vindu er alltid en ny kjøring (historisk), også kort etter vindusslutt.
  var historisk = opoint_ft_erHistorisk(st0, sl0, vindu, t0);
  // Felles DEL 2/5: ved ny kjøring brukes Apps Script-treffene som faktisk ble sendt den dagen (Sendte artikler +
  // Artikkellogg + den sendte e-posten) – RSS-kildene viser ikke lenger det som lå der da. Finnes ingen, hentes kildene.
  var dag = Utilities.formatDate(new Date(vindu.newest * 1000), 'Europe/Oslo', 'yyyy-MM-dd');
  var res = opoint_ft_kjorKjerne({
    ss: ss, d: d, t0: t0, vindu: vindu, historisk: historisk, fane: FELLES_FANE, filprefiks: 'Felles-test',
    emne: '[Felles-test] Medieovervåking ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest),
    hentAs: function (fase) {
      if (historisk) {
        var fra = opoint_ft_asFraSendte(ss, dag, vindu, d);
        if (fra.sendteAntall > 0 || fra.epostFunnet) return fra;
      }
      var as = opoint_ft_hentAppsScript(ss, vindu, historisk, t0);
      fase('Apps Script KI', function () {
        try { as.aiStat = vurderTreffMedAI(as.treff); } catch (e) { as.merknader.push('Apps Script KI feilet: ' + e.message); }
      });
      return as;
    },
    loggSendte: !historisk && LOGG_SENDTE ? { merknad: 'ekte', tid: null, produksjon: true } : null,
    tilArtiklerMs: historisk ? vindu.oldest * 1000 : vindu.newest * 1000
  });
  Logger.log('kjorFellesTest ferdig på ' + Math.round(res.total / 1000) + ' s. ' + res.send.melding);
  return res;
}

/**
 * Felles kjerne for kjorFellesTest og backfill. spec: {ss, d, t0, vindu, historisk, fane, filprefiks, emne,
 * hentAs(fase) → as, loggSendte: {merknad, tid (Date|null = nå), produksjon (Sendte artikler/Artikkellogg)} | null,
 * tilArtiklerMs}. Apps Script og Opoint er hver for seg i try/catch; e-posten sendes uansett.
 */
function opoint_ft_kjorKjerne(spec) {
  var ss = spec.ss, d = spec.d, t0 = spec.t0, vindu = spec.vindu, historisk = spec.historisk;
  var faser = {}, merknader = [];
  var fase = function (navn, fn) { var s0 = Date.now(); try { return fn(); } finally { faser[navn] = (faser[navn] || 0) + (Date.now() - s0); } };
  Logger.log('Felles-kjøring: vindu ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest) + (historisk ? ' (historisk/ny kjøring)' : ''));

  // 1) Apps Script (feil stopper aldri Opoint eller e-posten)
  var as;
  try { as = fase('Apps Script-henting', function () { return spec.hentAs(fase); }); }
  catch (e) {
    as = { treff: [], kategori: {}, ok: 0, totalt: 0, feilet: [], hoppet: 0, merknader: ['Apps Script feilet: ' + e.message] };
    opoint_ft_loggOpointFeil(ss, 'Apps Script feilet (fellesløpet): ' + e.message);
  }
  merknader = merknader.concat(as.merknader || []);

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
    op.egne = fase('Egne vinkler', function () { return opoint_kj_delEgneGrupper(op.forb.kandidater, grupper, op.tjeneste); });
    op.saker = opoint_kj_lagSaker(op.forb.kandidater, grupper);
    opoint_ft_merkSaker(op.saker);
    opoint_kj_settOppfolging(op.saker, vindu);
    op.saker.forEach(function (s) { s.iDagensEpost = false; });   // AS står i SAMME e-post
    var sendte7 = opoint_kj_lesSendte(ss, (vindu.oldest - OPOINT_KJ_OMTALT_DAGER * 86400) * 1000, vindu.newest * 1000, spec.tilArtiklerMs);
    op.antallSendte = sendte7.length;
    op.omtalt = fase('Omtalt tidligere', function () { return opoint_kj_settOmtaltTidligere(op.saker, sendte7, op.tjeneste); });
    op.ki = fase('Relevans/prioritet', function () { return opoint_kj_vurderSaker(op.saker, op.forb.oppsett, op.tjeneste, 1, vindu); });
    op.ki.gruppering = grupper.melding;
    if (Date.now() - t0 > FELLES_OPOINT_FRIST_MS || op.forb.klient.takNadd() || !op.ki.ferdig) {
      merknader.push('Opoint avbrutt (tid/kalltak) – sendt med det som fantes (' + op.ki.ikkeVurdert + ' saker uten vurdering).');
    }
    if (Date.now() - t0 < FELLES_SAMMENDRAG_FRIST_MS) {
      op.tjeneste.settFrist(t0 + FELLES_SISTE_KI_FRIST_MS);
      op.imo = fase('IMO-vinkling', function () { return opoint_kj_imoVinkling(op.saker, op.tjeneste, vindu); });
      op.opps = fase('Oppsummering', function () { return opoint_kj_lagOppsummeringer(op.saker, op.tjeneste); });
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

  // 3) E-post: bygg → andre språk (DEL 2a) → kontroll-lesing (DEL 3) → send. Ingen av delene kan hindre sendingen.
  var epost = null, send = { driveUrl: '', melding: '' };
  try { epost = opoint_ft_byggFellesEpost(as, op, vindu, d, merknader); } catch (e) { send.melding = 'E-post kunne ikke bygges: ' + e.message; }
  var feilFor = op.tjeneste ? op.tjeneste.kiFeil.length : 0;
  if (epost) {
    fase('Andre språk', function () {
      try {
        if (op.tjeneste) op.tjeneste.settFrist(t0 + FELLES_SISTE_KI_FRIST_MS + 45000);
        op.fremmed = opoint_ft_fordelFremmedspraak(op, epost.kort, op.tjeneste, as.treff);
        if (op.fremmed.antall) epost = opoint_ft_byggFellesEpost(as, op, vindu, d, merknader);
      } catch (e) { merknader.push('Andre språk feilet: ' + e.message); op.fremmed = null; }
    });
  }
  if (epost && KONTROLL_AKTIV) {
    fase('Kontroll-lesing', function () {
      try {
        op.kontroll = opoint_ft_kontrollLes({ epost: epost, saker: op.saker, sm: op.sm, tjeneste: op.tjeneste, vindu: vindu, d: d });
        if (op.kontroll.endret) {
          try { epost = opoint_ft_byggFellesEpost(as, op, vindu, d, merknader, op.kontroll.overstyr); }
          catch (e) { op.kontroll.melding += ' Ny bygging feilet (' + e.message + ') – sendt uten endringene.'; }
        }
      } catch (e) { op.kontroll = { logg: [], melding: 'Kontroll-lesing feilet: ' + e.message + ' – sendt uten kontroll.' }; }
      try { opoint_ft_loggKontroll(ss, op.kontroll, vindu, d); } catch (e) { Logger.log('Kontroll-lesing-fanen: ' + e.message); }
    });
  }
  try { if (op.tjeneste && op.tjeneste.kiFeil.length > feilFor) opoint_kj_skrivKiFeil(ss, { kiFeil: op.tjeneste.kiFeil.slice(feilFor) }); } catch (e) { /* bare logg */ }
  if (op.tjeneste) { op.ki.kall = op.tjeneste.kall; op.ki.kostnad = op.tjeneste.kostnad; }
  fase('Sending', function () {
    if (!epost) return;
    try { send = opoint_kj_lagreOgSend(epost, vindu, d.fmtSek, spec.emne, spec.filprefiks); }
    catch (e) { send.melding = 'E-post feilet: ' + e.message; opoint_ft_loggOpointFeil(ss, 'E-post feilet: ' + e.message); }
  });

  // 4) Logging av sendte kort (ekte kjøring eller backfill)
  var logget = '';
  if (spec.loggSendte && epost && /Sendt/.test(send.melding)) {
    try {
      opoint_ft_loggSendteSaker(ss, opoint_ft_sendteRader(epost, op.saker, spec.loggSendte.tid || new Date(), spec.loggSendte.merknad, { setninger: epost.setningerVist || [] }));
      if (spec.loggSendte.produksjon && as.treff.length) { leggTilSendteUrler(ss, as.treff); loggArtikler(ss, as.treff); }
      logget = 'Sendte kort logget i «' + OPOINT_FANE_SENDTE_SAKER + '» (' + spec.loggSendte.merknad + ').';
    } catch (e) { logget = 'Logging av sendte kort feilet: ' + e.message; }
  }

  // 4b) Recall mot fasit (etter sendingen, så den aldri hindrer e-posten)
  op.recall = null;
  var fasitId = opoint_ft_fasitFor(vindu, d);
  if (fasitId && op.ok && Date.now() - t0 < FELLES_RECALL_FRIST_MS) {
    fase('Recall', function () {
      try {
        var tu = opoint_kj_tidsvakt(t0, FELLES_SISTE_KI_FRIST_MS + 30000);
        var dk = opoint_t3_lagKlient(apiKey, 12);
        op.recall = OPOINT_KJ_RECALL_FASIT[fasitId].saker.map(function (f) { return opoint_kj_recallEn(f, op.forb, op.saker, dk, vindu, tu, fasitId); });
      } catch (e) { merknader.push('Recall feilet: ' + opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)); }
    });
  }

  // 5) Fanen
  var total = Date.now() - t0;
  try {
    opoint_t3_skrivFane(ss, spec.fane, opoint_ft_byggRader(as, op, epost, send, vindu, d, faser, total, merknader.concat(logget ? [logget] : []), historisk), apiKey);
  } catch (e) { Logger.log('Fanen ' + spec.fane + ': ' + e.message); }
  return { as: as, op: op, epost: epost, send: send, faser: faser, total: total, merknader: merknader, logget: logget };
}

/** v2 DEL 2: ny kjøring av et oppgitt vindu (eller vindu som sluttet for over 2 t siden) = historisk: AS på artikkeldato, ingen logging. */
function opoint_ft_erHistorisk(startTekst, sluttTekst, vindu, nuMs) {
  if (String(startTekst || '').trim() || String(sluttTekst || '').trim()) return true;
  return vindu.newest * 1000 < nuMs - 2 * 3600 * 1000;
}

/** DEL G: vinduet 18.–19. nov. */
function opoint_ft_kjor1819() { kjorFellesTest('2026-11-18 07:30', '2026-11-19 07:30'); }

/** Rettelsene 20. nov: samme vindu som Felles-testen 20. nov (historisk nå: ingen logging til Sendte saker/Sendte artikler). */
function opoint_ft_kjor1920() { kjorFellesTest('2026-11-19 07:30', '2026-11-20 07:30'); }

var FELLES_RECALL_FRIST_MS = 5 * 60 * 1000;   // recall hoppes over hvis kjøringen har brukt mer enn 5 min

/** Id i OPOINT_KJ_RECALL_FASIT med nøyaktig samme vindu, eller ''. */
function opoint_ft_fasitFor(vindu, d) {
  var a = d.fmtSek(vindu.oldest), b = d.fmtSek(vindu.newest);
  var ider = Object.keys(OPOINT_KJ_RECALL_FASIT).filter(function (k) { return OPOINT_KJ_RECALL_FASIT[k].start === a && OPOINT_KJ_RECALL_FASIT[k].slutt === b; });
  return ider[0] || '';
}

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
    // Felles DEL 2a: språk (AS-treff har ikke språkfelt; tittel + RSS-ingress + landsdomene)
    if (t.sprak === undefined) t.sprak = opoint_kj_sprakFraTekst(t.tittel + ' ' + (t.ingress || ''), t.lenke);
    var n = opoint_kj_normUrl(t.lenke);
    if (n && urlKart[n] !== undefined) {
      var k = kandidater[urlKart[n]];
      k.asTreffListe = (k.asTreffListe || []).concat([t]);
      k.ekskludert = false; k.ekskluderGrunn = '';   // Apps Script-treff fjernes aldri
      return;
    }
    var vert = opoint_kj_normDomene(opoint_kj_normUrl(t.lenke));
    kandidater.push({ doc: { header: { text: t.tittel }, summary: { text: t.ingress || '' }, orig_url: t.lenke, url_common: vert,
        unix_timestamp: t.dato ? Math.floor(t.dato.getTime() / 1000) : undefined, language: { text: t.sprak || '' } }, asSprak: t.sprak || '',
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
    // Felles DEL 2a: AS-treff på andre språk får aldri eget kort (vises som «Andre kilder» / «Også omtalt på …»)
    sak.asFremmed = liste.filter(function (t) { return t.sprak; });
    liste = liste.filter(function (t) { return !t.sprak; });
    if (!liste.length || sak.sprakEkskludert) return;
    liste.sort(function (a, b) { return (b.aiNevnerOss ? 1 : 0) - (a.aiNevnerOss ? 1 : 0); });
    sak.asTreff = liste[0];
    sak.asTreffAlle = liste;
  });
}

/**
 * Felles DEL 2a: artikler på andre språk enn no/nb/nn/sv/da/en. (1) AS-treff på andre språk i en sak som får kort →
 * «Også omtalt» på det kortet. (2) Språkekskluderte saker med egne navn/prosjekter eller Apps Script-treff → KI
 * tilordner til nærmeste kort (bare samme prosjekt, aktør eller tema); ellers «Også omtalt på <språk>» under «Om oss».
 * Returnerer {perKort: {K1: [{navn, url}]}, omOss: [{navn, url, sprak}], antall, logg: [...]}.
 */
var FREMMED_SYSTEM =
  'Du får artikler på andre språk (A1, A2 …) og kortene i en norsk medieovervåking for Maritime CleanTech (K1, K2 …). ' +
  'Tilordne hver artikkel til kortet den passer best til, men BARE hvis artikkelen handler om samme prosjekt, aktør eller ' +
  'tema som kortet. Ellers "kort": null. Du skal ikke skrive noe innhold.\n\nSvar KUN med JSON, uten kodeblokk: ' +
  '{"tilordning": [{"artikkel": "A1", "kort": "K3"}, {"artikkel": "A2", "kort": null}]}';

function opoint_ft_fordelFremmedspraak(op, kort, tjeneste, asTreff) {
  var ut = { perKort: {}, omOss: [], antall: 0, logg: [] };
  var kortForSak = {};
  kort.forEach(function (k) { String(k.sak || '').split(', ').forEach(function (id) { if (id && !kortForSak[id]) kortForSak[id] = k; }); });
  var item = function (tittel, url, sp, kilde) {
    var dom = opoint_kj_normDomene(opoint_kj_normUrl(url)) || kilde || '?';
    return { tittel: tittel, url: url, sprak: sp, navn: dom + ' (' + sp + ')', kilde: kilde || dom };
  };
  var ledige = [];
  (op.saker || []).forEach(function (s) {
    var liste = (s.asFremmed || []).map(function (t) { return item(t.tittel, t.lenke, t.sprak, t.kilde); });
    if (s.sprakEkskludert && s.egen && s.harOp) {
      var dv = opoint_kj_visDoc(s);
      liste.push(item(opointTekstFelt(dv.header), opoint_t3_artikkelUrl(dv), s.sprakEkskludert, s.representant.domene));
    }
    if (!liste.length) return;
    var k = kortForSak[s.id];
    if (k) { ut.perKort[k.id] = (ut.perKort[k.id] || []).concat(liste); liste.forEach(function (x) { ut.logg.push([x.tittel, x.navn, 'Andre kilder på ' + k.id + ' (samme gruppe)']); }); }
    else ledige = ledige.concat(liste);
  });
  // AS-treff på andre språk som ikke ligger i noen sak (f.eks. når Opoint feilet)
  (asTreff || []).forEach(function (t) {
    if (!t.sprak) return;
    var iSak = (op.saker || []).some(function (s) { return (s.asFremmed || []).indexOf(t) >= 0; });
    if (!iSak) ledige.push(item(t.tittel, t.lenke, t.sprak, t.kilde));
  });
  ut.antall = ledige.length + Object.keys(ut.perKort).reduce(function (a, k) { return a + ut.perKort[k].length; }, 0);
  if (!ledige.length) return ut;
  var kandKort = kort.filter(function (k) { return k.prioritet !== 'irrelevant'; });
  var valg = {};
  if (tjeneste && kandKort.length) {
    var tekst = 'ARTIKLER:\n' + ledige.map(function (x, i) { return 'A' + (i + 1) + ' | ' + x.tittel + ' | ' + x.kilde; }).join('\n') +
      '\n\nKORT:\n' + kandKort.map(function (k) { return k.id + ' | ' + k.kategori + ' | ' + k.tittel + ' | ' + opointKort(k.ingress || '', 200); }).join('\n');
    var sv = tjeneste.spor('fremmed', FREMMED_SYSTEM, tekst, 100 + 40 * ledige.length);
    var o = sv.ok ? opoint_kj_parseJson(sv.tekst) : null;
    if (sv.ok && !(o && Array.isArray(o.tilordning))) { tjeneste.loggParseFeil('andre språk', sv, 1); o = null; }
    (o ? o.tilordning : []).forEach(function (x) {
      var n = Number(String(x && x.artikkel || '').replace(/^A/i, '')), kid = x && x.kort ? String(x.kort).toUpperCase() : '';
      if (n >= 1 && n <= ledige.length && kandKort.some(function (k) { return k.id === kid; })) valg[n - 1] = kid;
    });
    if (!o) ut.logg.push(['', '', 'KI-tilordning feilet – regel brukt']);
  }
  ledige.forEach(function (x, i) {
    var kid = valg[i];
    if (!kid && !tjeneste) {   // regel: samme egne navn i tittelen
      var navn = OUR_NAMES.map(function (n) { return typeof n === 'string' ? n : n.navn; }).filter(function (n) { return x.tittel.toLowerCase().indexOf(n.toLowerCase()) >= 0; });
      var k0 = navn.length ? kandKort.filter(function (k) { return navn.some(function (n) { return (k.tittel + ' ' + k.ingress).toLowerCase().indexOf(n.toLowerCase()) >= 0; }); })[0] : null;
      if (k0) kid = k0.id;
    }
    if (kid) { ut.perKort[kid] = (ut.perKort[kid] || []).concat([x]); ut.logg.push([x.tittel, x.navn, 'Andre kilder på ' + kid]); }
    else { ut.omOss.push(x); ut.logg.push([x.tittel, x.navn, '«Også omtalt på ' + opoint_kj_sprakNavn(x.sprak) + '» under Om oss']); }
  });
  return ut;
}

/** Bygger den felles e-posten med originalens mal (via opoint_kj_byggEpost). */
function opoint_ft_byggFellesEpost(as, op, vindu, d, merknader, overstyr) {
  var asListe = [], vist = {};
  (op.saker || []).forEach(function (sak) {
    (sak.asTreffAlle || []).forEach(function (t, i) {
      if (i > 0) return;                       // ett kort per sak (første Apps Script-treff)
      vist[t.lenke] = true;
      asListe.push({ treff: t, sak: sak, kategori: as.kategori[t.lenke] });
    });
  });
  // Apps Script-treff som ikke ble koblet (f.eks. når Opoint feilet) vises alene – men aldri på andre språk (DEL 2a)
  as.treff.forEach(function (t) {
    if (t.sprak === undefined) t.sprak = opoint_kj_sprakFraTekst(t.tittel + ' ' + (t.ingress || ''), t.lenke);
    var iSak = (op.saker || []).some(function (s) { return (s.asTreffAlle || []).indexOf(t) >= 0 || (s.asFremmed || []).indexOf(t) >= 0; });
    if (!iSak && !vist[t.lenke] && !t.sprak) asListe.push({ treff: t, sak: null, kategori: as.kategori[t.lenke] });
  });
  var st = op.forb ? opoint_kj_statistikk(op.forb, op.saker, op.ki) : null;
  var headerAs = 'Apps Script: ' + as.ok + ' av ' + as.totalt + ' kilder hentet OK' +
    (as.feilet.length ? '. ' + as.feilet.length + ' feilet: ' + as.feilet.join(', ') : '') + (as.hoppet ? '. ' + as.hoppet + ' hoppet over (tid)' : '');
  // Rettelse 8: «søk» = antall Opoint-spørringer (ikke batcher), «artikler» = hentede dokumenter inkl. identical_documents,
  // «saker» = grupper etter KI-gruppering (også enkeltartikler)
  var headerOp = op.ok ? 'Opoint: OK (' + op.forb.resultater.length + ' søk, ' + st.dokumenter + ' artikler, ' + st.grupper + ' saker)'
    : 'Opoint feilet: ' + op.feil;
  if (overstyr && overstyr.flagget) headerOp += ' · Kontroll-lesing: ' + overstyr.flagget + ' kort flagget';
  return opoint_kj_byggEpost(op.saker || [], op.sm, vindu, d.fmtSek, true, st, op.forb ? op.forb.resultater : [],
    { asTreff: asListe, visOpprinnelse: VIS_OPPRINNELSE, headerAs: headerAs, headerOp: headerOp, visTestinfo: VIS_TESTINFO, arkivUrl: ARKIV_URL,
      fremmed: op.fremmed || null,
      kontroll: overstyr || null, ekstraLinjer: merknader.filter(function (m) { return /utelatt|avbrutt|feilet/.test(m); }) });
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
  rader.push(['Merknader', merknader.join(' | '), 'Gruppering', op.ki.gruppering || '', 'Egne vinkler', op.egne ? op.egne.melding : '',
    'IMO', op.imo ? op.imo.melding : '', 'Omtalt tidligere / Oppfølging', (op.omtalt ? op.omtalt.melding : '') +
    (op.antallSendte !== undefined ? ' (lest ' + op.antallSendte + ' sendte rader fra Sendte saker + Sendte artikler)' : ''),
    'Oppsummering', op.opps ? op.opps.melding : '', 'Sammendrag', op.sm ? op.sm.melding : '']);
  rader.push(['']);
  var sakFor = {};
  (op.saker || []).forEach(function (s) { sakFor[s.id] = s; });
  var grunn = function (id) { var s = sakFor[String(id).split(', ')[0]]; return s && s.kiResultat ? (s.kiResultat.prioritetGrunn || s.kiResultat.kilde || '') : ''; };
  var ingressInfo = function (id) {
    var s = sakFor[String(id).split(', ')[0]]; if (!s) return '';
    var x = opoint_kj_sakIngress(s);
    return x.oppsummert ? 'KI-oppsummert' : (x.god ? 'god' : 'ikke god: ' + (x.grunn || '')) + (x.fra ? ' (fra ' + x.fra + ')' : '');
  };
  rader.push(['I e-posten?', 'Opprinnelse', 'URL', 'Tittel', 'Prioritet', 'Kategori', 'Sak', 'Slått sammen (gruppe/IMO)', 'Årsak hvis ikke med',
    'Prioritet – grunn (én linje)', 'Ingress']);
  kort.forEach(function (k) {
    var s0 = sakFor[String(k.sak).split(', ')[0]];
    rader.push(['ja', k.opphav, k.url, k.tittel, k.prioritet, k.kategori, k.sak, k.imo || (k.opphav === 'AS+OP' ? 'AS+OP i ' + k.sak : ''),
      k.oppdatering && s0 && s0.oppdatering ? 'Oppdatering: ' + s0.oppdatering.nytt : '', grunn(k.sak), ingressInfo(k.sak)]);
  });
  // Opoint-saker som ikke fikk eget kort
  var iKort = {};
  kort.forEach(function (k) { String(k.sak).split(', ').forEach(function (s) { iKort[s] = true; }); });
  (op.saker || []).forEach(function (s) {
    if (iKort[s.id] || s.asTreff) return;
    var r = s.kiResultat || {}, dv = opoint_kj_visDoc(s);
    var aarsak = s.imoGruppe ? 'IMO-gruppe ' + s.imoGruppe.id + ' (' + s.imoGruppe.prioritet + ')' :
      (r.relevant === true && (r.prioritet || 'middels') === 'middels' ? 'Middels → «Ellers i bransjen»' : opoint_kj_sakStatus(s));
    rader.push(['nei', s.harOp ? 'OP' : 'AS', opoint_t3_artikkelUrl(dv), opointTekstFelt(dv.header), r.prioritet || '', r.kategori || '', s.id,
      s.imoGruppe ? s.imoGruppe.id + ': ' + s.imoGruppe.begrunnelse : '', aarsak, r.prioritetGrunn || r.kilde || '']);
  });
  (op.forb ? op.forb.kandidater : []).forEach(function (k) {
    if (!k.ekskludert) return;
    rader.push(['nei', 'OP', opoint_t3_artikkelUrl(k.doc), opointTekstFelt(k.doc.header), '', '', '', '', 'Ekskludert: ' + k.ekskluderGrunn]);
  });
  return rader.concat(opoint_ft_raderBeholdt(as, op, epost), opoint_ft_raderAsTreff(as, op, kort), opoint_ft_raderKontroll(op),
    opoint_ft_raderRepresentant(op, kort, d), opoint_ft_raderRecall(op));
}

/** Rettelse 2: hvert Apps Script-treff – hvilken sak og hvilket kort det havnet i. */
function opoint_ft_raderAsTreff(as, op, kort) {
  var rader = [[''], ['Apps Script-treff', 'Kilde', 'Søkeord', 'URL', 'Sak', 'Antall artikler i saken', 'Kort i e-posten', 'Merknad']];
  var kortFor = {};
  kort.forEach(function (k) { String(k.sak || '').split(', ').forEach(function (id) { if (id && !kortFor[id]) kortFor[id] = k; }); });
  as.treff.forEach(function (t) {
    var sak = (op.saker || []).filter(function (s) { return (s.asTreffAlle || []).indexOf(t) >= 0; })[0];
    var k = sak ? kortFor[sak.id] : kort.filter(function (x) { return x.url === t.lenke; })[0];
    var n = sak ? sak.medlemmer.length + sak.medlemmer.reduce(function (a, m) { return a + (m.slattSammen || []).length; }, 0) : 1;
    var fr = op.fremmed ? opoint_ft_fremmedPlass(op.fremmed, t.lenke) : '';
    var merk = t.sprak ? 'språk (' + t.sprak + '): ' + (fr || 'ikke eget kort') : !k ? 'INGEN KORT' : (sak && sak.asTreff !== t ? 'samme kort som et annet Apps Script-treff (samme hendelse)' : (k.url === t.lenke ? 'eget kort' : 'kortet viser saken'));
    rader.push([t.tittel, t.kilde, (t.matchendeOrd || []).join(', '), t.lenke, sak ? sak.id : '(ingen sak)', n, k ? k.tittel : '', merk]);
  });
  if (op.egne && op.egne.detaljer && op.egne.detaljer.length) {
    rader.push(['Egne vinkler (KI)', op.egne.melding]);
    op.egne.detaljer.forEach(function (x, i) {
      rader.push(['Gruppe ' + (i + 1), x.forGruppe.length + ' artikler → ' + x.etter.length + ' undergrupper',
        x.etter.map(function (u) { return '[' + u.map(function (ix) { var k = op.forb.kandidater[ix]; return opointKort((k.asTreffListe && k.asTreffListe[0] ? k.asTreffListe[0].tittel : opointTekstFelt(k.doc.header)), 60); }).join(' | ') + ']'; }).join('  ')]);
    });
  }
  return rader;
}

/** Hvor en artikkel på andre språk havnet: «Andre kilder på K3» / «Også omtalt … under Om oss» / ''. */
function opoint_ft_fremmedPlass(fremmed, url) {
  var funnet = '';
  Object.keys(fremmed.perKort || {}).forEach(function (kid) { if (fremmed.perKort[kid].some(function (x) { return x.url === url; })) funnet = 'Andre kilder på ' + kid; });
  if (!funnet && (fremmed.omOss || []).some(function (x) { return x.url === url; })) funnet = '«Også omtalt» under Om oss';
  return funnet;
}

/** Rettelse 4: hvordan representanten ble valgt for kort med flere artikler (nivå, Åpen, publisert). */
function opoint_ft_raderRepresentant(op, kort, d) {
  var rader = [[''], ['Representant-valg', 'Sak', 'Domene', 'Nivå', 'Nivå-grunnlag', 'Åpen', 'Publisert (Opoint)', 'Dato i URL', 'Valgt?', 'Tittel']];
  var sakFor = {};
  (op.saker || []).forEach(function (s) { sakFor[s.id] = s; });
  kort.forEach(function (k) {
    String(k.sak || '').split(', ').forEach(function (id) {
      var s = sakFor[id];
      if (!s || s.medlemmer.length + s.medlemmer.reduce(function (a, m) { return a + (m.slattSammen || []).length; }, 0) < 2) return;
      s.medlemmer.slice().sort(opoint_kj_representantSortering).forEach(function (m) {
        var u = opoint_t3_artikkelUrl(m.doc);
        rader.push(['', s.id, m.domene, m.niva, m.nivaGrunnlag || '', m.apen, typeof m.doc.unix_timestamp === 'number' ? d.fmtSek(m.doc.unix_timestamp) : '',
          opoint_kj_urlDato(u), m === s.representant ? 'JA' : '', opointTekstFelt(m.doc.header)]);
        (m.slattSammen || []).forEach(function (x) {
          rader.push(['', s.id, x.domene, x.niva, 'slått inn av dedup (' + (x.grunn || '') + ')', '', typeof x.doc.unix_timestamp === 'number' ? d.fmtSek(x.doc.unix_timestamp) : '',
            opoint_kj_urlDato(opoint_t3_artikkelUrl(x.doc)), '', opointTekstFelt(x.doc.header)]);
        });
      });
    });
  });
  return rader;
}

/** Recall mot fasit (OPOINT_KJ_RECALL_KOLONNER), hvis kjørt. */
function opoint_ft_raderRecall(op) {
  if (!op.recall) return [];
  var ja = op.recall.filter(function (r) { return r[3] === 'ja'; }).length;
  return [[''], ['Recall', ja + ' av ' + op.recall.length + ' funnet']].concat([OPOINT_KJ_RECALL_KOLONNER], op.recall);
}

// =====================================================================
// DEL D: «Sendte saker» – historikk for Oppfølging/Omtalt tidligere
// =====================================================================

/** Rader for sendte saker: hvert kort i e-posten (Opoint-saker med alle URL-er i gruppen). */
function opoint_ft_sendteRader(epost, saker, tid, merknad, sm) {
  var iSm = {};
  ((sm && sm.setninger) || []).forEach(function (x) { iSm[x.sak] = true; });
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
  // Middels som faktisk sto i «Ellers i bransjen» (rettelse 6: ikke alle middels – sammendraget har maks 5 setninger)
  (saker || []).forEach(function (s) {
    var r = s.kiResultat || {};
    if (s.asTreff || s.sprakEkskludert || s.oppfolging || r.relevant !== true) return;
    if (s.imoGruppe ? (s.imoGruppe.prioritet === 'middels' && iSm[s.imoGruppe.id]) : ((r.prioritet || 'middels') === 'middels' && iSm[s.id])) {
      rader.push(opoint_ft_sakRad(s, tid, merknad, null, null, 'middels'));
    }
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


// =====================================================================
// v2 DEL 5: «Beholdt/droppet» – én linje per gruppe (sak)
// =====================================================================

function opoint_ft_raderBeholdt(as, op, epost) {
  var rader = [[''], ['Beholdt/droppet', 'Sak', 'Tittel', 'Årsak', 'Detalj']];
  var kort = epost ? epost.kort : [], iKort = {}, iSm = {}, fjernet = {};
  kort.forEach(function (k) { String(k.sak || '').split(', ').forEach(function (id) { if (id) iKort[id] = k; }); });
  ((epost && epost.setningerVist) || []).forEach(function (x) { iSm[x.sak] = true; });
  ((epost && epost.fjernet) || []).forEach(function (k) { String(k.sak || '').split(', ').forEach(function (id) { if (id) fjernet[id] = k; }); });
  (op.saker || []).forEach(function (s) {
    var r = s.kiResultat || {}, dv = opoint_kj_visDoc(s);
    var tittel = s.asTreff ? s.asTreff.tittel : opointTekstFelt(dv.header);
    var b, aarsak, detalj = '';
    if (fjernet[s.id]) { b = 'droppet'; aarsak = 'kontroll-lesing'; detalj = 'fjern_kort'; }
    else if (iKort[s.id]) {
      b = 'beholdt';
      var k = iKort[s.id];
      aarsak = k.imo ? 'høy (IMO-gruppe ' + k.imo + ')' : s.asTreff ? (s.asTreff.aiRelevant === false ? 'Apps Script (Mulig irrelevant)' : 'Apps Script') : (s.oppdatering ? 'høy (Oppdatering)' : 'høy');
      detalj = r.prioritetGrunn || '';
    } else if (s.sprakEkskludert) { b = 'droppet'; aarsak = 'språk'; detalj = s.sprakEkskludert; }
    else if (s.oppfolging) { b = 'droppet'; aarsak = 'Oppfølging'; detalj = s.oppfolgingGrunn || ''; }
    else if (r.relevant === false) { b = 'droppet'; aarsak = 'irrelevant'; detalj = r.irrelevantGrunn || ''; }
    else if (r.relevant !== true) { b = 'droppet'; aarsak = 'ikke vurdert'; detalj = r.feil || ''; }
    else if (s.imoGruppe) { var g = s.imoGruppe; b = iSm[g.id] ? 'beholdt' : 'droppet'; aarsak = 'middels (IMO-gruppe ' + g.id + ')'; detalj = iSm[g.id] ? 'i «Ellers i bransjen»' : 'ikke valgt i sammendraget'; }
    else if ((r.prioritet || 'middels') === 'middels') { b = iSm[s.id] ? 'beholdt' : 'droppet'; aarsak = 'middels'; detalj = (iSm[s.id] ? 'i «Ellers i bransjen»' : 'ikke valgt i sammendraget (maks 5 setninger)') + (r.prioritetGrunn ? ' – ' + r.prioritetGrunn : ''); }
    else if (r.prioritet === 'lav') { b = 'droppet'; aarsak = 'lav'; detalj = r.prioritetGrunn || ''; }
    else { b = 'droppet'; aarsak = 'høy, men uten kort'; detalj = 'sjekk'; }
    rader.push([b, s.id, tittel, aarsak, detalj]);
    // Apps Script-treff i samme sak som ikke fikk eget kort = duplikat
    (s.asTreffAlle || []).slice(1).forEach(function (t) { rader.push(['droppet', s.id, t.tittel, 'duplikat', 'samme hendelse som kortet «' + opointKort(s.asTreff.tittel, 60) + '»']); });
  });
  (op.forb ? op.forb.kandidater : []).forEach(function (k) {
    if (k.ekskludert) rader.push(['droppet', '', opointTekstFelt(k.doc.header), 'ekskludert', k.ekskluderGrunn]);
  });
  return rader;
}

// =====================================================================
// v2 DEL 3: kontroll-lesing før sending
// =====================================================================

var KONTROLL_SYSTEM =
  'Du kontroll-leser en daglig norsk medieovervåking for Maritime CleanTech (norsk klynge for maritim grønn teknologi: ' +
  'nullutslipp, alternative drivstoff, batteri, landstrøm, regelverk, og egne prosjekter som LowNoiser, HyShip, FLAGSHIPS). ' +
  'Du får kortene (id K…), setningene i «Ellers i bransjen» (id S…) med tittel og ingress for kilden setningen viser til, ' +
  'og headeren. Du skal IKKE skrive nytt innhold – bare flagge problemer og velge et forslag.\n\n' +
  'For hvert kort: (a) er ingressen sammenhengende og handler den om det tittelen sier (ingen nettside-tekst, cookie-/' +
  'abonnementstekst eller navigasjon)? (b) er tittel og ingress konsistente? (c) er kortet TYDELIG irrelevant for Maritime ' +
  'CleanTech? (d) skrive- eller språkfeil i KI-notatet (norsk)? For sammendraget: (e) kan hver setning belegges i tittel + ' +
  'ingress for den oppgitte kilden? (d) språkfeil eller meta-språk («ingressen», «overskriften», «artikkelen», «teksten», «er nevnt i»)? (f) dobbeltkort for samme sak, og stemmer tallene i headeren med kortene?\n\n' +
  'Forslag: "bytt_ingress" (ingressen er dårlig, prøv en annen artikkel i gruppen), "bruk_KI_notat" (bruk en kort ' +
  'KI-oppsummering som ingress), "fjern_kort" (bare når kortet er tydelig irrelevant eller et dobbeltkort), "fjern_setning" ' +
  '(sammendragssetning som ikke kan belegges), "ingen" (bare merknad). alvorlighet: "kritisk" eller "merknad". ' +
  'Flagg bare reelle problemer; alt i orden → tom liste.\n\nSvar KUN med JSON, uten kodeblokk: ' +
  '{"funn": [{"id": "K2", "problem": "...", "alvorlighet": "kritisk", "forslag": "bytt_ingress"}]}. Bruk aldri doble ' +
  'anførselstegn (") inne i tekstene – bruk «» i stedet.';
var KONTROLL_FORSLAG = ['bytt_ingress', 'bruk_KI_notat', 'fjern_kort', 'fjern_setning', 'ingen'];

/** Tolker kontroll-svaret: liste av {id, problem, alvorlighet, forslag}, eller null. */
function opoint_ft_tolkKontroll(tekst) {
  var o = opoint_kj_parseJson(tekst);
  var liste = Array.isArray(o) ? o : (o && Array.isArray(o.funn) ? o.funn : null);
  if (!liste) return null;
  return liste.filter(function (x) { return x && x.id; }).map(function (x) {
    return { id: String(x.id).trim().toUpperCase(), problem: String(x.problem || ''), alvorlighet: x.alvorlighet === 'kritisk' ? 'kritisk' : 'merknad',
      forslag: KONTROLL_FORSLAG.indexOf(x.forslag) >= 0 ? x.forslag : 'ingen' };
  });
}

/**
 * kontrollLes(innhold): innhold = {epost, saker, sm, tjeneste, vindu, d}.
 * Steg 1 regelbasert (søppelmønstre i ingress og tittel), steg 2 KI (1–2 kall), steg 3 bruker bytt_ingress,
 * bruk_KI_notat og fjern_setning automatisk; fjern_kort maks KONTROLL_MAKS_FJERN (aldri «Om oss»/egne).
 * Returnerer {overstyr: {ingress, fjern, fjernSetning, flagget}, endret, logg: [...], melding}.
 * Kaster aldri for KI-feil: da logges feilen i «KI-feil» og e-posten sendes uten KI-kontroll.
 */
function opoint_ft_kontrollLes(innhold) {
  var ep = innhold.epost, tj = innhold.tjeneste;
  var ut = { overstyr: { ingress: {}, fjern: {}, fjernSetning: {}, flagget: 0 }, endret: false, logg: [], melding: '' };
  var sakFor = {};
  (innhold.saker || []).forEach(function (s) { sakFor[s.id] = s; });
  var kortFor = {};
  ep.kort.forEach(function (k) { kortFor[k.id] = k; });
  var sakAv = function (k) { return k && !k.imo ? sakFor[String(k.sak || '').split(', ')[0]] : null; };
  var logg = function (k, kilde, problem, alv, forslag, handling, for_, etter) {
    ut.logg.push({ id: k ? k.id : '', tittel: k ? k.tittel : '', kilde: kilde, problem: problem, alvorlighet: alv, forslag: forslag, handling: handling, for_: for_ || '', etter: etter || '' });
  };
  var trengerNotat = [];   // [{k, sak, kilde, problem, alv}]
  var byttIngress = function (k, kilde, problem, alv) {
    var s = sakAv(k);
    if (!s) { logg(k, kilde, problem, alv, 'bytt_ingress', 'ikke mulig (kortet har ingen gruppe å bytte i)', k.ingress, ''); return; }
    var naa = opoint_kj_rensIngress(k.ingress).replace(/\s*\(oppsummert\)$/, '');
    var alt = opoint_kj_ingressKandidater(s).filter(function (x) { return x.god && x.tekst !== naa; })[0];
    if (alt) { ut.overstyr.ingress[k.id] = alt.tekst; s.ingressOverstyrt = { tekst: alt.tekst, fra: alt.fra, god: true, oppsummert: false, grunn: 'kontroll-lesing' };
      ut.endret = true; logg(k, kilde, problem, alv, 'bytt_ingress', 'byttet til ingress fra ' + alt.fra, k.ingress, alt.tekst); }
    else trengerNotat.push({ k: k, sak: s, kilde: kilde, problem: problem + ' (ingen annen god ingress i gruppen)', alv: alv });
  };
  // Steg 1: regelbasert
  ep.kort.forEach(function (k) {
    var sp = opoint_kj_soppel(k.ingress);
    if (sp) byttIngress(k, 'regel', 'Søppelmønster i ingressen: ' + sp, 'kritisk');
    var notatUtenKilder = String(k.notat || '').split(' · ').filter(function (x) { return !/^Andre kilder/.test(x); }).join(' · ');
    if (OPOINT_KJ_META_RE.test(notatUtenKilder)) logg(k, 'regel', 'Meta-språk i KI-notatet', 'merknad', 'ingen', 'bare logget', notatUtenKilder, '');
    if (OPOINT_KJ_META_RE.test(k.ingress) && /\(oppsummert\)$/.test(k.ingress)) logg(k, 'regel', 'Meta-språk i KI-oppsummeringen', 'merknad', 'ingen', 'bare logget', k.ingress, '');
    var spT = opoint_kj_soppel(k.tittel);
    if (spT) logg(k, 'regel', 'Søppelmønster i tittelen: ' + spT, 'merknad', 'ingen', 'bare logget', k.tittel, '');
  });
  // Steg 2: KI
  var setn = ep.setningerVist || [];
  setn.forEach(function (x, i) { if (OPOINT_KJ_META_RE.test(x.tekst)) logg({ id: 'S' + (i + 1), tittel: '«Ellers i bransjen»' }, 'regel', 'Meta-språk i sammendraget', 'merknad', 'ingen', 'bare logget', x.tekst, ''); });
  var inndataFor = {};
  ((innhold.sm && innhold.sm.inndata) || []).forEach(function (x) { inndataFor[x.sak] = x; });
  var kortLinje = function (k) {
    return k.id + ' | kategori: ' + k.kategori + ' | prioritet: ' + k.prioritet + ' | tittel: ' + k.tittel + ' | kilde: ' + k.kilde +
      ' | ingress: ' + opointKort(ut.overstyr.ingress[k.id] || k.ingress, 500) + ' | KI-notat: ' + (k.notat || '–') + ' | andre kilder: ' + (k.andre || 0);
  };
  var irr = ep.kort.filter(function (k) { return k.prioritet === 'irrelevant'; }).length;
  var fellesDel = 'SAMMENDRAG («Ellers i bransjen»):\n' + (setn.length ? setn.map(function (x, i) {
    var kd = inndataFor[x.sak] || {};
    return 'S' + (i + 1) + ': ' + x.tekst + ' [kilde: ' + (x.kilde || '') + '] || kildens tittel: ' + (kd.tittel || '') + ' || kildens ingress: ' + opointKort(kd.ingress || '', 400);
  }).join('\n') : '(ingen)') + '\n\nHEADER: «' + ep.kort.length + ' treff i dag' + (irr ? ', hvorav ' + irr + ' under «Mulig irrelevant»' : '') +
    '» · ' + (ep.linje || '') + '\nFaktisk antall kort: ' + ep.kort.length + ' (Mulig irrelevant: ' + irr + ').';
  var biter = [];
  for (var i = 0; i < ep.kort.length; i += KONTROLL_PER_KALL) biter.push(ep.kort.slice(i, i + KONTROLL_PER_KALL));
  if (!biter.length) biter.push([]);
  var funn = [], kiOk = true;
  if (!tj) { kiOk = false; ut.melding = 'ingen KI-tjeneste'; }
  biter.forEach(function (bit, bi) {
    if (!kiOk) return;
    var tekst = 'KORT:\n' + (bit.length ? bit.map(kortLinje).join('\n') : '(ingen)') + (bi === 0 ? '\n\n' + fellesDel : '');
    var sv = tj.spor('kontroll' + (bi + 1), KONTROLL_SYSTEM, tekst, 1500);
    var f = sv.ok ? opoint_ft_tolkKontroll(sv.tekst) : null;
    if (!sv.ok) { kiOk = false; tj.kiFeil.push({ tid: new Date(), kall: 'kontroll-lesing (kall feilet)', forsok: 1, raa: String(sv.feil || ''), stopReason: '', inputTokens: '', outputTokens: '', maxTokens: 1500 }); return; }
    if (!f) { kiOk = false; tj.loggParseFeil('kontroll-lesing', sv, 1); return; }
    funn = funn.concat(f);
  });
  if (!kiOk) { ut.melding = 'KI-kontroll feilet – sendt uten (se «KI-feil»). '; }
  // Steg 3: bruk forslagene
  var fjernForslag = [];
  funn.forEach(function (x) {
    var k = kortFor[x.id];
    if (/^S\d+$/.test(x.id)) {
      var n = Number(x.id.slice(1)) - 1, tx = setn[n] ? setn[n].tekst : '';
      if (x.forslag === 'fjern_setning' && setn[n]) {
        var iOrig = (innhold.sm.setninger || []).indexOf(setn[n]);
        ut.overstyr.fjernSetning[iOrig] = true; ut.endret = true;
        logg({ id: x.id, tittel: '«Ellers i bransjen»' }, 'KI', x.problem, x.alvorlighet, x.forslag, 'setning fjernet', tx, '');
      } else logg({ id: x.id, tittel: '«Ellers i bransjen»' }, 'KI', x.problem, x.alvorlighet, x.forslag, 'bare logget', tx, '');
      return;
    }
    if (!k) { logg({ id: x.id, tittel: x.id === 'HEADER' ? 'Header' : '' }, 'KI', x.problem, x.alvorlighet, x.forslag, 'bare logget', '', ''); return; }
    if (x.forslag === 'bytt_ingress') byttIngress(k, 'KI', x.problem, x.alvorlighet);
    else if (x.forslag === 'bruk_KI_notat') { var s0 = sakAv(k); if (s0) trengerNotat.push({ k: k, sak: s0, kilde: 'KI', problem: x.problem, alv: x.alvorlighet });
      else logg(k, 'KI', x.problem, x.alvorlighet, x.forslag, 'ikke mulig (ingen gruppe)', k.ingress, ''); }
    else if (x.forslag === 'fjern_kort') fjernForslag.push({ k: k, x: x });
    else logg(k, 'KI', x.problem, x.alvorlighet, x.forslag, 'bare logget', '', '');
  });
  // bruk_KI_notat: KI-oppsummering (norsk, 1–2 setninger, bare fra tittel + ingress), ett kall for alle
  if (trengerNotat.length) {
    var unike = [];
    trengerNotat.forEach(function (x) { if (unike.indexOf(x.sak) < 0) unike.push(x.sak); });
    unike.forEach(function (s) { delete s.ingressOverstyrt; });
    try { if (tj) opoint_kj_lagOppsummeringer(innhold.saker, tj, unike); } catch (e) { /* logges under */ }
    trengerNotat.forEach(function (x) {
      if (x.sak.oppsummertIngress) {
        var ny = x.sak.oppsummertIngress + ' (oppsummert)';
        x.sak.ingressOverstyrt = { tekst: x.sak.oppsummertIngress, fra: 'KI', god: true, oppsummert: true, grunn: 'kontroll-lesing' };
        ut.overstyr.ingress[x.k.id] = ny; ut.endret = true;
        logg(x.k, x.kilde, x.problem, x.alv, 'bruk_KI_notat', 'KI-notat brukt som ingress', x.k.ingress, ny);
      } else logg(x.k, x.kilde, x.problem, x.alv, 'bruk_KI_notat', 'ikke mulig (KI-notat kunne ikke lages)', x.k.ingress, '');
    });
  }
  // fjern_kort: maks KONTROLL_MAKS_FJERN, kritiske først, aldri egne/«Om oss»
  fjernForslag.sort(function (a, b) { return (a.x.alvorlighet === 'kritisk' ? 0 : 1) - (b.x.alvorlighet === 'kritisk' ? 0 : 1); });
  var fjernet = 0;
  fjernForslag.forEach(function (f) {
    var k = f.k;
    if (k.nevnerOss || k.kategori === 'Om oss') { logg(k, 'KI', f.x.problem, f.x.alvorlighet, 'fjern_kort', 'ikke fjernet (eget prosjekt / Om oss)', k.tittel, ''); return; }
    if (fjernet >= KONTROLL_MAKS_FJERN) { logg(k, 'KI', f.x.problem, f.x.alvorlighet, 'fjern_kort', 'ikke fjernet (maks ' + KONTROLL_MAKS_FJERN + ' nådd)', k.tittel, ''); return; }
    fjernet++; ut.overstyr.fjern[k.id] = true; ut.endret = true;
    logg(k, 'KI', f.x.problem, f.x.alvorlighet, 'fjern_kort', 'kort fjernet fra e-posten', k.tittel, '');
  });
  if (fjernForslag.length > KONTROLL_MAKS_FJERN) { ut.overstyr.flagget = fjernForslag.length; ut.endret = true; }
  ut.melding += funn.length + ' KI-funn, ' + ut.logg.length + ' loggført, ' + Object.keys(ut.overstyr.ingress).length + ' ingresser byttet, ' +
    fjernet + ' kort fjernet, ' + Object.keys(ut.overstyr.fjernSetning).length + ' setninger fjernet.';
  return ut;
}

var KONTROLL_KOLONNER = ['Dato', 'Vindu', 'Kort-id', 'Tittel', 'Kilde (regel/KI)', 'Problem', 'Alvorlighet', 'Forslag', 'Handling', 'Tekst før', 'Tekst etter'];

/** Steg 4: legger radene nederst i fanen «Kontroll-lesing» (oppretter den). */
function opoint_ft_loggKontroll(ss, k, vindu, d) {
  if (!k) return;
  var ark = ss.getSheetByName(KONTROLL_FANE);
  if (!ark) { ark = ss.insertSheet(KONTROLL_FANE); ark.getRange(1, 1, 1, KONTROLL_KOLONNER.length).setValues([KONTROLL_KOLONNER]); }
  var naa = new Date(), v = d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest);
  var rader = k.logg.length ? k.logg.map(function (x) { return [naa, v, x.id, x.tittel, x.kilde, x.problem, x.alvorlighet, x.forslag, x.handling, x.for_, x.etter]; })
    : [[naa, v, '', '', '', k.melding || 'Ingen funn', '', '', '', '', '']];
  ark.getRange(ark.getLastRow() + 1, 1, rader.length, KONTROLL_KOLONNER.length).setValues(rader);
}

function opoint_ft_raderKontroll(op) {
  if (!op.kontroll) return [];
  return [[''], ['Kontroll-lesing', op.kontroll.melding || '']].concat([KONTROLL_KOLONNER.slice(2)],
    op.kontroll.logg.map(function (x) { return [x.id, x.tittel, x.kilde, x.problem, x.alvorlighet, x.forslag, x.handling, x.for_, x.etter]; }));
}

/**
 * Rydding: v2 (kjørt 20.11 09:02) ble feilaktig regnet som ekte kjøring og la 7 rader merket «ekte» i
 * «Sendte saker». Fjerner rader med Dato sendt mellom fra og til (Oslo). Rører ikke andre faner.
 */
function opoint_ft_ryddV2() { opoint_ft_fjernSendteSakerMellom('2026-11-20 08:30', '2026-11-20 09:30'); }

function opoint_ft_fjernSendteSakerMellom(fraTekst, tilTekst) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), ark = ss.getSheetByName(OPOINT_FANE_SENDTE_SAKER);
  if (!ark || ark.getLastRow() < 2) { Logger.log('Ingen rader.'); return 0; }
  var fra = Utilities.parseDate(fraTekst, 'Europe/Oslo', 'yyyy-MM-dd HH:mm').getTime(), til = Utilities.parseDate(tilTekst, 'Europe/Oslo', 'yyyy-MM-dd HH:mm').getTime();
  var data = ark.getRange(2, 1, ark.getLastRow() - 1, 1).getValues(), n = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var t = data[i][0];
    if (Object.prototype.toString.call(t) === '[object Date]' && t.getTime() >= fra && t.getTime() < til) { ark.deleteRow(i + 2); n++; }
  }
  Logger.log('Fjernet ' + n + ' rader fra «' + OPOINT_FANE_SENDTE_SAKER + '» (' + fraTekst + ' – ' + tilTekst + ').');
  return n;
}
