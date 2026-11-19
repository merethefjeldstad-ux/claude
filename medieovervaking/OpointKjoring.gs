/**
 * OpointKjoring.gs
 *
 * Manuelle Opoint-funksjoner (ingen trigger):
 *   opoint_diagnose()          → fane "Opoint-diagnose"          (del 1 a + b, maks 70 HTTP-kall)
 *   opoint_diagnose_dekning()  → fane "Opoint-diagnose dekning"  (del 1 c, maks 130 HTTP-kall)
 *   opoint_kjor()              → faner "Opoint-kjøring" og "Opoint-kjøring spørringer"
 *
 * Del 1 c er skilt ut i egen funksjon fordi a + b + c (opptil 200 kall med
 * 1 s pause) ikke rekker å bli ferdig innenfor Apps Scripts grense på 6
 * minutter per kjøring.
 *
 * Skriver ALDRI til "Sendte artikler", "Artikkellogg", "Referansesett",
 * "Kjøretidslogg" eller "Mottakere" (de to første leses). Tømmer og skriver
 * kun sine egne faner.
 *
 * Gjenbruker (kaller, endrer ikke):
 *  - Opoint.gs: OPOINT_URL, opointTolkSvar, opointHentDokumenter,
 *    opointHentContext, opointTekstFelt, opointKort, opointTellIdentiske,
 *    opoint_byggBody, opoint_harErrors, opoint_language, opoint_firstSource,
 *    opoint_beregnVindu, OPOINT_T2_SPORRINGER
 *  - OpointTest3.gs: opoint_t3_lagKlient, opoint_t3_skrivFane,
 *    opoint_t3_datoFunksjoner, opoint_t3_normUrl, opoint_t3_domene,
 *    opoint_t3_tittelLikhet, opoint_t3_ord, opoint_t3_rensTittel,
 *    opoint_t3_saeregneOrd, opoint_t3_tolkDato, opoint_t3_vinduRundtDato,
 *    opoint_t3_vurder, opoint_t3_artikkelUrl, opoint_t3_vinduDager,
 *    opoint_t3_feilTekst, opoint_t3_markerDuplikater, OPOINT_T5_SPORRINGER
 *  - 12_Artikkellogg.gs: normaliserUrlForLogging (pakker ut Google-omdirigering)
 *  - 10_AIIntegrasjon.gs: vurderTreffMedAI (samme modell/prompt som daglig
 *    kjøring; skriver ikke til noen fane), TEKSTGRUNNLAG_MODUS, SKYGGE_TEKSTGRUNNLAG
 *  - 09_AITest.gs: PROMPT_VERSION
 *  - 11_EpostMerkevare.gs (bare hvis OPOINT_KJOR_SEND_EPOST = true):
 *    byggEpostHtmlMerkevare, byggEpostTekstversjonMerkevare, hentLogoBlob
 */

// =====================================================================
// Konstanter – opoint_kjor()
// =====================================================================

// Tidsvindu, 'yyyy-MM-dd HH:mm' i Europe/Oslo. Begge tomme = siste 24 timer.
var OPOINT_KJOR_START = '2026-11-17 07:30';
var OPOINT_KJOR_SLUTT = '2026-11-18 07:30';

var OPOINT_KJOR_SEND_EPOST = false;
// Steg 2/3 kjøres uten KI. Settes til true først i steg 4–5.
var OPOINT_KJOR_KI_AKTIV = false;
var OPOINT_KJOR_FANE_KILDEPRIORITET = 'Kildeprioritet';
var OPOINT_KJOR_MAX_HTTP = 80;
var OPOINT_KJOR_MAX_VURDERT = 200;
var OPOINT_KJOR_EKSKLUDER_DOMENER = ['headtopics.com'];

var OPOINT_KJOR_REQUESTED = 25;
var OPOINT_KJOR_MAKS_BATCHER = 4;
var OPOINT_KJOR_SAKSGRENSE = 0.6;      // grov saksgruppering på tittel
var OPOINT_KJOR_APPS_GRENSE = 0.8;     // tittelsammenfall mot Apps Script
// Apps Script henter RSS 72 t bakover og kjører én gang i døgnet, så en sak
// fra vinduet kan bli sendt opptil ett døgn etter vinduets slutt. Oppslag i
// "Sendte artikler"/"Artikkellogg" bruker derfor [start, slutt + slakk].
var OPOINT_KJOR_APPS_SLAKK_TIMER = 24;
// Tidsbudsjett: Apps Script stopper etter 6 min. KI-vurderingen startes ikke
// for en ny bolk etter dette.
var OPOINT_KJOR_TIDSBUDSJETT_MS = 4.25 * 60 * 1000;
var OPOINT_KJOR_KI_BOLK = 20;          // antall kandidater per kall til vurderTreffMedAI
var OPOINT_KJOR_STROM_REKKEFOLGE = ['A', 'B', 'C', 'D'];

var OPOINT_KJOR_FANE = 'Opoint-kjøring';
var OPOINT_KJOR_FANE_SPORRINGER = 'Opoint-kjøring spørringer';
var OPOINT_KJOR_FANE_SENDTE = 'Sendte artikler';
var OPOINT_KJOR_FANE_ARTIKKELLOGG = 'Artikkellogg';

// Strøm A: navn. Prosjektnavnene hentes fra spørring d) i OPOINT_T2_SPORRINGER
// (Opoint.gs) i opoint_kj_byggStromA(); her står bare tilleggene.
// Steg 1: GASS er flyttet til Tier 2 (med kontekst fra "Søkeord"), se
// opoint_kj_byggTier2(). Listen er tom, men beholdt for ev. ekstra navn.
var OPOINT_KJOR_A_EKSTRA_NAVN = [];
// Rettelse e (gjelder steg 4c): "aldri avvist av KI" gjelder KUN "Maritime
// CleanTech" og prosjektnavnene (Tier 1, ikke tier2 i spørringsobjektet).
// Tier 2-treff (tier2: true – FLAGSHIPS, TrAM, Apollo, GASS, AWESOME,
// zero-emission zone) vurderes av KI som andre treff, også nevner_oss.
// Navn som IKKE får varianter med annen skrivemåte. "gass" med små bokstaver
// ville truffet alle norske saker om gass (små bokstaver matcher alle
// skrivemåter ifølge search-syntax).
var OPOINT_KJOR_A_KUN_EKSAKT = ['GASS'];

// Strøm B: engelske tema, mønsteret fra spørring a) i opoint_test2().
// Steg 2b (rettet): GAMMEL positiv kontekst (nå med vessel*) + ANDNOT-liste.
// Den brede positive konteksten fra forrige forslag er droppet.
// "AND NOT" skrives ANDNOT (dokumentert operator i search-syntax).
var OPOINT_B_POSITIV = '(vessel* OR ship OR shipping)';
var OPOINT_B_ANDNOT_ORD = ['smartphone*', 'phone*', 'laptop*', 'gadget*', '"e-bike"', '"e-bikes"', 'ebike*',
  '"free shipping"', '"ships with"'];
// Ord som skal tas UT av ANDNOT-listen (fylles inn etter opoint_kj_testSteg2B,
// som viser hvilke ord som fjerner de tre relevante sakene).
var OPOINT_B_ANDNOT_FJERN = [];
// gammelKontekst = konteksten før steg 2 (brukes bare til før/etter-sammenligning).
// Per rad kan "positiv" (erstatter OPOINT_B_POSITIV) eller "kontekst" (erstatter
// hele konteksten, også ANDNOT) overstyre.
var OPOINT_KJOR_STROM_B_TABELL = [
  { navn: 'B ammonia', term: 'header:ammonia', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B methanol', term: 'header:methanol', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B hydrogen', term: 'header:hydrogen', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B shore power', term: 'header:"shore power"', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B wind-assisted', term: 'header:"wind-assisted"', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B carbon capture', term: 'header:"carbon capture"', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B battery/electric', term: '(header:battery OR header:electric)', gammelKontekst: '(ferry OR vessel OR ship)',
    positiv: '(ferry OR vessel* OR ship)' },
  { navn: 'B net-zero framework', term: 'header:"net-zero framework"', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B FuelEU', term: 'header:FuelEU', gammelKontekst: '(vessel OR ship OR shipping)' },
  { navn: 'B EU ETS', term: 'header:"EU ETS"', gammelKontekst: '(vessel OR ship OR shipping)' }
];

// Strøm C: norske tema. header: med * er dokumentert ("Phrases, proximity,
// wildcards and fuzzy matching all work with a prefix"), lang:no likeså.
var OPOINT_KJOR_STROM_C = [
  { strom: 'C', navn: 'C tema-no', searchterm: 'lang:no AND (header:hydrogen* OR header:ammoniakk* OR header:batteri* ' +
      'OR header:landstrøm* OR header:ferge* OR header:ferje* OR header:biodrivstoff* OR header:metanol*) ' +
      'AND (skip* OR fartøy* OR ferge* OR ferje* OR rederi* OR havn*)' }
];

// Strøm D: norske fagkilder via site:-filteret ("site:11,14,110" i
// search-syntax). Første batch brukes som verifisering: alle returnerte
// id_site må være i listen, ellers forkastes strømmen.
// Rettelse a: Skipsrevyen er id_site 64 (288 var trolig en kilde-id).
// "domene" er forventet domene, brukt til å kontrollere id-ene mot forrige
// kjøring (opoint_kj_testD) og som reserve når forrige kjøring ikke viser kilden.
var OPOINT_KJOR_D_SITES = [
  { id: 64, navn: 'Skipsrevyen', domene: 'skipsrevyen.no' },
  { id: 19526, navn: 'Maritimt Magasin', domene: 'maritimt.com' },
  { id: 18139, navn: 'Kystmagasinet', domene: 'kystmagasinet.no' },
  { id: 338722, navn: 'Logistikk Inside', domene: 'logistikkinside.no' },
  { id: 141703, navn: 'Energi og Klima', domene: 'energiogklima.no' }
];
var OPOINT_KJOR_D_AKTIV = true;

// Steg 1b: D deles i D1 (maritime kilder) og D2 (generelle + alle ukjente).
// Domenet per id_site leses fra forrige kjøring i fanen "Opoint-kjøring"
// (kolonnene id_site og Domene) FØR fanen overskrives. Et id_site uten kjent
// domene havner i D2.
var OPOINT_KJOR_D1_DOMENER = ['maritimt.com', 'kystmagasinet.no', 'skipsrevyen.no'];
var OPOINT_KJOR_D_TEMAORD = ['hydrogen*', 'ammoniakk*', 'batteri*', 'elektrisk*', 'elektrifiser*', 'landstrøm*',
  'biodrivstoff*', 'metanol*', 'nullutslipp*', 'utslippsfri*', 'vindassistert*', 'kjernekraft*', 'kjernefysisk*',
  'karbonfangst', 'FuelEU', 'EU ETS', 'Maritime CleanTech'];
var OPOINT_KJOR_D2_KONTEKST = ['skip*', 'fartøy*', 'ferge*', 'ferje*', 'rederi*', 'havn*', 'maritim*'];
var OPOINT_KJOR_D_MAKS_ORD = 15;
// Rettelse c: faste D-grupper som overstyrer domenetilordningen.
// Steg 2: id-ene er bekreftet, så alle fem har fast gruppe (uavhengig av
// hvilket vertsnavn forrige kjøring viste, f.eks. batomtaler.kystmagasinet.no).
var OPOINT_KJOR_D_FAST_GRUPPE = { '64': 'D1', '19526': 'D1', '18139': 'D1', '338722': 'D2', '141703': 'D2' };

// Steg 2c: skipsregistersider ekskluderes (markeres, slettes ikke, ingen KI).
var OPOINT_KJOR_EKSKL_VERTER = ['batomtaler.kystmagasinet.no'];
var OPOINT_KJOR_EKSKL_STI = [{ vert: 'maritimt.com', sti: /-\d{4}-\d{2}$/, beskrivelse: 'maritimt.com med URL som slutter på -ÅÅÅÅ-MM' }];

// Rettelse a: unntak per Tier 2-ord (skrivemåte som i "Søkeord"). Bygges som
// "ORD AND (kontekst) ANDNOT (unntak)". ANDNOT er operatoren som står i
// search-syntax ("You can add AND, OR and ANDNOT operators"); "AND NOT" er
// ikke dokumentert.
var OPOINT_KJOR_T2_UNNTAK = { 'GASS': ['StealthGas', 'Stealth Gas', 'NASDAQ'] };

// Steg 2d: hele Opoint-spørringen per Tier 2-ord, i stedet for konteksten fra
// "Søkeord" (fanen endres ikke – den brukes også av Apps Script). Ord som ikke
// står her (FLAGSHIPS, TrAM, zero-emission zone, GASS) bygges fra "Søkeord" som før.
var OPOINT_T2_OVERSTYRING = {
  'Apollo': 'Apollo AND (Eidesvik OR "Viking Energy" OR "ammonia-powered" OR ammoniakkdrevet* OR ' +
    '((Equinor OR Wartsila OR Wärtsilä) AND (ammonia OR ammoniakk)) OR "Maritime CleanTech")',
  'AWESOME': 'AWESOME AND ("wind assisted" OR "wind-assisted" OR vindassistert OR "vind-assistert" OR ' +
    '"Kongsberg maritime" OR Odfjell OR "Maritime CleanTech")'
}; // ord per spørring (temaord + kontekst), site:-filteret ikke medregnet

// =====================================================================
// Konstanter – opoint_diagnose() / opoint_diagnose_dekning()
// =====================================================================

var OPOINT_DIAG_FANE = 'Opoint-diagnose';
var OPOINT_DIAG_FANE_DEKNING = 'Opoint-diagnose dekning';
var OPOINT_DIAG_MAKS_KALL = 70;
var OPOINT_DIAG_DEKNING_MAKS_KALL = 130;
var OPOINT_DIAG_TIDSBUDSJETT_MS = 5 * 60 * 1000;
var OPOINT_DIAG_SKRIVEMATER = ['LowNoiser', 'LOWNOISER', 'lownoiser'];
var OPOINT_DIAG_SKRIVEMATE_DAGER = 30;
var OPOINT_DIAG_SKRIVEMATE_BATCHER = 4;
var OPOINT_DIAG_AVKORTING_TEMA = ['hydrogen', 'batteri'];
var OPOINT_DIAG_AVKORTING_DAGER = 7;
var OPOINT_DIAG_AVKORTING_MAKS_DAGBATCHER = 10; // sikring mot uendelig paging per dag
var OPOINT_DIAG_FORRIGE_TEST = { hydrogen: 10, batteri: 21 };
var OPOINT_DIAG_DEKNING_RADER = 60;
var OPOINT_DIAG_DEKNING_FALLBACK_ORD = 4;
var OPOINT_DIAG_KOLONNENAVN_SENDTE = {
  tittel: ['overskrift', 'tittel', 'title'],
  url: ['url', 'lenke', 'link'],
  dato: ['dato lagt til', 'dato', 'sendt', 'sendetidspunkt', 'publiseringsdato', 'tidspunkt']
};

// =====================================================================
// Felles hjelpere (rene, testet med Node)
// =====================================================================

/** Body som opoint_byggBody, men med valgfri groupidentical (0/1). */
function opoint_kj_byggBody(searchterm, oldest, newest, context, requested, groupidentical) {
  var params = {
    requestedarticles: requested,
    context: context || '',
    oldest: oldest,
    newest: newest,
    groupidentical: groupidentical ? 1 : 0,
    main: { header: 1, summary: 1 }
  };
  if (groupidentical) params.identical = { inherit: true };
  return { searchterm: searchterm, params: params };
}

/**
 * URL-normalisering for sammenligning: pakker ut Google-omdirigering
 * (normaliserUrlForLogging, 12_Artikkellogg.gs), fjerner "&ct=…"-hale,
 * protokoll, "www.", query, fragment og avsluttende "/".
 */
function opoint_kj_normUrl(u) {
  if (u === undefined || u === null || u === '') return '';
  var s = String(u).trim();
  try { s = normaliserUrlForLogging(s); } catch (e) { /* bruk rå URL */ }
  s = s.replace(/&ct=.*$/i, '');
  return opoint_t3_normUrl(s);
}

/** Domene for en Opoint-artikkel: url_common, ellers fra orig_url/url. */
function opoint_kj_domene(doc) {
  if (doc && doc.url_common) return String(doc.url_common).toLowerCase().replace(/^www\./, '');
  return opoint_t3_domene(opoint_t3_artikkelUrl(doc));
}

function opoint_kj_erEkskludert(domene, liste) {
  if (!domene) return false;
  for (var i = 0; i < liste.length; i++) {
    var d = String(liste[i]).toLowerCase();
    if (domene === d || domene.slice(-(d.length + 1)) === '.' + d) return true;
  }
  return false;
}

/** Fjerner avsluttende kildesuffiks etter " - " eller " | " (maks 4 ord), og alle "|". */
function opoint_kj_fjernKildesuffiks(tittel) {
  var s = String(tittel || '').replace(/\s+/g, ' ').trim();
  var m = s.match(/^(.*\S)\s+[-|]\s+([^-|]+)$/);
  if (m) {
    var suffiksOrd = m[2].trim().split(/\s+/).filter(function (w) { return w; });
    if (suffiksOrd.length > 0 && suffiksOrd.length <= 4) s = m[1];
  }
  return s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Finner kolonner i en overskriftsrad ut fra navnelister. Flere treff → stopp. */
function opoint_kj_finnKolonner(overskrifter, navnelister, pakrevd) {
  var norm = overskrifter.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var ut = { stopp: '' };
  var felt = Object.keys(navnelister);
  for (var f = 0; f < felt.length; f++) {
    var navn = felt[f];
    var treff = [];
    for (var i = 0; i < norm.length; i++) if (navnelister[navn].indexOf(norm[i]) >= 0) treff.push(i);
    if (treff.length > 1) {
      ut.stopp = 'Flere mulige ' + navn + '-kolonner: ' + treff.map(function (i) {
        return '"' + overskrifter[i] + '" (kolonne ' + (i + 1) + ')'; }).join(', ');
      return ut;
    }
    ut[navn] = treff.length === 1 ? treff[0] : -1;
  }
  var mangler = (pakrevd || []).filter(function (n) { return ut[n] < 0; });
  if (mangler.length) {
    ut.stopp = 'Fant ikke kolonne for: ' + mangler.join(', ') + '. Overskriftene er: ' +
      overskrifter.map(function (h) { return '"' + h + '"'; }).join(', ');
  }
  return ut;
}

/** Kjører én spørring med paging. Returnerer resultatobjekt (feil fanges, kjøringen fortsetter). */
function opoint_kj_hentSporring(klient, sp, vindu, requested, maksBatcher, groupidentical, tidUte) {
  var res = { navn: sp.navn, strom: sp.strom || '', searchterm: sp.searchterm, statuser: [], batcher: 0,
    dokumenter: [], rangeCount: [], contextTom: '', feil: '', merknad: '' };
  var context = '';
  for (var b = 0; b < maksBatcher; b++) {
    if (tidUte && tidUte()) { res.merknad = 'Stoppet: tidsbudsjett brukt opp.'; break; }
    var svar = klient.kall(opoint_kj_byggBody(sp.searchterm, vindu.oldest, vindu.newest, context, requested, groupidentical));
    if (!svar) {
      if (b === 0) res.feil = 'Ikke kjørt: kalltaket (' + klient.maksKall + ') nådd.';
      else res.merknad = 'Kalltaket (' + klient.maksKall + ') nådd.';
      break;
    }
    res.statuser.push(svar.status);
    var tolket = opointTolkSvar(svar.status, svar.tekst);
    var feil = opoint_t3_feilTekst(svar, tolket, klient.masker);
    if (feil) { res.feil = 'Batch ' + (b + 1) + ': ' + feil; break; }
    var sr = tolket.searchresult;
    res.batcher++;
    res.rangeCount.push(sr.range_count === undefined ? '–' : sr.range_count);
    var dok = opointHentDokumenter(sr).liste;
    for (var d = 0; d < dok.length; d++) res.dokumenter.push(dok[d]);
    context = opointHentContext(sr);
    res.contextTom = context === '';
    if (context === '') break;
  }
  return res;
}

/** Tellinger for en dokumentliste: antall, unike equalgroup, uten equalgroup, unike artikler. */
function opoint_kj_tell(dokumenter) {
  var eg = {}, ider = {}, uten = 0;
  dokumenter.forEach(function (doc) {
    if (doc.equalgroup !== undefined && doc.equalgroup !== null && doc.equalgroup !== '') eg[doc.equalgroup] = true;
    else uten++;
    ider[doc.id_site + '_' + doc.id_article] = true;
  });
  return { antall: dokumenter.length, unikeEqualgroup: Object.keys(eg).length, utenEqualgroup: uten,
    unikeArtikler: Object.keys(ider).length };
}

function opoint_kj_tidsvakt(startMs, budsjettMs, naa) {
  var n = naa || function () { return Date.now(); };
  return function () { return n() - startMs > budsjettMs; };
}

// =====================================================================
// DEL 1 a + b: opoint_diagnose()
// =====================================================================

function opoint_diagnose() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nuMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var klient = opoint_t3_lagKlient(apiKey, OPOINT_DIAG_MAKS_KALL);
  var tidUte = opoint_kj_tidsvakt(nuMs, OPOINT_DIAG_TIDSBUDSJETT_MS);

  var a = opoint_kj_diagSkrivemate(klient, nuMs, tidUte);
  var b = opoint_kj_diagAvkorting(klient, nuMs, d, tidUte, OPOINT_T5_SPORRINGER);
  Logger.log('opoint_diagnose: ' + klient.antall() + ' HTTP-kall.');

  var rader = opoint_kj_byggRaderDiagnose(a, b, klient, nuMs, d);
  opoint_t3_skrivFane(ss, OPOINT_DIAG_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_DIAG_FANE + '".');
}

function opoint_kj_diagSkrivemate(klient, nuMs, tidUte) {
  var vindu = opoint_t3_vinduDager(OPOINT_DIAG_SKRIVEMATE_DAGER, nuMs);
  return OPOINT_DIAG_SKRIVEMATER.map(function (variant) {
    var res = opoint_kj_hentSporring(klient, { navn: variant, searchterm: variant }, vindu,
      OPOINT_KJOR_REQUESTED, OPOINT_DIAG_SKRIVEMATE_BATCHER, true, tidUte);
    res.telling = opoint_kj_tell(res.dokumenter);
    res.vindu = vindu;
    return res;
  });
}

/**
 * (1) dag for dag siste 7 dager, groupidentical 1, requested 25, context til tom;
 * (2) hele 7-dagersvinduet, groupidentical 0, requested 50, maks 4 batcher.
 * Søketekstene tas eksakt fra OPOINT_T5_SPORRINGER (OpointTest3.gs).
 */
function opoint_kj_diagAvkorting(klient, nuMs, d, tidUte, t5Sporringer) {
  var nu = Math.floor(nuMs / 1000);
  var ut = [];
  OPOINT_DIAG_AVKORTING_TEMA.forEach(function (tema) {
    var sp = null;
    for (var i = 0; i < t5Sporringer.length; i++) if (t5Sporringer[i].navn === tema) sp = t5Sporringer[i];
    var r = { tema: tema, searchterm: sp ? sp.searchterm : '', dager: [], sumUnikeEqualgroup: 0, sumDokumenter: 0,
      helt: null, forrige: OPOINT_DIAG_FORRIGE_TEST[tema], feil: sp ? '' : 'Fant ikke "' + tema + '" i OPOINT_T5_SPORRINGER.' };
    ut.push(r);
    if (!sp) return;

    var egTotalt = {};
    for (var dag = OPOINT_DIAG_AVKORTING_DAGER; dag >= 1; dag--) {
      var vindu = { oldest: nu - dag * 86400, newest: nu - (dag - 1) * 86400 };
      vindu.kilde = d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest);
      var dr = opoint_kj_hentSporring(klient, { navn: tema + ' dag ' + (OPOINT_DIAG_AVKORTING_DAGER - dag + 1), searchterm: sp.searchterm },
        vindu, 25, OPOINT_DIAG_AVKORTING_MAKS_DAGBATCHER, true, tidUte);
      dr.vindu = vindu;
      dr.telling = opoint_kj_tell(dr.dokumenter);
      if (dr.contextTom === false && !dr.feil && !dr.merknad) {
        dr.merknad = 'Sikringsgrensen på ' + OPOINT_DIAG_AVKORTING_MAKS_DAGBATCHER + ' batcher nådd før context ble tom.';
      }
      dr.dokumenter.forEach(function (doc) {
        if (doc.equalgroup !== undefined && doc.equalgroup !== null && doc.equalgroup !== '') egTotalt[doc.equalgroup] = true;
      });
      r.sumUnikeEqualgroup += dr.telling.unikeEqualgroup;
      r.sumDokumenter += dr.telling.antall;
      r.dager.push(dr);
    }
    r.unikeEqualgroupTotalt = Object.keys(egTotalt).length;

    var vindu7 = { oldest: nu - OPOINT_DIAG_AVKORTING_DAGER * 86400, newest: nu, kilde: 'siste 7 dager' };
    r.helt = opoint_kj_hentSporring(klient, { navn: tema + ' 7 d, groupidentical 0', searchterm: sp.searchterm },
      vindu7, 50, 4, false, tidUte);
    r.helt.vindu = vindu7;
    r.helt.telling = opoint_kj_tell(r.helt.dokumenter);
  });
  return ut;
}

function opoint_kj_byggRaderDiagnose(a, b, klient, nuMs, d) {
  var rader = [];
  rader.push(['Opoint-diagnose', 'Kjørt', d.fmtSek(Math.floor(nuMs / 1000)), 'HTTP-kall', klient.antall(),
    'Kalltak nådd?', klient.takNadd() ? 'Ja (maks ' + klient.maksKall + ')' : 'Nei']);
  rader.push(['']);
  rader.push(['a) Skrivefølsomhet (siste ' + OPOINT_DIAG_SKRIVEMATE_DAGER + ' dager, uten header:)']);
  rader.push(['Variant', 'Status per batch', 'Dokumenter', 'Unike equalgroup', 'Uten equalgroup', 'Unike artikler (id_site+id_article)',
    'range_count per batch', 'Context tom?', 'Feil', 'Titler']);
  a.forEach(function (r) {
    rader.push([r.navn, r.statuser.join(', '), r.telling.antall, r.telling.unikeEqualgroup, r.telling.utenEqualgroup,
      r.telling.unikeArtikler, r.rangeCount.join(', '), opoint_kj_ctxTekst(r), r.feil || r.merknad,
      r.dokumenter.map(function (doc) { return opointTekstFelt(doc.header); }).join(' ‖ ')]);
  });
  rader.push(['']);
  rader.push(['b) Stille avkorting (søketekst fra opoint_test5_norsk())']);
  rader.push(['Tema', 'Søketekst', 'Sum unike equalgroup dag for dag (1)', 'Unike equalgroup totalt over 7 dager (1)',
    'Sum dokumenter dag for dag (1)', 'Dokumenter 7 d, groupidentical 0, maks 4×50 (2)', 'Unike artikler (2)',
    'Context tom etter (2)?', 'Forrige test (test 5)', 'range_count (2) per batch', 'Feil']);
  b.forEach(function (r) {
    rader.push([r.tema, r.searchterm, r.sumUnikeEqualgroup, r.unikeEqualgroupTotalt === undefined ? '' : r.unikeEqualgroupTotalt,
      r.sumDokumenter, r.helt ? r.helt.telling.antall : '', r.helt ? r.helt.telling.unikeArtikler : '',
      r.helt ? opoint_kj_ctxTekst(r.helt) : '', r.forrige, r.helt ? r.helt.rangeCount.join(', ') : '',
      r.feil || (r.helt ? (r.helt.feil || r.helt.merknad) : '')]);
  });
  rader.push(['']);
  rader.push(['b) Detalj per kall-serie', 'Vindu', 'Status per batch', 'Dokumenter', 'Unike equalgroup', 'Uten equalgroup',
    'range_count per batch', 'Context tom?', 'Feil/merknad']);
  b.forEach(function (r) {
    r.dager.concat(r.helt ? [r.helt] : []).forEach(function (x) {
      rader.push([x.navn, x.vindu ? x.vindu.kilde : '', x.statuser.join(', '), x.telling.antall, x.telling.unikeEqualgroup,
        x.telling.utenEqualgroup, x.rangeCount.join(', '), opoint_kj_ctxTekst(x), x.feil || x.merknad]);
    });
  });
  return rader;
}

function opoint_kj_ctxTekst(r) {
  return r.contextTom === '' ? '(ukjent)' : (r.contextTom ? 'Ja' : 'Nei (flere finnes)');
}

// =====================================================================
// DEL 1 c: opoint_diagnose_dekning()
// =====================================================================

function opoint_diagnose_dekning() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nuMs = Date.now();
  var d = opoint_t3_datoFunksjoner();

  var ark = ss.getSheetByName(OPOINT_KJOR_FANE_SENDTE);
  if (!ark) {
    opoint_t3_skrivFane(ss, OPOINT_DIAG_FANE_DEKNING, [['STOPPET', 'Fant ingen fane "' + OPOINT_KJOR_FANE_SENDTE + '".']]);
    return;
  }
  var data = ark.getDataRange().getValues();
  var kol = opoint_kj_finnKolonner(data[0] || [], OPOINT_DIAG_KOLONNENAVN_SENDTE, ['tittel', 'url']);
  Logger.log('"' + OPOINT_KJOR_FANE_SENDTE + '": ' + (data.length - 1) + ' datarader, overskrifter ' + JSON.stringify(data[0]));
  if (kol.stopp) {
    opoint_t3_skrivFane(ss, OPOINT_DIAG_FANE_DEKNING, [['STOPPET', kol.stopp],
      ['Overskriftsrad'].concat((data[0] || []).map(String)), ['Antall datarader', data.length - 1]]);
    return;
  }

  var utvalg = opoint_kj_velgSendteRader(data.slice(1), kol, OPOINT_DIAG_DEKNING_RADER, d);
  var klient = opoint_t3_lagKlient(apiKey, OPOINT_DIAG_DEKNING_MAKS_KALL);
  var tidUte = opoint_kj_tidsvakt(nuMs, OPOINT_DIAG_TIDSBUDSJETT_MS);
  var resultat = opoint_kj_kjorDekning(utvalg.artikler, klient, nuMs, d, tidUte);
  Logger.log('opoint_diagnose_dekning: ' + klient.antall() + ' HTTP-kall.');

  var rader = opoint_kj_byggRaderDekning(resultat, utvalg, kol, data[0], data.length - 1, klient, nuMs, d);
  opoint_t3_skrivFane(ss, OPOINT_DIAG_FANE_DEKNING, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_DIAG_FANE_DEKNING + '".');
}

/**
 * Velger de nyeste N radene (etter dato hvis datokolonne finnes, ellers de
 * N nederste radene) og dedupliserer på normalisert URL.
 */
function opoint_kj_velgSendteRader(rader, kol, n, d) {
  var liste = [];
  rader.forEach(function (rad, i) {
    var url = String(rad[kol.url] || '').trim();
    var tittel = String(rad[kol.tittel] || '').trim();
    if (!url && !tittel) return;
    var dag = kol.dato >= 0 ? opoint_t3_tolkDato(rad[kol.dato], d.dagTekst) : '';
    var tid = kol.dato >= 0 && Object.prototype.toString.call(rad[kol.dato]) === '[object Date]' ? rad[kol.dato].getTime() : 0;
    liste.push({ radnr: i + 2, url: url, tittel: tittel, dag: dag, tid: tid, norm: opoint_kj_normUrl(url) });
  });
  var sortertPaDato = kol.dato >= 0 && liste.some(function (x) { return x.tid > 0; });
  if (sortertPaDato) liste.sort(function (x, y) { return (y.tid - x.tid) || (y.radnr - x.radnr); });
  else liste.reverse();
  var sett = {}, ut = [], duplikater = 0;
  for (var i = 0; i < liste.length && ut.length < n; i++) {
    var nokkel = liste[i].norm || ('tittel:' + liste[i].tittel.toLowerCase());
    if (sett[nokkel]) { duplikater++; continue; }
    sett[nokkel] = true;
    ut.push(liste[i]);
  }
  return { artikler: ut, duplikater: duplikater, sortering: sortertPaDato ? 'nyeste etter dato' : 'nederste rader' };
}

function opoint_kj_kjorDekning(artikler, klient, nuMs, d, tidUte) {
  return artikler.map(function (art) {
    var res = { art: art, rensetTittel: '', sok1: '', sok1Tekst: '', sok2: 'ikke kjørt', sok2Tekst: '',
      vurdering: null, viaFallback: false, feil: '', vindu: null, kildeDomene: opoint_t3_domene(opoint_kj_normUrl(art.url)) };
    res.vindu = art.dag ? opoint_t3_vinduRundtDato(art.dag, nuMs, d.tilSek) : opoint_t3_vinduDager(90, nuMs);
    var utenSuffiks = opoint_kj_fjernKildesuffiks(art.tittel);
    var rens = opoint_t3_rensTittel(utenSuffiks);
    res.rensetTittel = rens.tekst;
    if (!rens.tekst) { res.feil = 'Tittelen ble tom etter rensing.'; res.vurdering = { type: 'ikke funnet' }; return res; }
    if (tidUte()) { res.feil = 'Ikke kjørt: tidsbudsjett brukt opp.'; res.vurdering = { type: 'ikke funnet' }; return res; }

    res.sok1Tekst = 'header:"' + rens.tekst + '"';
    var s1 = opoint_kj_hentSporring(klient, { navn: 's1', searchterm: res.sok1Tekst }, res.vindu, 10, 1, false);
    res.sok1 = s1.feil ? 'feil' : s1.dokumenter.length;
    if (s1.feil) res.feil = 'Søk 1: ' + s1.feil;
    var dok = s1.dokumenter;
    if (!s1.feil && s1.dokumenter.length === 0) {
      var ord = opoint_t3_saeregneOrd(utenSuffiks).slice(0, OPOINT_DIAG_DEKNING_FALLBACK_ORD);
      if (ord.length) {
        res.sok2Tekst = ord.map(function (w) { return 'header:' + w; }).join(' AND ');
        var s2 = opoint_kj_hentSporring(klient, { navn: 's2', searchterm: res.sok2Tekst }, res.vindu, 10, 1, false);
        res.sok2 = s2.feil ? 'feil' : s2.dokumenter.length;
        if (s2.feil) res.feil = 'Søk 2: ' + s2.feil;
        dok = s2.dokumenter;
        res.viaFallback = true;
      } else {
        res.sok2 = 'ikke kjørt (ingen særegne ord)';
      }
    }
    // opoint_t3_vurder ser på ALLE returnerte dokumenter; URL normaliseres likt på begge sider.
    res.vurdering = opoint_t3_vurder({ tittel: utenSuffiks, url: opoint_kj_normUrl(art.url) },
      dok.map(function (doc) {
        var kopi = {}; for (var k in doc) kopi[k] = doc[k];
        kopi.orig_url = opoint_kj_normUrl(doc.orig_url); kopi.url = opoint_kj_normUrl(doc.url);
        kopi.visUrl = opoint_t3_artikkelUrl(doc);
        return kopi;
      }));
    return res;
  });
}

function opoint_kj_byggRaderDekning(resultat, utvalg, kol, overskrifter, antallRader, klient, nuMs, d) {
  var url = 0, tittel = 0, ikke = 0, feil = 0, fallback = 0, domener = {};
  resultat.forEach(function (r) {
    if (r.feil) { feil++; return; }
    if (r.vurdering.type === 'URL-match') url++;
    else if (r.vurdering.type === 'tittel-match') tittel++;
    else { ikke++; if (r.kildeDomene) domener[r.kildeDomene] = (domener[r.kildeDomene] || 0) + 1; }
    if (r.vurdering.type !== 'ikke funnet' && r.viaFallback) fallback++;
  });
  var topp = Object.keys(domener).sort(function (a, b) { return domener[b] - domener[a] || (a < b ? -1 : 1); })
    .slice(0, 5).map(function (k) { return k + ' (' + domener[k] + ')'; }).join(', ');
  var rader = [];
  rader.push(['Unike artikler', resultat.length, 'Funnet', url + tittel, 'Via URL-match', url, 'Via tittel-match', tittel,
    'Via fallback-søk', fallback, 'Ikke funnet', ikke, 'Feil', feil, 'Topp 5 domener blant ikke funne', topp,
    'HTTP-kall', klient.antall(), 'Kjørt', d.fmtSek(Math.floor(nuMs / 1000))]);
  rader.push(['"' + OPOINT_KJOR_FANE_SENDTE + '"', 'Datarader: ' + antallRader, 'Overskrifter: ' + overskrifter.join(' | '),
    'tittel=kol ' + (kol.tittel + 1), 'url=kol ' + (kol.url + 1), 'dato=' + (kol.dato >= 0 ? 'kol ' + (kol.dato + 1) +
    ' ("' + overskrifter[kol.dato] + '")' : 'ingen'), 'Utvalg: ' + utvalg.sortering + ', ' + utvalg.duplikater + ' URL-duplikater hoppet over']);
  rader.push(['']);
  rader.push(['Tittel', 'URL', 'Dato', 'Språk', 'Søk 1 antall', 'Søk 2 antall', 'Resultat', 'Beste treff tittel',
    'Beste treff URL', 'id_site', 'Kilde (first_source)', 'Beste treff dato (lokal)', 'Tittellikhet', 'Søk 1 tekst',
    'Søk 2 tekst', 'Vindu', 'Feil', 'Renset tittel', 'Kilde-domene']);
  resultat.forEach(function (r) {
    var v = r.vurdering || {}, doc = v.doc, ts = doc ? doc.unix_timestamp : undefined;
    rader.push([r.art.tittel, r.art.url, r.art.dag, '', r.sok1, r.sok2, r.feil ? 'feil' : v.type,
      doc ? opointTekstFelt(doc.header) : '', doc ? (doc.visUrl || '') : '', doc && doc.id_site !== undefined ? doc.id_site : '',
      doc ? opoint_firstSource(doc.first_source) : '', typeof ts === 'number' ? d.fmtSek(ts) : '',
      v.likhet !== undefined && v.likhet !== '' ? Math.round(v.likhet * 100) + ' %' : '', r.sok1Tekst, r.sok2Tekst,
      r.vindu ? d.fmtSek(r.vindu.oldest) + ' – ' + d.fmtSek(r.vindu.newest) : '', r.feil, r.rensetTittel, r.kildeDomene]);
  });
  return rader;
}

// =====================================================================
// DEL 2: opoint_kjor()
// =====================================================================

function opoint_kjor() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
  var vindu = opoint_beregnVindu(OPOINT_KJOR_START, OPOINT_KJOR_SLUTT, undefined, startMs, parse);
  Logger.log('opoint_kjor: vindu ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest) +
    ' (oldest=' + vindu.oldest + ', newest=' + vindu.newest + ')');

  // 1) Spørringer og henting. Tier 2 (Søkeord) og D-tilordning (forrige
  // kjøring) leses før fanene overskrives; feil her stopper ikke kjøringen.
  var oppsett = opoint_kj_lesOppsett(ss);
  var sporringer = opoint_kj_byggAlleSporringer(OPOINT_T2_SPORRINGER, oppsett.tier2, oppsett.tilordningD);
  var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJOR_MAX_HTTP);
  var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
  var resultater = opoint_kj_hentAlle(klient, sporringer, vindu, tidUte);

  // 2) Dedup, ekskludering, saksgruppering
  var kandidater = opoint_kj_dedup(resultater, OPOINT_KJOR_EKSKLUDER_DOMENER);
  opoint_kj_saksgrupper(kandidater, OPOINT_KJOR_SAKSGRENSE);

  // 2b) Steg 2f: nye domener nederst i "Kildeprioritet" (eksisterende rader endres ikke)
  try {
    oppsett.merknader.push(opoint_kj_leggTilNyeDomener(ss, kandidater));
  } catch (e) {
    oppsett.merknader.push('Kildeprioritet: feil, ingenting lagt til: ' + e.message);
  }
  Logger.log(oppsett.merknader[oppsett.merknader.length - 1]);

  // 3) Apps Script-status (kun lesing)
  var apps = opoint_kj_lesAppsScript(ss, vindu, d);
  kandidater.forEach(function (k) { opoint_kj_settAppsStatus(k, apps); });

  // 4) Skriv før KI, i tilfelle kjøringen stopper underveis
  var ki = { kjort: false, melding: 'KI ikke kjørt ennå', modell: '', promptversjon: '', vurdert: 0, ikkeVurdert: 0, stat: null };
  opoint_kj_skrivKjoring(ss, kandidater, resultater, vindu, klient, ki, apps, d, apiKey, oppsett);

  // 5) KI-vurdering
  if (OPOINT_KJOR_KI_AKTIV) {
    ki = opoint_kj_kiVurder(kandidater, startMs);
  } else {
    ki.melding = 'KI ikke kjørt (OPOINT_KJOR_KI_AKTIV = false).';
  }
  opoint_kj_skrivKjoring(ss, kandidater, resultater, vindu, klient, ki, apps, d, apiKey, oppsett);
  Logger.log('opoint_kjor: ' + klient.antall() + ' HTTP-kall, ' + kandidater.length + ' kandidater, KI: ' + ki.melding);

  // 6) E-post (av som standard)
  if (OPOINT_KJOR_SEND_EPOST) {
    try {
      Logger.log(opoint_kj_sendTestEpost(kandidater, resultater, vindu, ki, d));
    } catch (e) {
      Logger.log('E-post ble ikke sendt: ' + e.message);
    }
  } else {
    Logger.log('E-post: ikke sendt (OPOINT_KJOR_SEND_EPOST = false).');
  }
}

/**
 * Strøm A fra spørring d) i OPOINT_T2_SPORRINGER + OPOINT_KJOR_A_EKSTRA_NAVN,
 * pluss Tier 2-ord med kontekst (steg 1a). Et prosjektnavn som også er et
 * Tier 2-ord (uavhengig av store/små bokstaver) søkes bare som Tier 2.
 */
function opoint_kj_byggStromA(t2Sporringer, tier2) {
  var t2 = tier2 || { sporringer: [], ord: [] };
  var tier2Lav = t2.ord.map(function (o) { return o.toLowerCase(); });
  var d = null;
  for (var i = 0; i < t2Sporringer.length; i++) if (String(t2Sporringer[i].navn).indexOf('d)') === 0) d = t2Sporringer[i];
  var navn = [];
  if (d) {
    var re = /header:("[^"]*"|[^\s()]+)/g, m;
    while ((m = re.exec(d.searchterm)) !== null) navn.push(m[1]);
  }
  OPOINT_KJOR_A_EKSTRA_NAVN.forEach(function (n) { if (navn.indexOf(n) < 0) navn.push(n); });

  var ut = [{ strom: 'A', navn: 'A "Maritime CleanTech"', searchterm: '"Maritime CleanTech"' }];
  navn.forEach(function (n) {
    if (tier2Lav.indexOf(n.replace(/"/g, '').toLowerCase()) >= 0) return; // søkes som Tier 2
    ut.push({ strom: 'A', navn: 'A ' + n.replace(/"/g, ''), searchterm: opoint_kj_varianter(n) });
  });
  if (!d) ut.push({ strom: 'A', navn: 'A (advarsel)', searchterm: '', hopp: 'Fant ikke spørring d) i OPOINT_T2_SPORRINGER.' });
  return ut.concat(t2.sporringer);
}

/**
 * Formaterer ett søkeledd. Rene ord (bokstaver/tall, ev. med * til slutt og
 * minst 3 tegn foran) står som de er. Alt annet (mellomrom, bindestrek,
 * punktum o.l.) settes i doble anførselstegn – den dokumenterte frase-formen
 * (search-syntax: "Michael Jordan"; brukt i opoint_test2: "FIT-HORIZONS").
 * Doble anførselstegn inni leddet fjernes. Skrivemåten endres ikke.
 */
function opoint_kj_formaterLedd(t) {
  var s = String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^[\p{L}\p{N}]+$/u.test(s) || /^[\p{L}\p{N}]{3,}\*$/u.test(s)) return s;
  return '"' + s + '"';
}

/**
 * Rettelse b: kontekstord. Enkeltord (bokstaver/tall, minst 3 tegn, uten *)
 * får * til slutt (search-syntax: "spot*" = ord som begynner med spot; minst 3
 * tegn før *). Fraser i anførselstegn og ord som allerede har * endres ikke.
 */
function opoint_kj_kontekstLedd(k) {
  var l = opoint_kj_formaterLedd(k);
  return /^[\p{L}\p{N}]{3,}$/u.test(l) ? l + '*' : l;
}

/**
 * Steg 1a: Tier 2-ord fra "Søkeord" (hentSokeord(), samme lesing som
 * hovedkjøringen) → "ORD AND (k1 OR k2 …)". Ingen små-bokstav-varianter.
 * Returnerer {sporringer, ord, merknader}. Merknader: Tier 2 uten kontekstord
 * (hoppes over, slik hovedkjøringen aldri gir treff på dem), kontekstord som
 * kanskje mangler komma, og kontekstord med * (hovedkjøringen søker på
 * delstreng, så * tolkes der bokstavelig).
 */
function opoint_kj_byggTier2(sokeordListe) {
  var ut = { sporringer: [], ord: [], merknader: [] };
  (sokeordListe || []).forEach(function (rad) {
    if (rad.tier !== 2) return;
    var ord = String(rad.sokeord || '').trim();
    if (!ord) return;
    ut.ord.push(ord);
    var overstyrt = opoint_kj_finnOverstyring(ord);
    if (overstyrt) {
      ut.sporringer.push({ strom: 'A', navn: 'A T2 ' + ord, tier2: true, overstyrt: true, utenUnntak: overstyrt,
        searchterm: overstyrt });
      ut.merknader.push('Tier 2 "' + ord + '": spørringen er overstyrt av OPOINT_T2_OVERSTYRING (kontekst fra "Søkeord" brukes ikke).');
      return;
    }
    var kontekst = (rad.kontekstord || []).map(function (k) { return String(k).trim(); }).filter(function (k) { return k; });
    if (kontekst.length === 0) {
      ut.merknader.push('Tier 2 "' + ord + '" har ingen kontekstord – hoppet over.');
      return;
    }
    kontekst.forEach(function (k) {
      var antallOrd = k.split(/\s+/).length;
      var harMc = /maritime cleantech/i.test(k) && k.toLowerCase() !== 'maritime cleantech';
      if (antallOrd >= 3 || harMc) {
        ut.merknader.push('Mulig manglende komma i kontekstord for "' + ord + '": "' + k + '" (ikke endret).');
      }
      if (k.indexOf('*') >= 0) {
        ut.merknader.push('Kontekstord "' + k + '" (' + ord + ') har *: i Opoint er det jokertegn, men hovedkjøringen ' +
          '(04_Filtrering.gs) søker på delstreng og leter etter tegnet * bokstavelig.');
      }
    });
    var grunn = opoint_kj_formaterLedd(ord) + ' AND (' + kontekst.map(opoint_kj_kontekstLedd).join(' OR ') + ')';
    var unntak = OPOINT_KJOR_T2_UNNTAK[ord] || [];
    ut.sporringer.push({ strom: 'A', navn: 'A T2 ' + ord, tier2: true, utenUnntak: grunn,
      searchterm: grunn + (unntak.length ? ' ANDNOT (' + unntak.map(opoint_kj_formaterLedd).join(' OR ') + ')' : '') });
  });
  return ut;
}

/** Overstyring for et Tier 2-ord (eksakt navn først, så uten hensyn til store/små bokstaver). */
function opoint_kj_finnOverstyring(ord) {
  if (OPOINT_T2_OVERSTYRING[ord]) return OPOINT_T2_OVERSTYRING[ord];
  var lav = ord.toLowerCase();
  var nokler = Object.keys(OPOINT_T2_OVERSTYRING);
  for (var i = 0; i < nokler.length; i++) if (nokler[i].toLowerCase() === lav) return OPOINT_T2_OVERSTYRING[nokler[i]];
  return '';
}

/**
 * Leser id_site → domene fra forrige kjøring i fanen "Opoint-kjøring"
 * (kun lesing). Finner overskriftsraden med både "id_site" og "Domene" blant
 * de 10 første radene. Mest brukte domene per id_site vinner.
 */
function opoint_kj_lesSiteDomener(ss, fane) {
  var ut = {};
  var ark = ss.getSheetByName(fane);
  if (!ark || ark.getLastRow() < 2) return ut;
  var data = ark.getDataRange().getValues();
  return opoint_kj_siteDomenerFraRader(data);
}

function opoint_kj_siteDomenerFraRader(data) {
  var ut = {};
  for (var h = 0; h < Math.min(10, data.length); h++) {
    var hode = data[h].map(function (x) { return String(x).trim().toLowerCase(); });
    var iSite = hode.indexOf('id_site'), iDom = hode.indexOf('domene');
    if (iSite < 0 || iDom < 0) continue;
    var telling = {};
    for (var r = h + 1; r < data.length; r++) {
      var id = String(data[r][iSite]).trim(), dom = String(data[r][iDom]).trim().toLowerCase().replace(/^www\./, '');
      if (!id || !dom) continue;
      telling[id] = telling[id] || {};
      telling[id][dom] = (telling[id][dom] || 0) + 1;
    }
    Object.keys(telling).forEach(function (id) {
      ut[id] = Object.keys(telling[id]).sort(function (a, b) { return telling[id][b] - telling[id][a]; })[0];
    });
    return ut;
  }
  return ut;
}

/** Tilordner hver kilde i OPOINT_KJOR_D_SITES til D1/D2 ut fra domenet. */
function opoint_kj_tilordneD(siteDomener) {
  return OPOINT_KJOR_D_SITES.map(function (s) {
    var sett = siteDomener[String(s.id)] || '';
    var dom = sett || s.domene || '';
    var fast = OPOINT_KJOR_D_FAST_GRUPPE[String(s.id)];
    var gruppe = fast || (dom && OPOINT_KJOR_D1_DOMENER.indexOf(dom) >= 0 ? 'D1' : 'D2');
    return { id: s.id, navn: s.navn, domene: sett || (dom ? dom + ' (fra konfigurasjon, ikke sett i forrige kjøring)' :
      '(ukjent – ikke sett i forrige kjøring)'), gruppe: gruppe,
      kilde: fast ? 'fast (OPOINT_KJOR_D_FAST_GRUPPE)' : (sett ? 'domene fra forrige kjøring' : 'domene fra konfigurasjon') };
  });
}

/** ANDNOT-listen for B uten ordene i fjern (og OPOINT_B_ANDNOT_FJERN). */
function opoint_kj_bAndnot(fjern) {
  var bort = (fjern || []).concat(OPOINT_B_ANDNOT_FJERN);
  var ord = OPOINT_B_ANDNOT_ORD.filter(function (o) { return bort.indexOf(o) < 0; });
  return ord.length ? '(' + ord.join(' OR ') + ')' : '';
}

/** Strøm B-konteksten for én tabellrad. */
function opoint_kj_bKontekst(rad, fjern) {
  if (rad.kontekst) return rad.kontekst;
  var neg = opoint_kj_bAndnot(fjern);
  return (rad.positiv || OPOINT_B_POSITIV) + (neg ? ' ANDNOT ' + neg : '');
}

/** Strøm B fra tabellen. gammel = true gir konteksten fra før steg 2 (kun til sammenligning). */
function opoint_kj_byggStromB(gammel, fjern) {
  return OPOINT_KJOR_STROM_B_TABELL.map(function (rad) {
    var kontekst = gammel ? rad.gammelKontekst : opoint_kj_bKontekst(rad, fjern);
    return { strom: 'B', navn: rad.navn, searchterm: rad.term + ' AND ' + kontekst };
  });
}

/** Deler en liste ledd i biter der hver bit har maks maksOrd ord. */
function opoint_kj_delOpp(ledd, maksOrd) {
  var biter = [], bit = [], ord = 0;
  ledd.forEach(function (l) {
    var n = l.replace(/"/g, '').split(/\s+/).length;
    if (bit.length && ord + n > maksOrd) { biter.push(bit); bit = []; ord = 0; }
    bit.push(l); ord += n;
  });
  if (bit.length) biter.push(bit);
  return biter;
}

/** Navn + varianter med annen skrivemåte (original, små, STORE), som OR. */
function opoint_kj_varianter(navn) {
  var ren = navn.replace(/"/g, '');
  if (OPOINT_KJOR_A_KUN_EKSAKT.indexOf(ren) >= 0) return navn;
  var erFrase = /\s/.test(ren) || navn.charAt(0) === '"';
  var sett = [], varianter = [ren, ren.toLowerCase(), ren.toUpperCase()];
  varianter.forEach(function (v) { if (sett.indexOf(v) < 0) sett.push(v); });
  var ledd = sett.map(function (v) { return erFrase ? '"' + v + '"' : v; });
  return ledd.length === 1 ? ledd[0] : '(' + ledd.join(' OR ') + ')';
}

/**
 * Steg 1b: D1 = temaord AND site:(maritime kilder); D2 = temaord AND maritim
 * kontekst AND site:(øvrige). Delt opp så hver spørring har maks
 * OPOINT_KJOR_D_MAKS_ORD ord. tilordning fra opoint_kj_tilordneD().
 */
function opoint_kj_byggStromD(tilordning) {
  if (!OPOINT_KJOR_D_AKTIV) return [];
  var tilordn = tilordning || opoint_kj_tilordneD({});
  var tema = OPOINT_KJOR_D_TEMAORD.map(opoint_kj_formaterLedd);
  var kontekst = OPOINT_KJOR_D2_KONTEKST.map(opoint_kj_formaterLedd);
  var ut = [];
  ['D1', 'D2'].forEach(function (gruppe) {
    var ider = tilordn.filter(function (t) { return t.gruppe === gruppe; }).map(function (t) { return t.id; });
    if (!ider.length) return;
    var maksTema = gruppe === 'D1' ? OPOINT_KJOR_D_MAKS_ORD : OPOINT_KJOR_D_MAKS_ORD - kontekst.length;
    var biter = opoint_kj_delOpp(tema, maksTema);
    biter.forEach(function (bit, i) {
      var st = '(' + bit.join(' OR ') + ')' + (gruppe === 'D2' ? ' AND (' + kontekst.join(' OR ') + ')' : '') +
        ' AND site:' + ider.join(',');
      ut.push({ strom: 'D', navn: gruppe + ' del ' + (i + 1) + '/' + biter.length, verifiserSites: ider, searchterm: st });
    });
  });
  return ut;
}

function opoint_kj_byggAlleSporringer(t2Sporringer, tier2, tilordningD) {
  return opoint_kj_byggStromA(t2Sporringer, tier2).concat(opoint_kj_byggStromB(false), OPOINT_KJOR_STROM_C,
    opoint_kj_byggStromD(tilordningD));
}

/** Henter alle spørringer i rekkefølge. Strøm D verifiseres på første batch. */
function opoint_kj_hentAlle(klient, sporringer, vindu, tidUte) {
  return sporringer.map(function (sp) {
    if (sp.hopp) {
      return { navn: sp.navn, strom: sp.strom, searchterm: sp.searchterm, statuser: [], batcher: 0, dokumenter: [],
        rangeCount: [], contextTom: '', feil: sp.hopp, merknad: '' };
    }
    var res = opoint_kj_hentSporring(klient, sp, vindu, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    if (sp.verifiserSites && !res.feil) opoint_kj_verifiserSites(res, sp.verifiserSites);
    Logger.log(sp.navn + ': status=' + res.statuser.join(',') + ', dokumenter=' + res.dokumenter.length +
      (res.feil ? ', FEIL: ' + res.feil : ''));
    return res;
  });
}

/**
 * Verifiserer site:-filteret: alle dokumenter må ha id_site i listen
 * (ider, eller alle i OPOINT_KJOR_D_SITES). Avvik → spørringens dokumenter
 * forkastes. 0 dokumenter er ikke en feil for temaspørringer (steg 1b).
 */
function opoint_kj_verifiserSites(res, ider) {
  var tillatt = {};
  (Array.isArray(ider) ? ider : OPOINT_KJOR_D_SITES.map(function (s) { return s.id; }))
    .forEach(function (id) { tillatt[String(id)] = true; });
  if (res.dokumenter.length === 0) {
    res.merknad = '0 dokumenter (site:-filteret ikke verifisert i denne spørringen).';
    return;
  }
  var avvik = res.dokumenter.filter(function (doc) { return !tillatt[String(doc.id_site)]; });
  if (avvik.length > 0) {
    var ider = {};
    avvik.forEach(function (doc) { ider[doc.id_site] = true; });
    res.feil = 'site:-filteret ikke bekreftet: ' + avvik.length + ' av ' + res.dokumenter.length +
      ' dokumenter har andre id_site (' + Object.keys(ider).slice(0, 10).join(', ') + '). Strøm D forkastet.';
    res.dokumenter = [];
  } else {
    res.merknad = 'site:-filteret bekreftet (' + res.dokumenter.length + ' dokumenter, alle med forventet id_site).';
  }
}

/** Vert og sti fra en URL (vert uten www., sti uten query/fragment og avsluttende /). */
function opoint_kj_vertOgSti(u) {
  var s = String(u || '').trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split('#')[0].split('?')[0];
  var i = s.indexOf('/');
  var vert = (i < 0 ? s : s.slice(0, i)).replace(/:\d+$/, '').replace(/^www\./, '');
  var sti = (i < 0 ? '' : s.slice(i)).replace(/\/+$/, '');
  return { vert: vert, sti: sti };
}

/** Steg 2c: grunn til ekskludering som skipsregisterside, eller ''. Ser på orig_url og url. */
function opoint_kj_skipsregisterGrunn(doc) {
  var urler = [doc && doc.orig_url, doc && doc.url].filter(function (u) { return u; });
  for (var i = 0; i < urler.length; i++) {
    var vs = opoint_kj_vertOgSti(urler[i]);
    if (OPOINT_KJOR_EKSKL_VERTER.indexOf(vs.vert) >= 0) return 'Skipsregister: vert ' + vs.vert;
    for (var j = 0; j < OPOINT_KJOR_EKSKL_STI.length; j++) {
      var m = OPOINT_KJOR_EKSKL_STI[j];
      var vertOk = vs.vert === m.vert || vs.vert.slice(-(m.vert.length + 1)) === '.' + m.vert;
      if (vertOk && m.sti.test(vs.sti)) return 'Skipsregister: ' + m.beskrivelse;
    }
  }
  return '';
}

/**
 * Dedupliserer på tvers av spørringer og batcher: samme equalgroup ELLER
 * samme normaliserte URL → samme kandidat. Alle strømmer/spørringer som
 * traff beholdes.
 */
function opoint_kj_dedup(resultater, ekskluderDomener) {
  var kandidater = [], egKart = {}, urlKart = {};
  resultater.forEach(function (res) {
    res.dokumenter.forEach(function (doc) {
      var norm = opoint_kj_normUrl(opoint_t3_artikkelUrl(doc));
      var eg = (doc.equalgroup !== undefined && doc.equalgroup !== null && doc.equalgroup !== '') ? String(doc.equalgroup) : '';
      var finnes = (eg && egKart[eg] !== undefined) ? egKart[eg] : (norm && urlKart[norm] !== undefined ? urlKart[norm] : -1);
      if (finnes >= 0) {
        var k = kandidater[finnes];
        if (k.strommer.indexOf(res.strom) < 0) k.strommer.push(res.strom);
        if (k.sporringer.indexOf(res.navn) < 0) k.sporringer.push(res.navn);
        k.antallTreff++;
      } else {
        finnes = kandidater.length;
        var domene = opoint_kj_domene(doc);
        var regGrunn = opoint_kj_skipsregisterGrunn(doc);
        var domEkskl = opoint_kj_erEkskludert(domene, ekskluderDomener);
        kandidater.push({ doc: doc, normUrl: norm, domene: domene, strommer: [res.strom], sporringer: [res.navn],
          antallTreff: 1, ekskludert: domEkskl || !!regGrunn,
          ekskluderGrunn: domEkskl ? 'Ekskludert domene' : regGrunn,
          sak: '', antallKilderISak: 0, appsStatus: '', appsArsak: '', treff: null });
      }
      if (eg) egKart[eg] = finnes;
      if (norm) urlKart[norm] = finnes;
    });
  });
  var raa = 0;
  resultater.forEach(function (r) { raa += r.dokumenter.length; });
  kandidater.raaDokumenter = raa;
  return kandidater;
}

/** Grov saksgruppering: grådig, mot første tittel i hver sak, likhet ≥ grense. */
function opoint_kj_saksgrupper(kandidater, grense) {
  var saker = [];
  kandidater.forEach(function (k) {
    var tittel = opointTekstFelt(k.doc.header);
    var sak = null;
    for (var i = 0; i < saker.length; i++) {
      if (opoint_t3_tittelLikhet(tittel, saker[i].tittel) >= grense) { sak = saker[i]; break; }
    }
    if (!sak) { sak = { id: 'S' + (saker.length + 1), tittel: tittel, kilder: {}, medlemmer: [] }; saker.push(sak); }
    sak.medlemmer.push(k);
    sak.kilder[k.domene || ('site' + k.doc.id_site)] = true;
    k.sak = sak.id;
  });
  saker.forEach(function (s) {
    var n = Object.keys(s.kilder).length;
    s.medlemmer.forEach(function (k) { k.antallKilderISak = n; });
  });
  return saker;
}

/**
 * Leser "Sendte artikler" og "Artikkellogg" (kun lesing) for vinduet
 * [start, slutt + slakk]. Kolonner finnes på overskriftsnavn som de
 * eksisterende filene skriver dem.
 */
function opoint_kj_lesAppsScript(ss, vindu, d) {
  var fraMs = vindu.oldest * 1000, tilMs = (vindu.newest + OPOINT_KJOR_APPS_SLAKK_TIMER * 3600) * 1000;
  var ut = { rader: [], merknad: [], fraMs: fraMs, tilMs: tilMs };

  var sendte = ss.getSheetByName(OPOINT_KJOR_FANE_SENDTE);
  if (sendte && sendte.getLastRow() >= 2) {
    var data = sendte.getDataRange().getValues();
    var kol = opoint_kj_finnKolonner(data[0], { url: ['url'], dato: ['dato lagt til'], tittel: ['overskrift'],
      relevant: ['ai relevant'], notat: ['ai notat'] }, ['url', 'dato']);
    if (kol.stopp) ut.merknad.push('"Sendte artikler": ' + kol.stopp);
    else data.slice(1).forEach(function (r) {
      var t = r[kol.dato];
      if (Object.prototype.toString.call(t) !== '[object Date]' || t.getTime() < fraMs || t.getTime() > tilMs) return;
      ut.rader.push({ kilde: 'Sendte artikler', norm: opoint_kj_normUrl(r[kol.url]),
        tittel: kol.tittel >= 0 ? String(r[kol.tittel] || '') : '',
        relevant: kol.relevant >= 0 ? String(r[kol.relevant] || '').toLowerCase() : '',
        arsak: kol.notat >= 0 ? String(r[kol.notat] || '') : '' });
    });
  } else {
    ut.merknad.push('"Sendte artikler" mangler eller er tom.');
  }

  var logg = ss.getSheetByName(OPOINT_KJOR_FANE_ARTIKKELLOGG);
  if (logg && logg.getLastRow() >= 2) {
    var ld = logg.getDataRange().getValues();
    var lk = opoint_kj_finnKolonner(ld[0], { tid: ['tidspunkt'], url: ['normalisert url'], tittel: ['overskrift'],
      vurdering: ['ki-vurdering'], begrunnelse: ['kort begrunnelse'] }, ['tid', 'url']);
    if (lk.stopp) ut.merknad.push('"Artikkellogg": ' + lk.stopp);
    else ld.slice(1).forEach(function (r) {
      var t = r[lk.tid];
      if (Object.prototype.toString.call(t) !== '[object Date]' || t.getTime() < fraMs || t.getTime() > tilMs) return;
      var v = lk.vurdering >= 0 ? String(r[lk.vurdering] || '') : '';
      ut.rader.push({ kilde: 'Artikkellogg', norm: opoint_kj_normUrl(r[lk.url]),
        tittel: lk.tittel >= 0 ? String(r[lk.tittel] || '') : '',
        relevant: v === 'Ikke relevant' ? 'nei' : (v === 'Relevant' ? 'ja' : v.toLowerCase()),
        arsak: lk.begrunnelse >= 0 ? String(r[lk.begrunnelse] || '') : '' });
    });
  } else {
    ut.merknad.push('"Artikkellogg" mangler eller er tom.');
  }
  ut.merknad.push('Oppslagsvindu for Apps Script: ' + d.fmtSek(fraMs / 1000) + ' – ' + d.fmtSek(tilMs / 1000) +
    ' (vindu + ' + OPOINT_KJOR_APPS_SLAKK_TIMER + ' t slakk), ' + ut.rader.length + ' rader.');
  return ut;
}

/**
 * Apps Script-status. NB: Apps Script sender ALLE nye søkeordtreff i e-posten –
 * de KI vurderer som irrelevante havner i seksjonen "Mulig irrelevant". Det er
 * dem som her heter "vurdert, ikke sendt" (AI Relevant = nei).
 */
function opoint_kj_settAppsStatus(k, apps) {
  var urlTreff = k.normUrl ? apps.rader.filter(function (r) { return r.norm && r.norm === k.normUrl; }) : [];
  if (urlTreff.length) {
    var nei = urlTreff.filter(function (r) { return r.relevant === 'nei'; });
    var ja = urlTreff.filter(function (r) { return r.relevant !== 'nei'; });
    if (ja.length && !nei.length) { k.appsStatus = 'sendt av Apps Script'; k.appsArsak = ''; }
    else if (nei.length && !ja.length) {
      k.appsStatus = 'vurdert, ikke sendt';
      k.appsArsak = nei.map(function (r) { return r.arsak; }).filter(function (x) { return x; })[0] || '';
    } else { k.appsStatus = 'sendt av Apps Script'; k.appsArsak = 'Motstridende vurderinger i Sendte artikler/Artikkellogg'; }
    return;
  }
  var tittel = opointTekstFelt(k.doc.header);
  for (var i = 0; i < apps.rader.length; i++) {
    if (apps.rader[i].tittel && opoint_t3_tittelLikhet(tittel, apps.rader[i].tittel) >= OPOINT_KJOR_APPS_GRENSE) {
      k.appsStatus = 'samme sak sannsynlig (annen URL)';
      k.appsArsak = apps.rader[i].kilde + ': "' + opointKort(apps.rader[i].tittel, 120) + '"';
      return;
    }
  }
  k.appsStatus = 'ikke sett av Apps Script';
  k.appsArsak = '';
}

/** Domene normalisert til vert: små bokstaver, uten protokoll, www., port og sti. */
function opoint_kj_normDomene(s) {
  return opoint_kj_vertOgSti(String(s || '').trim()).vert;
}

/**
 * Steg 2f: domener (fra kandidatene) som ikke finnes i "Kildeprioritet" legges
 * nederst med tomt nivå og merknaden "Ny, ikke vurdert". Eksisterende rader
 * endres aldri. Finnes ikke fanen, gjøres ingenting.
 */
function opoint_kj_leggTilNyeDomener(ss, kandidater) {
  var ark = ss.getSheetByName(OPOINT_KJOR_FANE_KILDEPRIORITET);
  if (!ark) return 'Kildeprioritet: fanen finnes ikke – ingen domener lagt til.';
  var bredde = Math.max(ark.getLastColumn(), 1);
  var data = ark.getRange(1, 1, Math.max(ark.getLastRow(), 1), bredde).getValues();
  var plan = opoint_kj_planNyeDomener(data, kandidater);
  if (plan.feil) return 'Kildeprioritet: ' + plan.feil;
  if (plan.rader.length) ark.getRange(ark.getLastRow() + 1, 1, plan.rader.length, bredde).setValues(plan.rader);
  return 'Kildeprioritet: ' + plan.rader.length + ' nye domener lagt til' +
    (plan.rader.length ? ' (' + plan.nye.slice(0, 20).join(', ') + (plan.nye.length > 20 ? ' …' : '') + ')' : '') + '.';
}

/** Ren funksjon: hvilke rader som skal legges til. */
function opoint_kj_planNyeDomener(data, kandidater) {
  var hode = (data[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var finn = function (start) { for (var i = 0; i < hode.length; i++) if (hode[i].indexOf(start) === 0) return i; return -1; };
  var iDom = finn('domene'), iMerk = finn('merknad');
  if (iDom < 0) return { feil: 'fant ikke kolonnen "Domene" i rad 1 – ingen domener lagt til.', rader: [], nye: [] };
  var finnes = {};
  for (var r = 1; r < data.length; r++) { var dm = opoint_kj_normDomene(data[r][iDom]); if (dm) finnes[dm] = true; }
  var nye = [];
  kandidater.forEach(function (k) {
    var dm = opoint_kj_normDomene(k.domene);
    if (dm && !finnes[dm]) { finnes[dm] = true; nye.push(dm); }
  });
  var rader = nye.map(function (dm) {
    var rad = hode.map(function () { return ''; });
    rad[iDom] = dm;
    if (iMerk >= 0) rad[iMerk] = 'Ny, ikke vurdert';
    return rad;
  });
  return { feil: '', rader: rader, nye: nye };
}

/** Prioritert liste for KI: ikke ekskluderte, sortert på beste strøm (A, B, C, D). */
function opoint_kj_kiKo(kandidater) {
  var rang = function (k) {
    var best = 99;
    k.strommer.forEach(function (s) { var r = OPOINT_KJOR_STROM_REKKEFOLGE.indexOf(s); if (r >= 0 && r < best) best = r; });
    return best;
  };
  return kandidater.map(function (k, i) { return { k: k, i: i, r: rang(k) }; })
    .filter(function (x) { return !x.k.ekskludert; })
    .sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); })
    .map(function (x) { return x.k; });
}

/** Treffobjekt i formatet vurderTreffMedAI() forventer (kun tittel + sammendrag + kilde). */
function opoint_kj_lagTreff(k) {
  var fs = k.doc.first_source || {};
  return { tittel: opointTekstFelt(k.doc.header), ingress: opointTekstFelt(k.doc.summary),
    kilde: fs.sitename || fs.name || k.domene || '', lenke: opoint_t3_artikkelUrl(k.doc),
    matchendeOrd: k.strommer.slice() };
}

function opoint_kj_kiVurder(kandidater, startMs) {
  var props = PropertiesService.getScriptProperties();
  var ki = { kjort: false, melding: '', modell: props.getProperty('AI_MODEL') || '', promptversjon: PROMPT_VERSION,
    vurdert: 0, ikkeVurdert: 0, utenforTak: 0, stat: { antallKall: 0, kostnad: 0, feil: [] } };
  var ko = opoint_kj_kiKo(kandidater);
  var valgt = ko.slice(0, OPOINT_KJOR_MAX_VURDERT);
  ki.utenforTak = ko.length - valgt.length;

  if (props.getProperty('AI_ENABLED') !== 'true') {
    ki.melding = 'KI ikke kjørt: Script Property AI_ENABLED er ikke "true".';
    ki.ikkeVurdert = valgt.length;
    return ki;
  }
  if (TEKSTGRUNNLAG_MODUS !== 'ingress' || SKYGGE_TEKSTGRUNNLAG) {
    ki.melding = 'KI ikke kjørt: TEKSTGRUNNLAG_MODUS/SKYGGE_TEKSTGRUNNLAG er endret fra standard, og da ville ' +
      'vurderTreffMedAI hentet hele sider – ikke bare tittel + sammendrag.';
    ki.ikkeVurdert = valgt.length;
    return ki;
  }
  ki.kjort = true;
  for (var s = 0; s < valgt.length; s += OPOINT_KJOR_KI_BOLK) {
    if (Date.now() - startMs > OPOINT_KJOR_TIDSBUDSJETT_MS) {
      ki.melding = 'Stoppet: tidsbudsjett brukt opp. ';
      break;
    }
    var bolk = valgt.slice(s, s + OPOINT_KJOR_KI_BOLK);
    var treff = bolk.map(function (k) { k.treff = opoint_kj_lagTreff(k); return k.treff; });
    var stat;
    try {
      stat = vurderTreffMedAI(treff);
    } catch (e) {
      ki.stat.feil.push('Uventet feil i vurderTreffMedAI: ' + e.message);
      break;
    }
    ki.stat.antallKall += stat.antallKall || 0;
    ki.stat.kostnad += stat.kostnad || 0;
    (stat.feil || []).forEach(function (f) { ki.stat.feil.push(f); });
    if (stat.stoppetTidlig) { ki.melding = 'Stoppet tidlig: ' + stat.stoppArsak + ' '; break; }
  }
  valgt.forEach(function (k) {
    if (k.treff && (k.treff.aiRelevant === true || k.treff.aiRelevant === false)) ki.vurdert++;
    else ki.ikkeVurdert++;
  });
  ki.melding += 'Vurdert ' + ki.vurdert + ', ikke vurdert ' + ki.ikkeVurdert +
    (ki.utenforTak ? ', utenfor tak (' + OPOINT_KJOR_MAX_VURDERT + ') ' + ki.utenforTak : '') +
    ', KI-kall ' + ki.stat.antallKall + ', kostnad USD ' + Math.round(ki.stat.kostnad * 10000) / 10000 + '.';
  return ki;
}

function opoint_kj_kiRelevant(k) {
  if (k.ekskludert) return 'ekskludert';
  if (!k.treff) return 'ikke vurdert';
  if (k.treff.aiParseFeilet) return 'tvil';
  if (k.treff.aiRelevant === true) return 'ja';
  if (k.treff.aiRelevant === false) return 'nei';
  return 'ikke vurdert';
}

function opoint_kj_byggRaderKjoring(kandidater, vindu, klient, ki, apps, d) {
  var stromTall = {};
  OPOINT_KJOR_STROM_REKKEFOLGE.forEach(function (s) { stromTall[s] = 0; });
  var ekskl = 0, relevant = 0, relIkkeSett = 0, relSendt = 0;
  kandidater.forEach(function (k) {
    k.strommer.forEach(function (s) { stromTall[s] = (stromTall[s] || 0) + 1; });
    if (k.ekskludert) ekskl++;
    if (opoint_kj_kiRelevant(k) === 'ja') {
      relevant++;
      if (k.appsStatus === 'ikke sett av Apps Script') relIkkeSett++;
      if (k.appsStatus === 'sendt av Apps Script') relSendt++;
    }
  });
  var rader = [];
  rader.push(['Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest), 'HTTP-kall', klient.antall(),
    'Kalltak nådd?', klient.takNadd() ? 'Ja (maks ' + klient.maksKall + ')' : 'Nei', 'Rå dokumenter', kandidater.raaDokumenter,
    'Unike etter dedup', kandidater.length, 'Ekskludert', ekskl, 'KI-vurdert', ki.vurdert, 'KI-relevant', relevant,
    'hvorav ikke sett av Apps Script', relIkkeSett, 'hvorav sendt av Apps Script', relSendt,
    'Strøm A', stromTall.A, 'Strøm B', stromTall.B, 'Strøm C', stromTall.C, 'Strøm D', stromTall.D,
    'Modell-ID', ki.modell, 'Promptversjon', ki.promptversjon]);
  rader.push(['KI', ki.melding, 'Apps Script-oppslag', apps.merknad.join(' '),
    'Saksgruppering', 'GROV: grådig tittellikhet ≥ ' + Math.round(OPOINT_KJOR_SAKSGRENSE * 100) + ' % mot sakens første tittel.',
    'KI-feil', opointKort(ki.stat && ki.stat.feil ? ki.stat.feil.join(' | ') : '', 500)]);
  rader.push(['']);
  rader.push(['Strøm(mer)', 'Dato', 'Tittel', 'URL', 'Kort sammendrag', 'Språk', 'Countrycode', 'id_site', 'Kilde',
    'equalgroup', 'Saksgruppe', 'Antall kilder i saken', 'KI relevant', 'Kategori', 'Notat', 'Apps Script-status',
    'Min vurdering', 'Apps Script-årsak/treff', 'Ekskludert domene?', 'Spørringer', 'Domene', 'KI-sammendrag']);
  kandidater.forEach(function (k) {
    var doc = k.doc, ts = doc.unix_timestamp, t = k.treff || {};
    rader.push([k.strommer.join(', '), typeof ts === 'number' ? d.fmtSek(ts) : '', opointTekstFelt(doc.header),
      opoint_t3_artikkelUrl(doc), opointKort(opointTekstFelt(doc.summary), 300), opoint_language(doc.language),
      doc.countrycode || '', doc.id_site !== undefined ? doc.id_site : '', opoint_firstSource(doc.first_source),
      doc.equalgroup !== undefined && doc.equalgroup !== null ? doc.equalgroup : '', k.sak, k.antallKilderISak,
      opoint_kj_kiRelevant(k), t.aiKategori || '', t.aiNotat || t.aiIrrelevantGrunn || '', k.appsStatus, '',
      k.appsArsak, k.ekskludert ? 'Ja' + (k.ekskluderGrunn ? ' (' + k.ekskluderGrunn + ')' : '') : '',
      k.sporringer.join(' | '), k.domene, t.aiSammendrag || '']);
  });
  return rader;
}

/** Leser Tier 2 fra "Søkeord" og D-tilordning fra forrige "Opoint-kjøring". Kun lesing, i try/catch. */
function opoint_kj_lesOppsett(ss) {
  var oppsett = { tier2: { sporringer: [], ord: [], merknader: [] }, tilordningD: opoint_kj_tilordneD({}), merknader: [] };
  try {
    oppsett.tier2 = opoint_kj_byggTier2(hentSokeord(ss));
  } catch (e) {
    oppsett.merknader.push('Klarte ikke å lese Tier 2 fra "Søkeord": ' + e.message + ' – strøm A uten Tier 2.');
  }
  try {
    oppsett.tilordningD = opoint_kj_tilordneD(opoint_kj_lesSiteDomener(ss, OPOINT_KJOR_FANE));
  } catch (e) {
    oppsett.merknader.push('Klarte ikke å lese id_site/Domene fra forrige kjøring: ' + e.message + ' – alle kilder i D2.');
  }
  oppsett.tier2.merknader.concat(oppsett.merknader).forEach(function (m) { Logger.log('Oppsett: ' + m); });
  oppsett.tilordningD.forEach(function (t) { Logger.log('D-tilordning: ' + t.id + ' ' + t.navn + ' → ' + t.domene + ' → ' + t.gruppe); });
  return oppsett;
}

function opoint_kj_byggRaderSporringer(resultater, vindu, d, oppsett) {
  var rader = [['Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest)], [''],
    ['Strøm', 'Spørring', 'Søketekst', 'HTTP-status per batch', 'Antall dokumenter', 'Unike grupper (equalgroup)',
      'Uten equalgroup', 'range_count per batch', 'Context tom?', 'Feil', 'Merknad']];
  resultater.forEach(function (r) {
    var t = opoint_kj_tell(r.dokumenter);
    rader.push([r.strom, r.navn, r.searchterm, r.statuser.join(', '), t.antall, t.unikeEqualgroup, t.utenEqualgroup,
      r.rangeCount.join(', '), opoint_kj_ctxTekst(r), r.feil, r.merknad]);
  });
  if (oppsett) {
    rader.push(['']);
    rader.push(['D-tilordning', 'id_site', 'Navn', 'Domene (fra forrige kjøring)', 'Gruppe']);
    oppsett.tilordningD.forEach(function (t) { rader.push(['', t.id, t.navn, t.domene, t.gruppe]); });
    rader.push(['']);
    rader.push(['Merknader om oppsett']);
    oppsett.tier2.merknader.concat(oppsett.merknader).forEach(function (m) { rader.push(['', m]); });
  }
  return rader;
}

function opoint_kj_skrivKjoring(ss, kandidater, resultater, vindu, klient, ki, apps, d, apiKey, oppsett) {
  var rader = opoint_kj_byggRaderKjoring(kandidater, vindu, klient, ki, apps, d);
  opoint_t3_skrivFane(ss, OPOINT_KJOR_FANE, rader, apiKey);
  var ark = ss.getSheetByName(OPOINT_KJOR_FANE);
  ark.getRange(1, 1, ark.getMaxRows(), ark.getMaxColumns()).clearDataValidations(); // kun denne fanen
  if (kandidater.length > 0) {
    var regel = SpreadsheetApp.newDataValidation().requireValueInList(['ja', 'delvis', 'nei'], true)
      .setAllowInvalid(false).build();
    ark.getRange(5, 17, kandidater.length, 1).setDataValidation(regel); // kolonne Q = "Min vurdering"
  }
  opoint_t3_skrivFane(ss, OPOINT_KJOR_FANE_SPORRINGER, opoint_kj_byggRaderSporringer(resultater, vindu, d, oppsett), apiKey);
}

/**
 * Test-e-post KUN til den som kjører skriptet, med "[Opoint-test]" i emnet.
 * Bygger HTML med eksisterende byggEpostHtmlMerkevare (uendret), men sender
 * med eget GmailApp-kall fordi sendEpostMedLogo() har fast emne og
 * mottakerliste. Seksjonene lages som to "kategorier".
 */
function opoint_kj_sendTestEpost(kandidater, resultater, vindu, ki, d) {
  var ny = [], ogsa = [];
  kandidater.forEach(function (k) {
    if (opoint_kj_kiRelevant(k) !== 'ja') return;
    if (k.appsStatus === 'ikke sett av Apps Script') ny.push(k.treff); else ogsa.push(k.treff);
  });
  if (ny.length + ogsa.length === 0) return 'E-post: ikke sendt (ingen KI-relevante kandidater).';
  var perKategori = {};
  if (ny.length) perKategori['Ny fra Opoint'] = ny;
  if (ogsa.length) perKategori['Også funnet av Apps Script'] = ogsa;
  var ok = resultater.filter(function (r) { return !r.feil; }).length;
  var feilet = resultater.filter(function (r) { return r.feil; }).map(function (r) { return r.navn; });
  var aiStat = { stoppetTidlig: false, stoppArsak: '', feil: [] };
  var logo = hentLogoBlob();
  var html = byggEpostHtmlMerkevare(perKategori, ok, resultater.length, feilet.length, feilet, aiStat, !!logo.blob);
  var tekst = byggEpostTekstversjonMerkevare(perKategori, ok, resultater.length, feilet.length, feilet, aiStat);
  var mottaker = Session.getEffectiveUser().getEmail();
  if (!mottaker) return 'E-post: ikke sendt (fant ikke e-postadressen til den som kjører skriptet).';
  var emne = '[Opoint-test] ' + d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest);
  var options = { htmlBody: html };
  if (logo.blob) options.inlineImages = { logo: logo.blob };
  GmailApp.sendEmail(mottaker, emne, tekst, options);
  return 'E-post sendt til den som kjører skriptet: ' + ny.length + ' nye, ' + ogsa.length + ' også funnet av Apps Script.';
}

// =====================================================================
// Steg 1 – testfunksjon (ingen KI-kall, ingen e-post). Fane "Opoint-test steg 1".
// =====================================================================

var OPOINT_KJ_TEST1_FANE = 'Opoint-test steg 1';
var OPOINT_KJ_TEST1_MAKS_KALL = 60;
var OPOINT_KJ_TEST1_HIST_START = '2026-11-03 00:00';
var OPOINT_KJ_TEST1_HIST_SLUTT = '2026-11-10 00:00';
// Titler som IKKE skal komme med for GASS etter steg 1 (MODENA-komfyrer, sykkelritt, COP31).
var OPOINT_KJ_TEST1_FORBUDT = ['modena', 'sykkel', 'cop31', 'cop 31', 'stealthgas', 'stealth gas', 'nasdaq'];
var OPOINT_KJ_TEST1_STEALTH = ['stealthgas', 'stealth gas', 'nasdaq'];
// Tittel som SKAL komme med i vinduet 3.–9. november (Smart Maritime Network, 5. nov).
var OPOINT_KJ_TEST1_MA_FINNES = 'GASS completes final Business Plan';

function opoint_kj_testSteg1() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
  var rader = [];
  try {
    var vindu = opoint_beregnVindu(OPOINT_KJOR_START, OPOINT_KJOR_SLUTT, undefined, startMs, parse);
    var vinduH = opoint_beregnVindu(OPOINT_KJ_TEST1_HIST_START, OPOINT_KJ_TEST1_HIST_SLUTT, undefined, startMs, parse);
    var oppsett = opoint_kj_lesOppsett(ss);
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_TEST1_MAKS_KALL);
    var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
    var resultat = opoint_kj_kjorTestSteg1(klient, oppsett, vindu, vinduH, tidUte);
    rader = opoint_kj_byggRaderTestSteg1(resultat, oppsett, vindu, vinduH, klient, d);
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_TEST1_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_TEST1_FANE + '".');
}

function opoint_kj_kjorTestSteg1(klient, oppsett, vindu, vinduH, tidUte) {
  var hent = function (sp, v) {
    var r = opoint_kj_hentSporring(klient, sp, v, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    if (sp.verifiserSites && !r.feil) opoint_kj_verifiserSites(r, sp.verifiserSites);
    return r;
  };
  var ut = { gassGammel: null, gassNy: null, gassHist: null, dGammel: null, dNy: [], tier2: [], feil: [] };
  var gassSp = null;
  oppsett.tier2.sporringer.forEach(function (sp) { if (/^A T2 gass$/i.test(sp.navn)) gassSp = sp; });

  ut.gassGammel = hent({ strom: 'A', navn: 'A GASS (før steg 1)', searchterm: 'GASS' }, vindu);
  if (gassSp) {
    ut.gassNy = hent(gassSp, vindu);
    ut.gassHist = hent({ strom: 'A', navn: gassSp.navn + ' (3.–9. nov)', searchterm: gassSp.searchterm }, vinduH);
    ut.gassHistUten = hent({ strom: 'A', navn: gassSp.navn + ' uten unntak (3.–9. nov)', searchterm: gassSp.utenUnntak }, vinduH);
  } else {
    ut.feil.push('Fant ikke Tier 2-ordet GASS i "Søkeord" – GASS-testen er ikke kjørt.');
  }
  ut.dGammel = hent({ strom: 'D', navn: 'D før steg 1 (alle saker)', verifiserSites: true,
    searchterm: 'site:' + OPOINT_KJOR_D_SITES.map(function (s) { return s.id; }).join(',') }, vindu);
  opoint_kj_byggStromD(oppsett.tilordningD).forEach(function (sp) { ut.dNy.push(hent(sp, vindu)); });
  oppsett.tier2.sporringer.forEach(function (sp) { if (sp !== gassSp) ut.tier2.push(hent(sp, vindu)); });
  return ut;
}

/** Titler i en resultatliste som inneholder et av ordene (små bokstaver). */
function opoint_kj_finnTitler(res, ord) {
  if (!res) return [];
  return res.dokumenter.map(function (doc) { return opointTekstFelt(doc.header); }).filter(function (t) {
    var lav = t.toLowerCase();
    return ord.some(function (o) { return lav.indexOf(o.toLowerCase()) >= 0; });
  });
}

function opoint_kj_byggRaderTestSteg1(r, oppsett, vindu, vinduH, klient, d) {
  var rader = [];
  rader.push(['Test steg 1', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest), 'Historisk vindu',
    d.fmtSek(vinduH.oldest) + ' – ' + d.fmtSek(vinduH.newest), 'HTTP-kall', klient.antall(),
    'Kalltak nådd?', klient.takNadd() ? 'Ja' : 'Nei', 'KI-kall', 0]);
  rader.push(['']);
  var forbudtFor = opoint_kj_finnTitler(r.gassGammel, OPOINT_KJ_TEST1_FORBUDT);
  var forbudtEtter = opoint_kj_finnTitler(r.gassNy, OPOINT_KJ_TEST1_FORBUDT);
  var funnet = opoint_kj_finnTitler(r.gassHist, [OPOINT_KJ_TEST1_MA_FINNES]);
  rader.push(['Sjekk', 'Resultat', 'Detaljer']);
  rader.push(['GASS: MODENA/sykkel/COP31 borte', !r.gassNy ? 'IKKE KJØRT' : (forbudtEtter.length ? 'FEIL' :
    (forbudtFor.length ? 'OK' : 'OK, men ikke bevist (ingen slike titler før heller)')),
    'Før: ' + forbudtFor.length + ' (' + forbudtFor.join(' ‖ ') + '). Etter: ' + forbudtEtter.length +
    (forbudtEtter.length ? ' (' + forbudtEtter.join(' ‖ ') + ')' : '')]);
  var stFor = opoint_kj_finnTitler(r.gassHistUten, OPOINT_KJ_TEST1_STEALTH);
  var stEtter = opoint_kj_finnTitler(r.gassHist, OPOINT_KJ_TEST1_STEALTH);
  rader.push(['GASS: StealthGas/NASDAQ borte i 3.–9. nov', !r.gassHist ? 'IKKE KJØRT' : (stEtter.length ? 'FEIL' :
    (stFor.length ? 'OK' : 'OK, men ikke bevist (ingen slike titler uten unntak heller)')),
    'Uten unntak: ' + stFor.length + ' (' + stFor.join(' ‖ ') + '). Med unntak: ' + stEtter.length +
    (stEtter.length ? ' (' + stEtter.join(' ‖ ') + ')' : '')]);
  rader.push(['GASS: "' + OPOINT_KJ_TEST1_MA_FINNES + '" i 3.–9. nov', !r.gassHist ? 'IKKE KJØRT' : (funnet.length ? 'OK' : 'FEIL'),
    funnet.length ? funnet.join(' ‖ ') : 'Ikke blant ' + r.gassHist.dokumenter.length + ' dokumenter' +
    (r.gassHist.feil ? ' – feil: ' + r.gassHist.feil : '')]);
  var nyD = 0, nyIder = {};
  r.dNy.forEach(function (x) { nyD += x.dokumenter.length; x.dokumenter.forEach(function (doc) { nyIder[doc.id_site + '_' + doc.id_article] = true; }); });
  rader.push(['D: dokumenter før/etter', 'Før: ' + r.dGammel.dokumenter.length + (r.dGammel.contextTom === false ? '+ (flere fantes)' : ''),
    'Etter (D1+D2): ' + nyD + ' dokumenter, ' + Object.keys(nyIder).length + ' unike artikler']);
  r.feil.forEach(function (f) { rader.push(['Feil', f]); });
  rader.push(['']);
  rader.push(['Spørring', 'Søketekst', 'Status per batch', 'Dokumenter', 'Context tom?', 'Feil', 'Merknad', 'Titler']);
  [r.gassGammel, r.gassNy, r.gassHistUten, r.gassHist, r.dGammel].concat(r.dNy, r.tier2).forEach(function (x) {
    if (!x) return;
    rader.push([x.navn, x.searchterm, x.statuser.join(', '), x.dokumenter.length, opoint_kj_ctxTekst(x), x.feil, x.merknad,
      x.dokumenter.map(function (doc) { return opointTekstFelt(doc.header) + ' [' + opoint_kj_domene(doc) + ']'; }).join(' ‖ ')]);
  });
  rader.push(['']);
  rader.push(['D-tilordning', 'id_site', 'Navn', 'Domene (fra forrige kjøring)', 'Gruppe']);
  oppsett.tilordningD.forEach(function (t) { rader.push(['', t.id, t.navn, t.domene, t.gruppe, t.kilde]); });
  rader.push(['']);
  rader.push(['Merknader om oppsett (Søkeord)']);
  oppsett.tier2.merknader.concat(oppsett.merknader).forEach(function (m) { rader.push(['', m]); });
  return rader;
}

// =====================================================================
// Rettelse d – uketest for utvalgte Tier 2-ord (ingen KI). Fane "Opoint-test uke".
// Fyll inn datoene (yyyy-MM-dd HH:mm, Europe/Oslo) før kjøring.
// =====================================================================

var OPOINT_KJ_UKE_START = '';
var OPOINT_KJ_UKE_SLUTT = '';
// Rettelse b: fem Tier 2-ord. Tomme datoer = siste OPOINT_KJ_UKE_DAGER dager.
var OPOINT_KJ_UKE_ORD = ['FLAGSHIPS', 'TrAM', 'Apollo', 'AWESOME', 'zero-emission zone'];
var OPOINT_KJ_UKE_DAGER = 30;
var OPOINT_KJ_UKE_FANE = 'Opoint-test uke';
var OPOINT_KJ_UKE_MAKS_KALL = 25;

function opoint_kj_testUke() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader;
  try {
    {
      var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
      var tomme = !String(OPOINT_KJ_UKE_START).trim() && !String(OPOINT_KJ_UKE_SLUTT).trim();
      var vindu = tomme ? opoint_t3_vinduDager(OPOINT_KJ_UKE_DAGER, startMs)
        : opoint_beregnVindu(OPOINT_KJ_UKE_START, OPOINT_KJ_UKE_SLUTT, undefined, startMs, parse);
      var oppsett = opoint_kj_lesOppsett(ss);
      var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_UKE_MAKS_KALL);
      var res = opoint_kj_kjorUke(klient, oppsett.tier2, vindu, opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS));
      rader = opoint_kj_byggRaderUke(res, vindu, klient, d);
    }
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_UKE_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_UKE_FANE + '".');
}

function opoint_kj_kjorUke(klient, tier2, vindu, tidUte) {
  return OPOINT_KJ_UKE_ORD.map(function (ord) {
    var sp = null;
    tier2.sporringer.forEach(function (x) { if (x.navn.toLowerCase() === ('A T2 ' + ord).toLowerCase()) sp = x; });
    if (!sp) {
      return { navn: ord, searchterm: '', statuser: [], dokumenter: [], rangeCount: [], contextTom: '',
        feil: 'Fant ikke "' + ord + '" som Tier 2-ord med kontekst i "Søkeord".', merknad: '' };
    }
    return opoint_kj_hentSporring(klient, sp, vindu, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
  });
}

function opoint_kj_byggRaderUke(res, vindu, klient, d) {
  var rader = [['Uketest', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest), 'HTTP-kall', klient.antall(), 'KI-kall', 0],
    [''], ['Ord', 'Søketekst', 'Status per batch', 'Dokumenter', 'Unike artikler', 'Context tom?', 'range_count per batch',
      'Feil', 'Titler [domene]']];
  res.forEach(function (r) {
    rader.push([r.navn, r.searchterm, r.statuser.join(', '), r.dokumenter.length, opoint_kj_tell(r.dokumenter).unikeArtikler,
      opoint_kj_ctxTekst(r), r.rangeCount.join(', '), r.feil || r.merknad,
      r.dokumenter.map(function (doc) { return opointTekstFelt(doc.header) + ' [' + opoint_kj_domene(doc) + ']'; }).join(' ‖ ')]);
  });
  return rader;
}

// =====================================================================
// Steg 2b – før/etter for strøm B (ingen KI). Fane "Opoint-test steg 2".
// =====================================================================

var OPOINT_KJ_TEST2_FANE = 'Opoint-test steg 2';
var OPOINT_KJ_TEST2_MAKS_KALL = 90;

function opoint_kj_testSteg2() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader;
  try {
    var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
    var vindu = opoint_beregnVindu(OPOINT_KJOR_START, OPOINT_KJOR_SLUTT, undefined, startMs, parse);
    var forrigeKi = opoint_kj_lesForrigeKi(ss, OPOINT_KJOR_FANE);
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_TEST2_MAKS_KALL);
    var sammenlign = opoint_kj_kjorTestSteg2(klient, vindu, forrigeKi, opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS));
    rader = opoint_kj_byggRaderTestSteg2(sammenlign, vindu, klient, forrigeKi, d);
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_TEST2_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_TEST2_FANE + '".');
}

/** Leser normalisert URL → "KI relevant" fra forrige "Opoint-kjøring" (kun lesing). */
function opoint_kj_lesForrigeKi(ss, fane) {
  var ark = ss.getSheetByName(fane);
  if (!ark || ark.getLastRow() < 2) return { kart: {}, antall: 0 };
  return opoint_kj_forrigeKiFraRader(ark.getDataRange().getValues());
}

function opoint_kj_forrigeKiFraRader(data) {
  var ut = { kart: {}, antall: 0 };
  for (var h = 0; h < Math.min(10, data.length); h++) {
    var hode = data[h].map(function (x) { return String(x).trim().toLowerCase(); });
    var iUrl = hode.indexOf('url'), iKi = hode.indexOf('ki relevant');
    if (iUrl < 0 || iKi < 0) continue;
    for (var r = h + 1; r < data.length; r++) {
      var n = opoint_kj_normUrl(data[r][iUrl]);
      if (n) { ut.kart[n] = String(data[r][iKi]).trim().toLowerCase(); ut.antall++; }
    }
    return ut;
  }
  return ut;
}

function opoint_kj_kjorTestSteg2(klient, vindu, forrigeKi, tidUte, fjern) {
  var gamle = opoint_kj_byggStromB(true), nye = opoint_kj_byggStromB(false, fjern);
  var nokkel = function (doc) { return doc.id_site + '_' + doc.id_article; };
  return gamle.map(function (g, i) {
    var rg = opoint_kj_hentSporring(klient, g, vindu, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    var rn = opoint_kj_hentSporring(klient, nye[i], vindu, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    var iNy = {}, iGammel = {};
    rn.dokumenter.forEach(function (doc) { iNy[nokkel(doc)] = true; iNy[opoint_kj_normUrl(opoint_t3_artikkelUrl(doc))] = true; });
    rg.dokumenter.forEach(function (doc) { iGammel[nokkel(doc)] = true; });
    var borte = rg.dokumenter.filter(function (doc) {
      return !iNy[nokkel(doc)] && !iNy[opoint_kj_normUrl(opoint_t3_artikkelUrl(doc))];
    }).map(function (doc) {
      var ki = forrigeKi.kart[opoint_kj_normUrl(opoint_t3_artikkelUrl(doc))] || '';
      return { tittel: opointTekstFelt(doc.header), domene: opoint_kj_domene(doc), url: opoint_t3_artikkelUrl(doc), kiForrige: ki };
    });
    var nyeDok = rn.dokumenter.filter(function (doc) { return !iGammel[nokkel(doc)]; }).length;
    return { navn: g.navn, gammel: rg, ny: rn, borte: borte, nyeDok: nyeDok };
  });
}

function opoint_kj_byggRaderTestSteg2(s, vindu, klient, forrigeKi, d) {
  var borteTotalt = 0, borteJa = 0;
  s.forEach(function (x) { borteTotalt += x.borte.length; x.borte.forEach(function (b) { if (b.kiForrige === 'ja') borteJa++; }); });
  var rader = [['Test steg 2 (strøm B)', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest), 'HTTP-kall', klient.antall(),
    'Kalltak nådd?', klient.takNadd() ? 'Ja' : 'Nei', 'KI-kall', 0, 'Forsvunnet totalt', borteTotalt,
    'hvorav KI «ja» i forrige kjøring', borteJa, 'Rader med KI-vurdering lest fra forrige kjøring', forrigeKi.antall],
    ['Ny kontekst (standard)', opoint_kj_bKontekst({}, s.fjern || []), 'ANDNOT-ord tatt ut',
      (s.fjern || []).concat(OPOINT_B_ANDNOT_FJERN).join(', ') || '(ingen)'], [''],
    ['Spørring', 'Dokumenter før', 'Dokumenter etter', 'Forsvunnet', 'Nye (bare etter)', 'Context tom før/etter',
      'Feil før', 'Feil etter', 'Søketekst før', 'Søketekst etter']];
  s.forEach(function (x) {
    rader.push([x.navn, x.gammel.dokumenter.length, x.ny.dokumenter.length, x.borte.length, x.nyeDok,
      opoint_kj_ctxTekst(x.gammel) + ' / ' + opoint_kj_ctxTekst(x.ny), x.gammel.feil, x.ny.feil,
      x.gammel.searchterm, x.ny.searchterm]);
  });
  rader.push(['']);
  rader.push(['Forsvunne dokumenter', 'Spørring', 'Tittel', 'Domene', 'URL', 'KI i forrige kjøring', 'Merk']);
  s.forEach(function (x) {
    x.borte.forEach(function (b) {
      rader.push(['', x.navn, b.tittel, b.domene, b.url, b.kiForrige || '(ikke funnet)',
        b.kiForrige === 'ja' ? 'KI-RELEVANT FORSVANT' : '']);
    });
  });
  return rader;
}

// =====================================================================
// Rettelse a – kontroll av D-kildenes id_site (ingen KI). Fane "Opoint-test D".
// 1) Leser forrige "Opoint-kjøring" (kun lesing): hvilke id_site har treff
//    fra hvert forventet domene, og hvilket id_site har kontrolltittelen.
// 2) Kjører D1-spørringene mot dagsvinduet og 3.–10. november.
// =====================================================================

var OPOINT_KJ_TESTD_FANE = 'Opoint-test D';
var OPOINT_KJ_TESTD_MAKS_KALL = 30;
var OPOINT_KJ_TESTD_HIST_START = '2026-11-03 00:00';
var OPOINT_KJ_TESTD_HIST_SLUTT = '2026-11-11 00:00'; // til og med 10. november
var OPOINT_KJ_TESTD_KONTROLLTITTEL = 'Brann i ladetårn ved ferjekai';

function opoint_kj_testD() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader;
  try {
    var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
    var vinduer = [
      { navn: 'dagsvindu', v: opoint_beregnVindu(OPOINT_KJOR_START, OPOINT_KJOR_SLUTT, undefined, startMs, parse) },
      { navn: '3.–10. nov', v: opoint_beregnVindu(OPOINT_KJ_TESTD_HIST_START, OPOINT_KJ_TESTD_HIST_SLUTT, undefined, startMs, parse) }
    ];
    var forrige = ss.getSheetByName(OPOINT_KJOR_FANE);
    var kontroll = opoint_kj_kontrollerDIder(forrige && forrige.getLastRow() >= 2 ? forrige.getDataRange().getValues() : []);
    var oppsett = opoint_kj_lesOppsett(ss);
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_TESTD_MAKS_KALL);
    var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
    var d1 = opoint_kj_byggStromD(oppsett.tilordningD).filter(function (sp) { return sp.navn.indexOf('D1') === 0; });
    var kjoringer = [];
    vinduer.forEach(function (vi) {
      d1.forEach(function (sp) {
        var r = opoint_kj_hentSporring(klient, sp, vi.v, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
        if (!r.feil) opoint_kj_verifiserSites(r, sp.verifiserSites);
        r.vinduNavn = vi.navn;
        kjoringer.push(r);
      });
    });
    rader = opoint_kj_byggRaderTestD(kontroll, oppsett.tilordningD, kjoringer, vinduer, klient, d);
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_TESTD_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_TESTD_FANE + '".');
}

/** Ren funksjon: id_site per forventet domene i forrige kjøring, og id_site for kontrolltittelen. */
function opoint_kj_kontrollerDIder(data) {
  var ut = { kilder: [], kontrolltittel: [], fantOverskrift: false };
  var iSite = -1, iDom = -1, iTit = -1, h;
  for (h = 0; h < Math.min(10, data.length); h++) {
    var hode = data[h].map(function (x) { return String(x).trim().toLowerCase(); });
    iSite = hode.indexOf('id_site'); iDom = hode.indexOf('domene'); iTit = hode.indexOf('tittel');
    if (iSite >= 0 && iDom >= 0) { ut.fantOverskrift = true; break; }
  }
  var perDomene = {};
  if (ut.fantOverskrift) {
    for (var r = h + 1; r < data.length; r++) {
      var dom = String(data[r][iDom]).trim().toLowerCase().replace(/^www\./, '');
      var id = String(data[r][iSite]).trim();
      if (dom && id) { perDomene[dom] = perDomene[dom] || {}; perDomene[dom][id] = (perDomene[dom][id] || 0) + 1; }
      if (iTit >= 0 && String(data[r][iTit]).indexOf(OPOINT_KJ_TESTD_KONTROLLTITTEL) >= 0) {
        ut.kontrolltittel.push({ tittel: String(data[r][iTit]), id_site: id, domene: dom });
      }
    }
  }
  OPOINT_KJOR_D_SITES.forEach(function (s) {
    var sett = perDomene[s.domene] || {};
    var ider = Object.keys(sett);
    var status = !ider.length ? 'ikke sett i forrige kjøring' :
      (ider.length === 1 && ider[0] === String(s.id) ? 'OK' : 'AVVIK');
    ut.kilder.push({ navn: s.navn, domene: s.domene, konfigurertId: s.id,
      settIder: ider.map(function (i) { return i + ' (' + sett[i] + ' treff)'; }).join(', '), status: status });
  });
  return ut;
}

function opoint_kj_byggRaderTestD(kontroll, tilordning, kjoringer, vinduer, klient, d) {
  var rader = [['Test D (id_site)', 'HTTP-kall', klient.antall(), 'Kalltak nådd?', klient.takNadd() ? 'Ja' : 'Nei', 'KI-kall', 0]];
  rader.push(['']);
  rader.push(['Kontroll mot forrige "' + OPOINT_KJOR_FANE + '"', kontroll.fantOverskrift ? '' : 'Fant ikke kolonnene id_site og Domene']);
  rader.push(['Kilde', 'Forventet domene', 'Konfigurert id_site', 'id_site sett i forrige kjøring', 'Status']);
  kontroll.kilder.forEach(function (k) { rader.push([k.navn, k.domene, k.konfigurertId, k.settIder, k.status]); });
  rader.push(['Kontrolltittel "' + OPOINT_KJ_TESTD_KONTROLLTITTEL + '"', kontroll.kontrolltittel.length ?
    kontroll.kontrolltittel.map(function (t) { return 'id_site ' + t.id_site + ' [' + t.domene + ']'; }).join(', ') : 'ikke funnet']);
  rader.push(['']);
  rader.push(['D-tilordning', 'id_site', 'Navn', 'Domene', 'Gruppe', 'Grunnlag']);
  tilordning.forEach(function (t) { rader.push(['', t.id, t.navn, t.domene, t.gruppe, t.kilde]); });
  rader.push(['']);
  rader.push(['Vindu', 'Spørring', 'Søketekst', 'Status per batch', 'Dokumenter', 'Context tom?', 'Feil/merknad']);
  kjoringer.forEach(function (r) {
    rader.push([r.vinduNavn, r.navn, r.searchterm, r.statuser.join(', '), r.dokumenter.length, opoint_kj_ctxTekst(r), r.feil || r.merknad]);
  });
  rader.push(['']);
  rader.push(['Vindu', 'Spørring', 'Skipsrevyen?', 'id_site', 'Domene', 'Dato', 'Tittel', 'URL']);
  kjoringer.forEach(function (r) {
    r.dokumenter.forEach(function (doc) {
      var dom = opoint_kj_domene(doc);
      var sr = String(doc.id_site) === '64' || dom === 'skipsrevyen.no';
      rader.push([r.vinduNavn, r.navn, sr ? 'JA' : '', doc.id_site, dom,
        typeof doc.unix_timestamp === 'number' ? d.fmtSek(doc.unix_timestamp) : '', opointTekstFelt(doc.header),
        opoint_t3_artikkelUrl(doc)]);
    });
  });
  return rader;
}

// =====================================================================
// Steg 2a + 2b – hvilke ANDNOT-ord fjerner de tre relevante sakene, og B med
// gammel positiv kontekst + ANDNOT uten disse ordene. Ingen KI.
// Fane "Opoint-test steg 2B".
// =====================================================================

var OPOINT_KJ_T2B_FANE = 'Opoint-test steg 2B';
var OPOINT_KJ_T2B_MAKS_KALL = 130;
var OPOINT_KJ_T2B_ARTIKLER = [
  { tittel: 'Auramarine to supply methanol fuel systems for two German research vessels', domene: 'tradearabia.com' },
  { tittel: "Norwegian shipping company takes delivery of the world's largest electric vessel built in China", domene: 'scandasia.com' },
  { tittel: 'Denmark Orders Three 40-Knot Electric Ferries with 165MWh Batteries', domene: 'europesays.com' }
];
// Titler som ikke skal være igjen etter filteret (mobiler, hodetelefoner, e-sykler, laptoper).
var OPOINT_KJ_T2B_UONSKET = ['phone', 'smartphone', 'iphone', 'headphone', 'earbud', 'earphone', 'e-bike', 'ebike', 'laptop'];

function opoint_kj_testSteg2B() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader = [];
  try {
    var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
    var vindu = opoint_beregnVindu(OPOINT_KJOR_START, OPOINT_KJOR_SLUTT, undefined, startMs, parse);
    var forrigeKi = opoint_kj_lesForrigeKi(ss, OPOINT_KJOR_FANE);
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_T2B_MAKS_KALL);
    var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
    var a = opoint_kj_kjorSteg2A(klient, vindu, tidUte);
    var b = opoint_kj_kjorTestSteg2(klient, vindu, forrigeKi, tidUte, a.skyldige);
    b.fjern = a.skyldige;
    rader = opoint_kj_byggRaderSteg2A(a, vindu, klient, d).concat([['']],
      opoint_kj_byggRaderTestSteg2(b, vindu, klient, forrigeKi, d), [['']], opoint_kj_byggRaderUonsket(b));
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_T2B_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_T2B_FANE + '".');
}

/**
 * Steg 2a: finner hver artikkel med header:-søk på de 4 mest særegne ordene
 * i tittelen, og kjører deretter "<id-søk> AND (ord)" for hvert ANDNOT-ord.
 * Treff = ordet finnes i artikkelen (ANDNOT gjelder hele teksten, ikke bare tittelen).
 */
function opoint_kj_kjorSteg2A(klient, vindu, tidUte) {
  var ut = { artikler: [], skyldige: [] };
  OPOINT_KJ_T2B_ARTIKLER.forEach(function (art) {
    var r = { tittel: art.tittel, domene: art.domene, idSok: '', funnet: null, iTittel: [], treffOrd: [], ordResultat: [], feil: '' };
    ut.artikler.push(r);
    var lav = art.tittel.toLowerCase();
    OPOINT_B_ANDNOT_ORD.forEach(function (o) {
      var ren = o.replace(/["*]/g, '').toLowerCase();
      if (lav.indexOf(ren) >= 0) r.iTittel.push(o);
    });
    r.idSok = opoint_t3_saeregneOrd(art.tittel).slice(0, 4).map(function (w) { return 'header:' + w; }).join(' AND ');
    var base = opoint_kj_hentSporring(klient, { navn: 'id', searchterm: r.idSok }, vindu, 25, 1, true, tidUte);
    if (base.feil) { r.feil = base.feil; return; }
    r.funnet = opoint_kj_finnArtikkel(base.dokumenter, art);
    if (!r.funnet) { r.feil = 'Fant ikke artikkelen med id-søket (' + base.dokumenter.length + ' dokumenter).'; return; }
    OPOINT_B_ANDNOT_ORD.forEach(function (o) {
      var t = opoint_kj_hentSporring(klient, { navn: o, searchterm: r.idSok + ' AND (' + o + ')' }, vindu, 25, 1, true, tidUte);
      var treff = !t.feil && !!opoint_kj_finnArtikkel(t.dokumenter, art);
      r.ordResultat.push({ ord: o, treff: treff, feil: t.feil });
      if (treff) {
        r.treffOrd.push(o);
        if (ut.skyldige.indexOf(o) < 0) ut.skyldige.push(o);
      }
    });
  });
  return ut;
}

/** Finner artikkelen i en dokumentliste: domene + tittellikhet ≥ 80 %, ellers tittellikhet ≥ 90 %. */
function opoint_kj_finnArtikkel(dokumenter, art) {
  var best = null, bestL = 0;
  dokumenter.forEach(function (doc) {
    var l = opoint_t3_tittelLikhet(art.tittel, opointTekstFelt(doc.header));
    var domOk = opoint_kj_domene(doc).indexOf(art.domene) >= 0;
    if ((domOk && l >= 0.8) || l >= 0.9) { if (l > bestL) { bestL = l; best = doc; } }
  });
  return best;
}

function opoint_kj_byggRaderSteg2A(a, vindu, klient, d) {
  var rader = [['Steg 2a: ANDNOT-ord mot de tre relevante sakene', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest),
    'HTTP-kall (hele testen)', klient.antall(), 'Kalltak nådd?', klient.takNadd() ? 'Ja' : 'Nei', 'KI-kall', 0],
    ['Ord som treffer minst én av sakene (tatt ut av ANDNOT i 2b)', a.skyldige.join(', ') || '(ingen)'],
    ['Artikkel', 'Domene', 'Funnet med id-søk?', 'Id-søk', 'ANDNOT-ord i selve tittelen', 'ANDNOT-ord som treffer artikkelen', 'Feil']];
  a.artikler.forEach(function (r) {
    rader.push([r.tittel, r.domene, r.funnet ? 'Ja' : 'Nei', r.idSok, r.iTittel.join(', '), r.treffOrd.join(', ') || (r.funnet ? '(ingen)' : ''), r.feil]);
  });
  rader.push(['']);
  rader.push(['Detalj', 'Artikkel', 'Ord', 'Treffer?', 'Feil']);
  a.artikler.forEach(function (r) {
    r.ordResultat.forEach(function (o) { rader.push(['', opointKort(r.tittel, 50), o.ord, o.treff ? 'JA' : 'nei', o.feil]); });
  });
  return rader;
}

/** Uønskede titler (mobil, hodetelefoner, e-sykler …) før og etter for strøm B. */
function opoint_kj_byggRaderUonsket(b) {
  var rader = [['Uønskede titler (mobil/hodetelefoner/e-sykkel/laptop)', 'Spørring', 'Før/etter', 'Tittel', 'Domene']];
  var antFor = 0, antEtter = 0;
  b.forEach(function (x) {
    [['før', x.gammel], ['etter', x.ny]].forEach(function (par) {
      par[1].dokumenter.forEach(function (doc) {
        var t = opointTekstFelt(doc.header), lav = t.toLowerCase();
        if (OPOINT_KJ_T2B_UONSKET.some(function (o) { return lav.indexOf(o) >= 0; })) {
          if (par[0] === 'før') antFor++; else antEtter++;
          rader.push(['', x.navn, par[0], t, opoint_kj_domene(doc)]);
        }
      });
    });
  });
  rader.splice(1, 0, ['Antall', 'før: ' + antFor, 'etter: ' + antEtter, antEtter === 0 ? 'OK' : 'FEIL: uønskede titler igjen']);
  return rader;
}

// =====================================================================
// Steg 2c – skipsregistersider i D, 3.–10. november. Ingen KI. Fane "Opoint-test steg 2C".
// =====================================================================

var OPOINT_KJ_T2C_FANE = 'Opoint-test steg 2C';
var OPOINT_KJ_T2C_MAKS_KALL = 25;

function opoint_kj_testSteg2C() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader;
  try {
    var parse = function (s) { return Utilities.parseDate(s, 'Europe/Oslo', 'yyyy-MM-dd HH:mm'); };
    var vindu = opoint_beregnVindu(OPOINT_KJ_TESTD_HIST_START, OPOINT_KJ_TESTD_HIST_SLUTT, undefined, startMs, parse);
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_T2C_MAKS_KALL);
    var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
    var res = opoint_kj_byggStromD(opoint_kj_tilordneD({})).map(function (sp) {
      var r = opoint_kj_hentSporring(klient, sp, vindu, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
      if (!r.feil) opoint_kj_verifiserSites(r, sp.verifiserSites);
      return r;
    });
    rader = opoint_kj_byggRaderSteg2C(res, vindu, klient, d);
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_T2C_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_T2C_FANE + '".');
}

function opoint_kj_byggRaderSteg2C(res, vindu, klient, d) {
  var sett = {}, alle = [];
  res.forEach(function (r) {
    r.dokumenter.forEach(function (doc) {
      var n = doc.id_site + '_' + doc.id_article;
      if (sett[n]) return;
      sett[n] = true;
      alle.push({ doc: doc, sporring: r.navn, grunn: opoint_kj_skipsregisterGrunn(doc) });
    });
  });
  var bort = alle.filter(function (x) { return x.grunn; }).length;
  var rader = [['Steg 2c: skipsregistersider i D', 'Vindu', d.fmtSek(vindu.oldest) + ' – ' + d.fmtSek(vindu.newest),
    'HTTP-kall', klient.antall(), 'KI-kall', 0, 'Unike dokumenter', alle.length, 'Ekskludert', bort, 'Igjen', alle.length - bort],
    [''], ['Spørring', 'Søketekst', 'Status per batch', 'Dokumenter', 'Context tom?', 'Feil/merknad']];
  res.forEach(function (r) { rader.push([r.navn, r.searchterm, r.statuser.join(', '), r.dokumenter.length, opoint_kj_ctxTekst(r), r.feil || r.merknad]); });
  rader.push(['']);
  rader.push(['Ekskludert?', 'Grunn', 'Spørring', 'id_site', 'Domene', 'Tittel', 'URL']);
  alle.forEach(function (x) {
    rader.push([x.grunn ? 'JA' : '', x.grunn, x.sporring, x.doc.id_site, opoint_kj_domene(x.doc), opointTekstFelt(x.doc.header),
      opoint_t3_artikkelUrl(x.doc)]);
  });
  return rader;
}

// =====================================================================
// Steg 2d + 2e – Apollo/AWESOME (overstyrt) siste 30 dager, og range_count
// for tre Apollo-varianter over 7 dager. Ingen KI. Fane "Opoint-test steg 2DE".
// =====================================================================

var OPOINT_KJ_T2DE_FANE = 'Opoint-test steg 2DE';
var OPOINT_KJ_T2DE_MAKS_KALL = 30;

function opoint_kj_testSteg2DE() {
  var apiKey = opoint_t3_hentNokkel();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startMs = Date.now();
  var d = opoint_t3_datoFunksjoner();
  var rader;
  try {
    var klient = opoint_t3_lagKlient(apiKey, OPOINT_KJ_T2DE_MAKS_KALL);
    var tidUte = opoint_kj_tidsvakt(startMs, OPOINT_KJOR_TIDSBUDSJETT_MS);
    var v30 = opoint_t3_vinduDager(30, startMs), v7 = opoint_t3_vinduDager(7, startMs);
    var dDel = ['Apollo', 'AWESOME'].map(function (ord) {
      var q = opoint_kj_finnOverstyring(ord);
      return opoint_kj_hentSporring(klient, { navn: ord + ' (overstyrt)', searchterm: q }, v30,
        OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    });
    var eDel = [['(1) bare Apollo', 'Apollo'], ['(2) Apollo AND ammonia*', 'Apollo AND ammonia*'],
      ['(3) ny Apollo-spørring', opoint_kj_finnOverstyring('Apollo')]].map(function (p) {
      return opoint_kj_hentSporring(klient, { navn: p[0], searchterm: p[1] }, v7, OPOINT_KJOR_REQUESTED, OPOINT_KJOR_MAKS_BATCHER, true, tidUte);
    });
    rader = opoint_kj_byggRaderSteg2DE(dDel, eDel, v30, v7, klient, d);
  } catch (e) {
    rader = [['FEIL', opointMaskerNokkel(String(e && e.message ? e.message : e), apiKey)]];
  }
  opoint_t3_skrivFane(ss, OPOINT_KJ_T2DE_FANE, rader, apiKey);
  Logger.log('Skrevet til "' + OPOINT_KJ_T2DE_FANE + '".');
}

function opoint_kj_byggRaderSteg2DE(dDel, eDel, v30, v7, klient, d) {
  var rader = [['Steg 2d + 2e', 'HTTP-kall', klient.antall(), 'Kalltak nådd?', klient.takNadd() ? 'Ja' : 'Nei', 'KI-kall', 0], [''],
    ['2d: siste 30 dager', d.fmtSek(v30.oldest) + ' – ' + d.fmtSek(v30.newest)],
    ['Spørring', 'Søketekst', 'Status per batch', 'Dokumenter', 'Context tom?', 'Feil']];
  dDel.forEach(function (r) { rader.push([r.navn, r.searchterm, r.statuser.join(', '), r.dokumenter.length, opoint_kj_ctxTekst(r), r.feil]); });
  rader.push(['Spørring', 'Dato', 'Tittel', 'Domene']);
  dDel.forEach(function (r) {
    r.dokumenter.forEach(function (doc) {
      rader.push([r.navn, typeof doc.unix_timestamp === 'number' ? d.fmtSek(doc.unix_timestamp) : '', opointTekstFelt(doc.header), opoint_kj_domene(doc)]);
    });
  });
  rader.push(['']);
  rader.push(['2e: range_count, siste 7 dager', d.fmtSek(v7.oldest) + ' – ' + d.fmtSek(v7.newest)]);
  rader.push(['Variant', 'Søketekst', 'range_count per batch', 'Returnerte dokumenter', 'Batcher', 'Context tom?', 'Feil']);
  eDel.forEach(function (r) {
    rader.push([r.navn, r.searchterm, r.rangeCount.join(', '), r.dokumenter.length, r.batcher, opoint_kj_ctxTekst(r), r.feil]);
  });
  return rader;
}
