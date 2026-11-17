/**
 * 12_Artikkellogg.gs
 *
 * Steg B: logger ÉN rad per artikkel som matchet et søkeord og gikk videre
 * til filter/KI-vurdering i en gitt kjøring - inkludert de AI sorterer som
 * "Mulig irrelevant" (IKKE alle feed-elementer, kun de som allerede har
 * passert søkeordfiltrering OG deduplisering mot "Sendte artikler").
 *
 * Formål: etterprøvbarhet - hvilken modell/promptversjon/tekstgrunnlag ga
 * hvilken vurdering, for hver artikkel, over tid. IKKE en endring av selve
 * filtrerings-, AI- eller sendelogikken.
 *
 * Skriver ALDRI fulltekst, kun metadata. Rydder automatisk bort rader
 * eldre enn LOGG_DAGER ved hver kjøring.
 *
 * Kalles fra kjorMedieovervaking() i 07_Hovedkjoring.gs, RETT ETTER
 * leggTilSendteUrler() - altså kun når e-postutsendingen allerede er
 * fullført uten å kaste et unntak (se Steg A-funnet om at
 * sendEpostMedLogo()/sendEpost() ikke er pakket i try/catch - det er IKKE
 * endret her, og "Sendt"-kolonnen under reflekterer derfor i praksis
 * alltid "Ja": raden skrives rett og slett ikke i det hele tatt hvis
 * utsendingen feilet, nøyaktig samme begrensning som "Sendte artikler"
 * allerede har i dag). Hele kallet står i egen try/catch i
 * 07_Hovedkjoring.gs, slik at en feil her ALDRI kan ramme noe annet.
 */

// Fanenavn - opprettes automatisk (med overskrifter) forste gang den trengs,
// samme monster som "Kjøretidslogg" i 10_AIIntegrasjon.gs.
var FANE_ARTIKKELLOGG = 'Artikkellogg';

// Hvor mange dager med rader som beholdes i "Artikkellogg" - eldre rader
// slettes automatisk ved hver kjoring, se ryddGamleArtikkelloggRader().
var LOGG_DAGER = 90;

var ARTIKKELLOGG_OVERSKRIFTER = [
  'Tidspunkt', 'Normalisert URL', 'Kilde', 'Søkeord', 'Overskrift',
  'Modell-ID', 'Promptversjon', 'Tekstgrunnlag', 'KI-vurdering',
  'Nevner oss', 'Sendt', 'Utsendingsdato', 'Kort begrunnelse'
];

var ARTIKKELLOGG_KOLONNER = {
  TIDSPUNKT: 1,
  NORMALISERT_URL: 2,
  KILDE: 3,
  SOKEORD: 4,
  OVERSKRIFT: 5,
  MODELL_ID: 6,
  PROMPTVERSJON: 7,
  TEKSTGRUNNLAG: 8,
  KI_VURDERING: 9,
  NEVNER_OSS: 10,
  SENDT: 11,
  UTSENDINGSDATO: 12,
  KORT_BEGRUNNELSE: 13
};

/**
 * Bygger og skriver én batch med rader til "Artikkellogg" for alle nye
 * treff i denne kjøringen (én setValues()-kall, ikke rad for rad). Rydder
 * samtidig bort gamle rader (LOGG_DAGER).
 *
 * @param {Spreadsheet} ss
 * @param {Array<Object>} alleNyeTreff - samme liste som sendes til
 *   leggTilSendteUrler() i 05_Deduplisering.gs - allerede AI-vurdert (eller
 *   ikke, hvis AI var av/feilet/budsjett brukt opp - se bestemKiVurdering()).
 */
function loggArtikler(ss, alleNyeTreff) {
  if (!alleNyeTreff || alleNyeTreff.length === 0) return;

  opprettFaneHvisManglende(ss, FANE_ARTIKKELLOGG, ARTIKKELLOGG_OVERSKRIFTER);
  var ark = ss.getSheetByName(FANE_ARTIKKELLOGG);

  var aiModell = PropertiesService.getScriptProperties().getProperty('AI_MODEL') || '';
  var naa = new Date();

  var rader = alleNyeTreff.map(function (treff) {
    return byggArtikkelloggRad(treff, naa, aiModell);
  });

  ark.getRange(ark.getLastRow() + 1, 1, rader.length, ARTIKKELLOGG_OVERSKRIFTER.length).setValues(rader);
  Logger.log('Artikkellogg: skrev ' + rader.length + ' rad(er).');

  ryddGamleArtikkelloggRader(ark, naa);
}

/**
 * Bygger én rad (array, i samme rekkefølge som ARTIKKELLOGG_OVERSKRIFTER)
 * for ett treff.
 *
 * @param {Object} treff - treffobjekt fra kjorMedieovervaking(), evt.
 *   muterte av vurderTreffMedAI() (aiRelevant/aiKategori/aiNevnerOss/
 *   aiNotat/aiIrrelevantGrunn/aiParseFeilet - se 10_AIIntegrasjon.gs)
 * @param {Date} tidspunkt
 * @param {string} aiModell - AI_MODEL Script Property-verdien, evt. tom streng
 * @return {Array}
 */
function byggArtikkelloggRad(treff, tidspunkt, aiModell) {
  var kortBegrunnelse = treff.aiIrrelevantGrunn || treff.aiNotat || '';

  // treff.tekstgrunnlag finnes ikke ennå (Steg B) - satt av Steg E3 nar
  // TEKSTGRUNNLAG_MODUS tas i bruk. Standard er "ingress", som stemmer med
  // dagens faktiske oppførsel (se Steg A, punkt 1).
  var tekstgrunnlag = treff.tekstgrunnlag || 'ingress';

  return [
    tidspunkt,
    normaliserUrlForLogging(treff.lenke),
    treff.kilde || '',
    (treff.matchendeOrd || []).join(', '),
    treff.tittel || '',
    aiModell,
    PROMPT_VERSION,
    tekstgrunnlag,
    bestemKiVurdering(treff),
    treff.aiNevnerOss ? 'Ja' : 'Nei',
    'Ja', // se filoverskriften: raden skrives kun etter vellykket utsending
    tidspunkt,
    kortBegrunnelse
  ];
}

/**
 * Oversetter treffets interne AI-tilstand til én av de tre verdiene
 * "Relevant" / "Tvil" / "Ikke relevant" (pluss "Ikke vurdert" for treff AI
 * aldri ble kalt for) til bruk i Artikkellogg.
 *
 * "Tvil" settes KUN av koden her - ALDRI av modellens eget JSON-svar
 * (feltet "relevant" der er uansett bare true/false). I Steg B er
 * parse-feil (etter retry, se 09_AITest.gs/tolkAiKategoriseringsSvar())
 * den eneste kilden til "Tvil". Steg E3 legger til et validateSummary-avvik
 * som en ekstra kilde, uten å endre denne funksjonens kontrakt.
 *
 * @param {Object} treff
 * @return {string} "Relevant" | "Tvil" | "Ikke relevant" | "Ikke vurdert"
 */
function bestemKiVurdering(treff) {
  if (treff.aiParseFeilet) return 'Tvil';
  if (treff.aiRelevant === true) return 'Relevant';
  if (treff.aiRelevant === false) return 'Ikke relevant';
  return 'Ikke vurdert';
}

/**
 * Sletter rader i "Artikkellogg" eldre enn LOGG_DAGER. Radene skrives alltid
 * kronologisk (nyeste nederst, kun via setValues()-batcher i loggArtikler()),
 * sa gamle rader er garantert en SAMMENHENGENDE blokk helt ovenst (rett under
 * overskriftsraden) - vi kan derfor slette med ett enkelt deleteRows()-kall
 * i stedet for a slette rad for rad.
 *
 * @param {Sheet} ark
 * @param {Date} naa
 */
function ryddGamleArtikkelloggRader(ark, naa) {
  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) return;

  var grenseTidMs = naa.getTime() - LOGG_DAGER * 24 * 60 * 60 * 1000;
  var tidspunktVerdier = ark.getRange(2, ARTIKKELLOGG_KOLONNER.TIDSPUNKT, sisteRad - 1, 1).getValues();

  var antallGamle = 0;
  for (var i = 0; i < tidspunktVerdier.length; i++) {
    var rad = tidspunktVerdier[i][0];
    if (rad instanceof Date && rad.getTime() < grenseTidMs) {
      antallGamle++;
    } else {
      break; // forste ikke-gamle rad - resten er garantert nyere (kronologisk)
    }
  }

  if (antallGamle > 0) {
    ark.deleteRows(2, antallGamle);
    Logger.log('Artikkellogg: ryddet bort ' + antallGamle + ' rad(er) eldre enn ' + LOGG_DAGER + ' dager.');
  }
}

/**
 * Normaliserer en URL for logging i Artikkellogg: pakker ut Google-
 * omdirigeringslenker (f.eks. fra Google Alerts, formatet
 * "google.com/url?...&url=<ekte-url>&...") og fjerner utm- og kjente
 * sporingsparametre.
 *
 * BRUKES KUN TIL LOGGING - IKKE som dedupliseringsnøkkel. 05_Deduplisering.gs
 * er UENDRET og bruker fortsatt den rå URL-en direkte, se Steg A-funnene.
 *
 * Ren streng-/regex-basert (ingen URL/URLSearchParams - ikke garantert
 * tilgjengelig i Apps Scripts V8-kjøretid), slik at funksjonen kan testes
 * med vanlig Node og oppfører seg identisk i begge miljøer.
 *
 * @param {string} raUrl
 * @return {string}
 */
function normaliserUrlForLogging(raUrl) {
  if (!raUrl) return '';
  var url = String(raUrl).trim();

  // --- Steg 1: pakk ut Google-omdirigering ---
  // Resten av parametrene pa selve omdirigeringen (rct, sa, ct, cd, usg,
  // ved osv.) er Googles egne interne sporings-/signeringsparametre for
  // SELVE omdirigeringen, og forsvinner automatisk nar vi bare beholder
  // den indre URL-en.
  if (/^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?/i.test(url)) {
    var indreUrl = hentQueryParameter(url, 'url') || hentQueryParameter(url, 'q');
    if (indreUrl) {
      url = sikkerDecodeURIComponent(indreUrl);
    }
  }

  // --- Steg 2: fjern utm- og andre kjente sporingsparametre ---
  var SPORINGSPARAMETRE = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'fbclid', 'mc_cid', 'mc_eid'
  ];
  url = fjernQueryParametre(url, SPORINGSPARAMETRE);

  return url;
}

/**
 * Henter verdien av én query-parameter fra en URL, ukodet.
 *
 * @param {string} url
 * @param {string} navn
 * @return {string|null} rå (fortsatt kodet) verdi, eller null hvis parameteren ikke finnes
 */
function hentQueryParameter(url, navn) {
  var sporsmalstegnIndeks = url.indexOf('?');
  if (sporsmalstegnIndeks === -1) return null;

  var queryDel = url.substring(sporsmalstegnIndeks + 1).split('#')[0];
  var par = queryDel.split('&');
  for (var i = 0; i < par.length; i++) {
    var likhetstegnIndeks = par[i].indexOf('=');
    if (likhetstegnIndeks === -1) continue;
    if (par[i].substring(0, likhetstegnIndeks) === navn) {
      return par[i].substring(likhetstegnIndeks + 1);
    }
  }
  return null;
}

/**
 * Fjerner gitte query-parametre fra en URL, uansett hvor i parameterlisten
 * de star. Beholder et eventuelt #fragment uendret.
 *
 * @param {string} url
 * @param {Array<string>} navnListe
 * @return {string}
 */
function fjernQueryParametre(url, navnListe) {
  var sporsmalstegnIndeks = url.indexOf('?');
  if (sporsmalstegnIndeks === -1) return url;

  var base = url.substring(0, sporsmalstegnIndeks);
  var resten = url.substring(sporsmalstegnIndeks + 1);
  var fragment = '';
  var fragmentIndeks = resten.indexOf('#');
  if (fragmentIndeks !== -1) {
    fragment = resten.substring(fragmentIndeks);
    resten = resten.substring(0, fragmentIndeks);
  }

  var par = resten.split('&').filter(function (p) {
    if (!p) return false;
    var likhetstegnIndeks = p.indexOf('=');
    var navn = likhetstegnIndeks === -1 ? p : p.substring(0, likhetstegnIndeks);
    return navnListe.indexOf(navn) === -1;
  });

  return base + (par.length > 0 ? '?' + par.join('&') : '') + fragment;
}

/**
 * Trygg decodeURIComponent() som returnerer raverdien uendret i stedet for
 * a kaste et unntak ved ugyldig prosent-enkoding.
 *
 * @param {string} verdi
 * @return {string}
 */
function sikkerDecodeURIComponent(verdi) {
  try {
    return decodeURIComponent(verdi);
  } catch (e) {
    return verdi;
  }
}
