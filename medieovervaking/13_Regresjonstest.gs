/**
 * 13_Regresjonstest.gs
 *
 * Steg D: regresjonstest av KI-vurderingen mot et fast referansesett, helt
 * uavhengig av den daglige kjøringen. Gjenbruker de SAMME byggeklossene som
 * produksjonen (10_AIIntegrasjon.gs) og AI-testen (09_AITest.gs) - ingen
 * omskriving av noe av det var nødvendig:
 *   - gjorOgTolkEttKlaudeKall() (09_AITest.gs) - samme HTTP-kall, samme
 *     AI_SYSTEM_PROMPT, samme robuste JSON-tolking, samme
 *     utgiftstak-sjekk som produksjonen.
 *   - bestemKiVurdering() (12_Artikkellogg.gs) - samme
 *     Relevant/Ikke relevant/Tvil/Ikke vurdert-oversettelse som
 *     Artikkellogg.
 *
 * "Samme filterfunksjon som produksjonen" (søkeordmatching, se
 * 04_Filtrering.gs) er IKKE kjørt her - Referansesettet tester bevisst
 * AI-VURDERINGEN isolert fra søkeordlisten, som endrer seg over tid og
 * ville gjort regresjonstesten ureproduserbar. Si fra om dette ikke var
 * meningen.
 *
 * runRegression() sender ALDRI e-post, skriver ALDRI til "Sendte
 * artikler" eller "Artikkellogg", og lagrer ALDRI modellvalg i Script
 * Properties. Respekterer AI_ENABLED og kostnadsstoppen. Kan trygt
 * avbrytes og kjøres på nytt med samme kjoringId (gjenopptak - hopper
 * over rader som allerede er skrevet for den kjoringId-en).
 */

var FANE_REFERANSESETT = 'Referansesett';
var FANE_KJORINGSRESULTAT = 'Kjøringsresultat';

// Maks antall rader behandlet PER KALL til runRegression() - uavhengig av
// tidsbudsjettet under. Kjor funksjonen pa nytt med samme kjoringId for a
// fortsette med resten (gjenopptak).
var REGRESJON_MAKS_RADER = 50;

// Tidsbudsjett for ETT kall til runRegression() - samme prinsipp som
// AI_TIDSBUDSJETT_MS i 10_AIIntegrasjon.gs, men eget og lavere enn Apps
// Scripts 6-minuttersgrense slik at vi rekker a skrive det vi har nar
// budsjettet er brukt opp.
var REGRESJON_TIDSBUDSJETT_MS = 4.5 * 60 * 1000;

var KJORINGSRESULTAT_OVERSKRIFTER = ['Kjøring-ID', 'Artikkel-ID', 'KI-vurdering', 'Tekstgrunnlag', 'Kostnad USD'];

// Markor i Artikkel-ID-kolonnen for oppsummeringsraden (se
// skrivOppsummeringHvisKlar()) - skilles slik fra ekte artikkel-ID-er.
var KJORINGSRESULTAT_OPPSUMMERING_MARKOR = 'OPPSUMMERING';

/**
 * Kjorer regresjonstesten. Kall manuelt fra Apps Script-editoren.
 *
 * @param {string} kjoringId - PAKREVD. Identifiserer denne kjoringen - bruk
 *   samme verdi igjen for a fortsette en avbrutt kjoring (gjenopptak).
 *   F.eks. "2026-11-17-test1".
 * @param {string} [modellId] - valgfri. Overstyrer AI_MODEL Script Property
 *   KUN for denne kjoringen - lagres ALDRI til Script Properties.
 */
function runRegression(kjoringId, modellId) {
  Logger.log('=== runRegression(' + kjoringId + (modellId ? ', ' + modellId : '') + ') ===');

  if (!kjoringId) {
    Logger.log('FEIL: kjoringId er pakrevd (forste parameter) - trengs for gjenopptak. Avbryter.');
    return;
  }

  var aiEnabled = PropertiesService.getScriptProperties().getProperty('AI_ENABLED');
  if (aiEnabled !== 'true') {
    Logger.log('AI_ENABLED er ikke "true" - runRegression() respekterer samme bryter som den daglige ' +
      'kjoringen og avbryter. (Merk: dette er strengere enn runAiTest() i 09_AITest.gs, som ikke sjekker ' +
      'AI_ENABLED - det er et bevisst valg for Steg D, se oppgaveteksten.)');
    return;
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    Logger.log('FEIL: Script Property "ANTHROPIC_API_KEY" er ikke satt. Avbryter.');
    return;
  }

  var aiModell = modellId || PropertiesService.getScriptProperties().getProperty('AI_MODEL');
  if (!aiModell) {
    Logger.log('FEIL: ingen modell a bruke - verken modellId-parameteren eller Script Property "AI_MODEL" er satt. Avbryter.');
    return;
  }
  if (!AI_PRISER[aiModell]) {
    Logger.log('ADVARSEL: Ukjent modell "' + aiModell + '" i AI_PRISER-tabellen (09_AITest.gs) - ' +
      'kostnadsestimat og faktisk kostnad vil bli logget som 0/ukjent.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var referanseArk = ss.getSheetByName(FANE_REFERANSESETT);
  if (!referanseArk) {
    Logger.log('FEIL: fant ingen fane som heter "' + FANE_REFERANSESETT + '". Forventede kolonner: ' +
      'Artikkel-ID | Overskrift | Ingress | Forventet (valgfri). Avbryter.');
    return;
  }

  var sisteRad = referanseArk.getLastRow();
  if (sisteRad < 2) {
    Logger.log('Ingen datarader i "' + FANE_REFERANSESETT + '" (kun overskriftsrad). Avbryter.');
    return;
  }

  var alleReferanseRader = referanseArk.getRange(2, 1, sisteRad - 1, 4).getValues(); // Artikkel-ID, Overskrift, Ingress, Forventet

  // --- Gjenopptak: hopp over rader allerede skrevet for denne kjoringId-en ---
  var alleredeBehandlet = hentAlleredeBehandledeArtikkelIder(ss, kjoringId);
  var gjenstaende = alleReferanseRader.filter(function (rad) {
    var artikkelId = String(rad[0] || '').trim();
    return artikkelId && !alleredeBehandlet[artikkelId];
  });

  if (gjenstaende.length === 0) {
    Logger.log('Alle ' + alleReferanseRader.length + ' rad(er) i "' + FANE_REFERANSESETT +
      '" er allerede behandlet for kjoringId "' + kjoringId + '".');
    skrivOppsummeringHvisKlar(ss, kjoringId, alleReferanseRader);
    return;
  }

  var antallABehandleNaa = Math.min(gjenstaende.length, REGRESJON_MAKS_RADER);
  var radForDenneKjoringen = gjenstaende.slice(0, antallABehandleNaa);

  Logger.log(gjenstaende.length + ' rad(er) gjenstar totalt for kjoringId "' + kjoringId + '" (' +
    Object.keys(alleredeBehandlet).length + ' allerede behandlet). Behandler ' +
    radForDenneKjoringen.length + ' av dem na (REGRESJON_MAKS_RADER = ' + REGRESJON_MAKS_RADER + ').');

  // --- Kostnadsestimat FOR kjoring starter (grovt anslag, ikke eksakt) ---
  var kostnadsestimat = estimerRegresjonsKostnad(radForDenneKjoringen, aiModell);
  Logger.log('KOSTNADSESTIMAT for disse ' + radForDenneKjoringen.length + ' radene med modell "' + aiModell +
    '": ca $' + kostnadsestimat.toFixed(4) + ' (grovt anslag basert pa tegnlengde, IKKE eksakt - faktisk ' +
    'kostnad beregnes som vanlig fra ekte token-tall i svaret og skrives per rad).');

  opprettFaneHvisManglende(ss, FANE_KJORINGSRESULTAT, KJORINGSRESULTAT_OVERSKRIFTER);
  var resultArk = ss.getSheetByName(FANE_KJORINGSRESULTAT);

  var nyeRader = [];
  var startTid = new Date().getTime();
  var stoppet = false;

  for (var i = 0; i < radForDenneKjoringen.length; i++) {
    var bruktMs = new Date().getTime() - startTid;
    if (bruktMs > REGRESJON_TIDSBUDSJETT_MS) {
      Logger.log('Tidsbudsjett (' + (REGRESJON_TIDSBUDSJETT_MS / 60000) + ' min) brukt opp etter ' +
        nyeRader.length + ' av ' + radForDenneKjoringen.length + ' rad(er). Kjor runRegression("' + kjoringId +
        '") pa nytt for a fortsette - allerede skrevne rader hoppes automatisk over.');
      stoppet = true;
      break;
    }

    var rad = radForDenneKjoringen[i];
    var artikkelId = String(rad[0] || '').trim();
    var overskrift = String(rad[1] || '').trim();
    var ingress = String(rad[2] || '').trim();

    var kildeTekstForNevnerOss = overskrift + ' ' + ingress;
    var brukerTekst = 'Overskrift: ' + overskrift + '\nIngress: ' + ingress;

    var forsok = gjorOgTolkEttKlaudeKall(apiKey, aiModell, brukerTekst, kildeTekstForNevnerOss);
    var retryForsok = null;
    if (forsok.type === 'ok' && forsok.tolket.parseFeilet) {
      retryForsok = gjorOgTolkEttKlaudeKall(apiKey, aiModell, brukerTekst, kildeTekstForNevnerOss);
    }

    var resultat = utledRegresjonsresultat(forsok, retryForsok);

    if (resultat.stoppMelding) {
      Logger.log('STOPPER runRegression() (ingen flere forsok): ' + resultat.stoppMelding);
      stoppet = true;
      break;
    }

    if (forsok.type !== 'ok') {
      Logger.log('  Feil for artikkel "' + artikkelId + '" (' + forsok.type + '): ' + (forsok.feilmelding || '(ingen feilmelding)'));
    }

    nyeRader.push([kjoringId, artikkelId, resultat.kiVurdering, 'ingress', resultat.kostnad]);
  }

  if (nyeRader.length > 0) {
    resultArk.getRange(resultArk.getLastRow() + 1, 1, nyeRader.length, KJORINGSRESULTAT_OVERSKRIFTER.length).setValues(nyeRader);
  }

  Logger.log('runRegression(' + kjoringId + '): skrev ' + nyeRader.length + ' rad(er) denne kjoringen.');

  if (stoppet) {
    Logger.log('IKKE FERDIG - kjor runRegression("' + kjoringId + '"' + (modellId ? ', "' + modellId + '"' : '') +
      ') pa nytt for a fortsette.');
    return;
  }

  var fortsattUbehandlet = gjenstaende.length - nyeRader.length;
  if (fortsattUbehandlet > 0) {
    Logger.log(fortsattUbehandlet + ' rad(er) star fortsatt igjen (over REGRESJON_MAKS_RADER denne kjoringen). ' +
      'Kjor runRegression("' + kjoringId + '"' + (modellId ? ', "' + modellId + '"' : '') + ') pa nytt for a fortsette.');
    return;
  }

  skrivOppsummeringHvisKlar(ss, kjoringId, alleReferanseRader);
}

/**
 * Avgjor KI-vurdering og (ev. samlet) kostnad for ETT referanseforsok, gitt
 * resultatet av (ett eller to) kall til gjorOgTolkEttKlaudeKall(). Ren
 * funksjon - ingen Apps Script-API-kall - testbar med Node.
 *
 * @param {Object} forsok - resultat av forste gjorOgTolkEttKlaudeKall()-kall
 * @param {Object|null} retryForsok - resultat av et ev. retry-kall (kun gjort
 *   hvis forsok.tolket.parseFeilet var true), eller null hvis ikke forsokt
 * @return {{kiVurdering: string, kostnad: (number|string), stoppMelding: (string|undefined)}}
 */
function utledRegresjonsresultat(forsok, retryForsok) {
  if (forsok.type === 'utgiftstak') {
    return { kiVurdering: '', kostnad: '', stoppMelding: forsok.stoppMelding };
  }
  if (forsok.type !== 'ok') {
    return { kiVurdering: 'Ikke vurdert', kostnad: '' };
  }

  var tolket = forsok.tolket;
  var kostnad = forsok.kostnad;

  if (tolket.parseFeilet && retryForsok) {
    if (retryForsok.type === 'utgiftstak') {
      return { kiVurdering: '', kostnad: kostnad, stoppMelding: retryForsok.stoppMelding };
    }
    if (retryForsok.type === 'ok') {
      tolket = retryForsok.tolket;
      kostnad = leggSammen(kostnad, retryForsok.kostnad);
    }
    // nettverksfeil/http-feil pa selve retrien: behold forste forsoks tolket (fortsatt parseFeilet)
  }

  return {
    kiVurdering: bestemKiVurdering({ aiRelevant: tolket.relevant, aiParseFeilet: tolket.parseFeilet }),
    kostnad: kostnad
  };
}

/**
 * Grovt kostnadsestimat FOR kjoring starter, basert pa tegnlengden til
 * system-prompten + overskrift/ingress (ikke faktiske token-tall - de
 * finnes forst etter et ekte API-kall). Ca. 4 tegn per token er en vanlig
 * tommelfingerregel for engelsk/norsk tekst. Output-lengde anslas fast,
 * siden svaret er strukturert JSON med forholdsvis stabil lengde.
 *
 * Ren funksjon - testbar med Node (krever kun AI_PRISER og AI_SYSTEM_PROMPT
 * fra 09_AITest.gs, samme fil-scope i Apps Script).
 *
 * @param {Array<Array>} rader - [[Artikkel-ID, Overskrift, Ingress, Forventet], ...]
 * @param {string} aiModell
 * @return {number} anslatt kostnad i USD, 0 hvis modellen er ukjent
 */
function estimerRegresjonsKostnad(rader, aiModell) {
  var priser = AI_PRISER[aiModell];
  if (!priser) return 0;

  var ANSLAG_TOKENS_UT_PER_KALL = 220;
  var ANSLAG_TEGN_PER_TOKEN = 4;
  var RAMME_TEGN = 40; // "Overskrift: \nIngress: "-rammeteksten rundt hver artikkel

  var systemPromptTegn = AI_SYSTEM_PROMPT.length;
  var totalKostnad = 0;

  for (var i = 0; i < rader.length; i++) {
    var overskrift = String(rader[i][1] || '');
    var ingress = String(rader[i][2] || '');
    var inputTegn = systemPromptTegn + overskrift.length + ingress.length + RAMME_TEGN;
    var anslagTokensInn = Math.ceil(inputTegn / ANSLAG_TEGN_PER_TOKEN);

    totalKostnad += (anslagTokensInn / 1000000) * priser.inn + (ANSLAG_TOKENS_UT_PER_KALL / 1000000) * priser.ut;
  }

  return totalKostnad;
}

/**
 * Leser "Kjøringsresultat" og returnerer hvilke Artikkel-ID-er som allerede
 * har en rad for den gitte kjoringId-en (brukes til gjenopptak - disse
 * hoppes over). Ekskluderer oppsummeringsraden (KJORINGSRESULTAT_OPPSUMMERING_MARKOR).
 *
 * @param {Spreadsheet} ss
 * @param {string} kjoringId
 * @return {Object} {artikkelId: true, ...}
 */
function hentAlleredeBehandledeArtikkelIder(ss, kjoringId) {
  var ark = ss.getSheetByName(FANE_KJORINGSRESULTAT);
  var behandlet = {};
  if (!ark) return behandlet;

  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) return behandlet;

  var data = ark.getRange(2, 1, sisteRad - 1, 2).getValues(); // Kjoring-ID, Artikkel-ID
  for (var i = 0; i < data.length; i++) {
    var radKjoringId = String(data[i][0]);
    var artikkelId = String(data[i][1]);
    if (radKjoringId === String(kjoringId) && artikkelId !== KJORINGSRESULTAT_OPPSUMMERING_MARKOR) {
      behandlet[artikkelId] = true;
    }
  }
  return behandlet;
}

/**
 * Skriver oppsummeringsraden for en kjoringId HVIS: (a) alle rader i
 * Referansesettet na har et resultat for denne kjoringId-en, (b) minst en
 * av dem hadde en "Forventet"-verdi, og (c) oppsummeringsraden ikke
 * allerede er skrevet (unngar duplikat ved gjentatte kall etter at
 * kjoringen er ferdig). Teller "like"/"ulike" KUN for rader som faktisk
 * hadde en Forventet-verdi.
 *
 * @param {Spreadsheet} ss
 * @param {string} kjoringId
 * @param {Array<Array>} alleReferanseRader - fra "Referansesett"
 */
function skrivOppsummeringHvisKlar(ss, kjoringId, alleReferanseRader) {
  var ark = ss.getSheetByName(FANE_KJORINGSRESULTAT);
  if (!ark) return;

  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) return;

  var data = ark.getRange(2, 1, sisteRad - 1, KJORINGSRESULTAT_OVERSKRIFTER.length).getValues();
  var radForDenneKjoringen = data.filter(function (r) { return String(r[0]) === String(kjoringId); });

  var harAlleredeOppsummering = radForDenneKjoringen.some(function (r) {
    return String(r[1]) === KJORINGSRESULTAT_OPPSUMMERING_MARKOR;
  });
  if (harAlleredeOppsummering) return;

  var forventetPerArtikkel = {};
  for (var i = 0; i < alleReferanseRader.length; i++) {
    var artikkelId = String(alleReferanseRader[i][0] || '').trim();
    var forventet = String(alleReferanseRader[i][3] || '').trim();
    if (artikkelId && forventet) forventetPerArtikkel[artikkelId] = forventet;
  }

  if (Object.keys(forventetPerArtikkel).length === 0) {
    Logger.log('runRegression(' + kjoringId + '): FERDIG. Ingen "Forventet"-verdier i referansesettet - ' +
      'skriver ingen oppsummeringsrad.');
    return;
  }

  var antallLike = 0;
  var antallUlike = 0;
  var totalKostnad = 0;

  for (var j = 0; j < radForDenneKjoringen.length; j++) {
    var rad = radForDenneKjoringen[j];
    var artikkelId2 = String(rad[1]);
    var kiVurdering = rad[2];
    var kostnad = rad[4];

    if (typeof kostnad === 'number') totalKostnad += kostnad;

    var forventetVerdi = forventetPerArtikkel[artikkelId2];
    if (!forventetVerdi) continue; // denne artikkelen hadde ingen Forventet - telles ikke i like/ulike
    if (kiVurdering === forventetVerdi) {
      antallLike++;
    } else {
      antallUlike++;
    }
  }

  ark.appendRow([
    kjoringId,
    KJORINGSRESULTAT_OPPSUMMERING_MARKOR,
    antallLike + ' like, ' + antallUlike + ' ulike (av ' + (antallLike + antallUlike) + ' med Forventet)',
    '',
    Math.round(totalKostnad * 1000000) / 1000000
  ]);

  Logger.log('runRegression(' + kjoringId + '): FERDIG. ' + antallLike + ' like, ' + antallUlike +
    ' ulike vurderinger (av ' + (antallLike + antallUlike) + ' rader med Forventet). Total kostnad: $' +
    totalKostnad.toFixed(4) + '.');
}
