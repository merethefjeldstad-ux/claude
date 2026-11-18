/**
 * 15_TekstgrunnlagTest.gs
 *
 * Steg E2: sammenligningstest av tre tekstgrunnlag-varianter (A "ingress",
 * B "hel side", C "ingress + søkeordkontekst") mot samme prompt og modell
 * som produksjonen. Bruker funksjonene fra 14_Tekstgrunnlag.gs
 * (extractMainContent, extractKeywordContext, validateSummary,
 * byggBrukerTekstMedUtvidetTekstgrunnlag, KILDER_MED_HELSIDE,
 * TEKSTGRUNNLAG_USER_AGENT, hentDomeneFraUrl, erDomeneIListe - delt med
 * 10_AIIntegrasjon.gs/Steg E3) - fortsatt INGEN endring i den daglige
 * kjøringen fra DENNE filen. runTekstgrunnlagTest() sender ALDRI e-post,
 * skriver ALDRI til "Sendte artikler" eller "Artikkellogg".
 */

// Fanenavn
var FANE_REFERANSESETT_HELSIDE = 'Referansesett hel side';
var FANE_TEKSTGRUNNLAG_TEST = 'Tekstgrunnlag-test';

// Maks antall ARTIKLER (ikke varianter - hver artikkel kan gi opptil 3
// AI-kall) behandlet per kall til runTekstgrunnlagTest(). "maks"-
// parameteren kan senke dette, aldri heve det over denne konstanten.
var TEKSTGRUNNLAG_TEST_MAKS_ARTIKLER = 15;

// Tidsbudsjett for ETT kall til runTekstgrunnlagTest() - samme prinsipp
// som i 13_Regresjonstest.gs.
var TEKSTGRUNNLAG_TEST_TIDSBUDSJETT_MS = 4.5 * 60 * 1000;

// Gruppestørrelse for bade sidehenting (UrlFetchApp.fetchAll for variant
// B/C-kildene) og selve AI-kallene.
var TEKSTGRUNNLAG_TEST_SIDEHENTING_BATCH = 5;
var TEKSTGRUNNLAG_TEST_AI_BATCH = 5;

var TEKSTGRUNNLAG_TEST_OVERSKRIFTER = [
  'Kjøring-ID', 'Artikkel-ID', 'Variant', 'Vurdering', 'Kategori', 'Nevner oss',
  'Notat', 'Valideringsresultat', 'Tekstlengde', 'Tokens inn', 'Tokens ut', 'Kostnad USD', 'Riktig?'
];

/**
 * Kjorer sammenligningstesten. Kall manuelt fra Apps Script-editoren.
 *
 * Leser "Referansesett hel side" (Artikkel-ID, Kilde, URL, Overskrift,
 * Ingress). Alle rader får variant A ("ingress" - identisk format med det
 * produksjonen faktisk sender i dag). Rader der URL-domenet star i
 * KILDER_MED_HELSIDE far i tillegg B ("hel side", via extractMainContent())
 * og C ("ingress + søkeordkontekst", via extractKeywordContext() mot det
 * forste sokeordet som matcher overskrift+ingress i "Søkeord"-fanen).
 *
 * @param {string} kjoringId - PAKREVD, for gjenopptak (samme prinsipp som runRegression()).
 * @param {number} [maks] - valgfritt tak under TEKSTGRUNNLAG_TEST_MAKS_ARTIKLER.
 */
function runTekstgrunnlagTest(kjoringId, maks) {
  Logger.log('=== runTekstgrunnlagTest(' + kjoringId + (maks ? ', ' + maks : '') + ') ===');

  if (!kjoringId) {
    Logger.log('FEIL: kjoringId er pakrevd (forste parameter) - trengs for gjenopptak. Avbryter.');
    return;
  }

  var aiEnabled = PropertiesService.getScriptProperties().getProperty('AI_ENABLED');
  if (aiEnabled !== 'true') {
    Logger.log('AI_ENABLED er ikke "true" - avbryter (samme bryter som produksjonen/runRegression()).');
    return;
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    Logger.log('FEIL: Script Property "ANTHROPIC_API_KEY" er ikke satt. Avbryter.');
    return;
  }

  var aiModell = PropertiesService.getScriptProperties().getProperty('AI_MODEL');
  if (!aiModell) {
    Logger.log('FEIL: Script Property "AI_MODEL" er ikke satt. Avbryter.');
    return;
  }
  if (!AI_PRISER[aiModell]) {
    Logger.log('ADVARSEL: Ukjent modell "' + aiModell + '" i AI_PRISER - kostnad logges som 0/ukjent.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var referanseArk = ss.getSheetByName(FANE_REFERANSESETT_HELSIDE);
  if (!referanseArk) {
    Logger.log('FEIL: fant ingen fane som heter "' + FANE_REFERANSESETT_HELSIDE + '". Forventede kolonner: ' +
      'Artikkel-ID | Kilde | URL | Overskrift | Ingress. Avbryter.');
    return;
  }

  var sisteRad = referanseArk.getLastRow();
  if (sisteRad < 2) {
    Logger.log('Ingen datarader i "' + FANE_REFERANSESETT_HELSIDE + '". Avbryter.');
    return;
  }

  var alleRader = referanseArk.getRange(2, 1, sisteRad - 1, 5).getValues(); // Artikkel-ID, Kilde, URL, Overskrift, Ingress

  if (KILDER_MED_HELSIDE.length === 0) {
    Logger.log('MERK: KILDER_MED_HELSIDE er tom - ALLE rader far kun variant A (ingress) denne kjøringen. ' +
      'Fyll inn domener i konstanten (15_TekstgrunnlagTest.gs) etter å ha sjekket kildenes vilkår.');
  }

  var sokeordListe = hentSokeord(ss);

  var alleredeBehandlet = hentAlleredeBehandledeVarianter(ss, kjoringId);

  var antallMaksArtikler = Math.min(maks || TEKSTGRUNNLAG_TEST_MAKS_ARTIKLER, TEKSTGRUNNLAG_TEST_MAKS_ARTIKLER);

  var gjenstaendeRader = [];
  for (var i = 0; i < alleRader.length; i++) {
    var artikkelId = String(alleRader[i][0] || '').trim();
    if (!artikkelId) continue;

    var erHelSideKilde = erDomeneIListe(alleRader[i][2], KILDER_MED_HELSIDE);
    var trengerA = !alleredeBehandlet[artikkelId + '|A'];
    var trengerB = erHelSideKilde && !alleredeBehandlet[artikkelId + '|B'];
    var trengerC = erHelSideKilde && !alleredeBehandlet[artikkelId + '|C'];

    if (trengerA || trengerB || trengerC) {
      gjenstaendeRader.push({
        rad: alleRader[i], artikkelId: artikkelId,
        trengerA: trengerA, trengerB: trengerB, trengerC: trengerC
      });
    }
  }

  if (gjenstaendeRader.length === 0) {
    Logger.log('Alle rader/varianter i "' + FANE_REFERANSESETT_HELSIDE + '" er allerede behandlet for kjoringId "' + kjoringId + '".');
    return;
  }

  var raderDenneKjoringen = gjenstaendeRader.slice(0, antallMaksArtikler);
  Logger.log(gjenstaendeRader.length + ' artikkel(er) (med minst én manglende variant) gjenstar totalt. ' +
    'Behandler ' + raderDenneKjoringen.length + ' av dem na (maks ' + antallMaksArtikler + ' artikler).');

  // --- Kostnadsestimat FOR noe kjores (grovt anslag, ikke eksakt) ---
  var radTabellForEstimat = raderDenneKjoringen.map(function (r) { return r.rad; });
  var kostnadsestimat = estimerTekstgrunnlagTestKostnad(radTabellForEstimat, KILDER_MED_HELSIDE, aiModell);
  Logger.log('KOSTNADSESTIMAT for ' + raderDenneKjoringen.length + ' artikkel(er) (opptil 3 varianter hver) med modell "' +
    aiModell + '": ca $' + kostnadsestimat.toFixed(4) + ' (grovt anslag basert pa tegnlengde - variant B anslas i ' +
    'verste fall, da faktisk sidelengde er ukjent for henting).');

  var startTid = new Date().getTime();

  // --- FASE 1: hent hel-side for rader som trenger B/C, i grupper ---
  var sideInnhold = {}; // artikkelId -> {hovedinnhold, feilmelding}
  var trengerSideHenting = raderDenneKjoringen.filter(function (r) { return r.trengerB || r.trengerC; });

  for (var sStart = 0; sStart < trengerSideHenting.length; sStart += TEKSTGRUNNLAG_TEST_SIDEHENTING_BATCH) {
    if (new Date().getTime() - startTid > TEKSTGRUNNLAG_TEST_TIDSBUDSJETT_MS) {
      Logger.log('Tidsbudsjett brukt opp under sidehenting - stopper her. Kjor runTekstgrunnlagTest("' +
        kjoringId + '") pa nytt for a fortsette.');
      break;
    }

    var sideBatch = trengerSideHenting.slice(sStart, sStart + TEKSTGRUNNLAG_TEST_SIDEHENTING_BATCH);
    var sideForesporsler = sideBatch.map(function (r) {
      return {
        url: r.rad[2],
        method: 'get',
        headers: { 'User-Agent': TEKSTGRUNNLAG_USER_AGENT },
        muteHttpExceptions: true,
        followRedirects: true
      };
    });

    var sideResponser;
    try {
      sideResponser = UrlFetchApp.fetchAll(sideForesporsler);
    } catch (e) {
      Logger.log('Nettverksfeil ved sidehenting (batch pa ' + sideBatch.length + '): ' + e.message);
      sideBatch.forEach(function (r) {
        sideInnhold[r.artikkelId] = { hovedinnhold: '', feilmelding: 'Nettverksfeil: ' + e.message };
      });
      continue;
    }

    for (var b = 0; b < sideBatch.length; b++) {
      var httpKode = sideResponser[b].getResponseCode();
      if (httpKode < 200 || httpKode >= 300) {
        sideInnhold[sideBatch[b].artikkelId] = { hovedinnhold: '', feilmelding: 'HTTP-feil ' + httpKode + ' ved sidehenting' };
        continue;
      }
      var html = sideResponser[b].getContentText();
      var hovedinnhold = extractMainContent(html);
      sideInnhold[sideBatch[b].artikkelId] = {
        hovedinnhold: hovedinnhold,
        feilmelding: hovedinnhold ? '' : 'extractMainContent() ga tomt (ukjent struktur eller betalingsmur)'
      };
    }
  }

  // --- FASE 2: bygg AI-oppgaver (variant A/B/C) for de som trengs og er klare ---
  var oppgaver = [];

  for (var r = 0; r < raderDenneKjoringen.length; r++) {
    var post = raderDenneKjoringen[r];
    var kilde = String(post.rad[1] || '');
    var overskrift = String(post.rad[3] || '');
    var ingress = String(post.rad[4] || '');
    var kildeTekstForNevnerOss = overskrift + ' ' + ingress;

    if (post.trengerA) {
      var brukerTekstA = 'Overskrift: ' + overskrift + '\nIngress: ' + ingress + (kilde ? '\nKilde: ' + kilde : '');
      oppgaver.push({
        artikkelId: post.artikkelId, variant: 'A', brukerTekst: brukerTekstA,
        tekstgrunnlagBrukt: ingress, kildeTekstForNevnerOss: kildeTekstForNevnerOss
      });
    }

    if (post.trengerB || post.trengerC) {
      var side = sideInnhold[post.artikkelId];
      if (!side || !side.hovedinnhold) {
        Logger.log('  "' + post.artikkelId + '": ingen hel-side-tekst tilgjengelig (' +
          (side ? side.feilmelding : 'ikke forsokt hentet - tidsbudsjett') + ') - hopper over variant B/C.');
      } else {
        if (post.trengerB) {
          var brukerTekstB = byggBrukerTekstMedUtvidetTekstgrunnlag(overskrift, kilde, side.hovedinnhold);
          oppgaver.push({
            artikkelId: post.artikkelId, variant: 'B', brukerTekst: brukerTekstB,
            tekstgrunnlagBrukt: side.hovedinnhold, kildeTekstForNevnerOss: kildeTekstForNevnerOss
          });
        }
        if (post.trengerC) {
          var matchendeOrd = finnMatchendeSokeord(kildeTekstForNevnerOss, sokeordListe);
          if (matchendeOrd.length === 0) {
            Logger.log('  "' + post.artikkelId + '": ingen søkeord i "Søkeord"-fanen matcher overskrift+ingress - hopper over variant C.');
          } else {
            var kontekstUtdrag = extractKeywordContext(side.hovedinnhold, matchendeOrd[0], 3, 200);
            var tekstgrunnlagC = ingress + (kontekstUtdrag.length > 0 ? '\n\n' + kontekstUtdrag.join('\n\n(...)\n\n') : '');
            var brukerTekstC = byggBrukerTekstMedUtvidetTekstgrunnlag(overskrift, kilde, tekstgrunnlagC);
            oppgaver.push({
              artikkelId: post.artikkelId, variant: 'C', brukerTekst: brukerTekstC,
              tekstgrunnlagBrukt: tekstgrunnlagC, kildeTekstForNevnerOss: kildeTekstForNevnerOss
            });
          }
        }
      }
    }
  }

  Logger.log(oppgaver.length + ' AI-kall planlagt denne kjoringen (variant A/B/C til sammen).');

  // --- FASE 3: send AI-kallene i grupper, respekter tidsbudsjett og utgiftstak ---
  opprettFaneHvisManglende(ss, FANE_TEKSTGRUNNLAG_TEST, TEKSTGRUNNLAG_TEST_OVERSKRIFTER);
  var resultArk = ss.getSheetByName(FANE_TEKSTGRUNNLAG_TEST);

  var nyeRader = [];
  var stoppet = false;

  for (var oStart = 0; oStart < oppgaver.length; oStart += TEKSTGRUNNLAG_TEST_AI_BATCH) {
    if (new Date().getTime() - startTid > TEKSTGRUNNLAG_TEST_TIDSBUDSJETT_MS) {
      Logger.log('Tidsbudsjett brukt opp under AI-kall - stopper her. Kjor runTekstgrunnlagTest("' +
        kjoringId + '") pa nytt for a fortsette.');
      stoppet = true;
      break;
    }

    var aiBatch = oppgaver.slice(oStart, oStart + TEKSTGRUNNLAG_TEST_AI_BATCH);
    var aiForesporsler = aiBatch.map(function (opp) {
      return byggTekstgrunnlagTestForesporsel(opp.brukerTekst, apiKey, aiModell);
    });

    var aiResponser;
    try {
      aiResponser = UrlFetchApp.fetchAll(aiForesporsler);
    } catch (e) {
      Logger.log('Nettverksfeil ved AI-kall (batch pa ' + aiBatch.length + '): ' + e.message);
      continue;
    }

    var utgiftstakNadd = false;
    for (var k = 0; k < aiBatch.length; k++) {
      var httpKode2 = aiResponser[k].getResponseCode();
      var raTekst2 = aiResponser[k].getContentText();
      var svarJson2 = parseJsonTrygt(raTekst2);

      var utgiftstakMelding = sjekkForUtgiftstakStopp(httpKode2, svarJson2);
      if (utgiftstakMelding) {
        Logger.log('STOPPER runTekstgrunnlagTest() (ingen flere forsok): ' + utgiftstakMelding);
        utgiftstakNadd = true;
        stoppet = true;
        break;
      }

      if (httpKode2 < 200 || httpKode2 >= 300) {
        Logger.log('  HTTP-feil ' + httpKode2 + ' for "' + aiBatch[k].artikkelId + '" variant ' + aiBatch[k].variant);
        continue;
      }

      var tokensInn2 = (svarJson2 && svarJson2.usage) ? svarJson2.usage.input_tokens : '';
      var tokensUt2 = (svarJson2 && svarJson2.usage) ? svarJson2.usage.output_tokens : '';
      var kostnad2 = beregnKostnad(aiModell, tokensInn2, tokensUt2);

      var tekstBlokk2 = hentForsteTekstBlokk(svarJson2);
      var tolket2 = tolkAiKategoriseringsSvar(tekstBlokk2, aiBatch[k].kildeTekstForNevnerOss);

      nyeRader.push(byggTekstgrunnlagTestRad(kjoringId, aiBatch[k].artikkelId, aiBatch[k].variant, tolket2,
        aiBatch[k].tekstgrunnlagBrukt, tokensInn2, tokensUt2, kostnad2));
    }

    if (utgiftstakNadd) break;
  }

  if (nyeRader.length > 0) {
    resultArk.getRange(resultArk.getLastRow() + 1, 1, nyeRader.length, TEKSTGRUNNLAG_TEST_OVERSKRIFTER.length).setValues(nyeRader);
  }

  Logger.log('runTekstgrunnlagTest(' + kjoringId + '): skrev ' + nyeRader.length + ' rad(er) denne kjoringen.' +
    (stoppet ? ' IKKE FERDIG - kjor runTekstgrunnlagTest("' + kjoringId + '") pa nytt for a fortsette.' :
      ' Ferdig med alle planlagte AI-kall denne kjoringen.'));
}

/**
 * Leser "Tekstgrunnlag-test" og returnerer hvilke (Artikkel-ID, Variant)-
 * kombinasjoner som allerede har en rad for denne kjoringId-en.
 *
 * @param {Spreadsheet} ss
 * @param {string} kjoringId
 * @return {Object} {"artikkelId|variant": true, ...}
 */
function hentAlleredeBehandledeVarianter(ss, kjoringId) {
  var ark = ss.getSheetByName(FANE_TEKSTGRUNNLAG_TEST);
  var behandlet = {};
  if (!ark) return behandlet;

  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) return behandlet;

  var data = ark.getRange(2, 1, sisteRad - 1, 3).getValues(); // Kjoring-ID, Artikkel-ID, Variant
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(kjoringId)) {
      behandlet[String(data[i][1]) + '|' + String(data[i][2])] = true;
    }
  }
  return behandlet;
}

// hentDomeneFraUrl() og erDomeneIListe() flyttet til 14_Tekstgrunnlag.gs i
// Steg E3 - delt med 10_AIIntegrasjon.gs. Samme funksjoner, samme oppforsel.

/**
 * Kostnadsanslag for ETT AI-kall gitt en anslått tegnlengde pa input.
 *
 * @param {number} inputTegn
 * @param {number} tokensUt
 * @param {{inn:number, ut:number}} priser
 * @return {number}
 */
function estimerEttKallKostnad(inputTegn, tokensUt, priser) {
  var tokensInn = Math.ceil(inputTegn / 4);
  return (tokensInn / 1000000) * priser.inn + (tokensUt / 1000000) * priser.ut;
}

/**
 * Grovt kostnadsestimat FOR kjoring starter, for ALLE varianter en rad vil
 * fa. Variant B anslas i VERSTE FALL (TEKSTGRUNNLAG_MAKS_TEGN), siden
 * faktisk sidelengde er ukjent for sidehenting. Ren funksjon - testbar med Node.
 *
 * @param {Array<Array>} rader - [[Artikkel-ID, Kilde, URL, Overskrift, Ingress], ...]
 * @param {Array<string>} domeneListe - KILDER_MED_HELSIDE
 * @param {string} aiModell
 * @return {number}
 */
function estimerTekstgrunnlagTestKostnad(rader, domeneListe, aiModell) {
  var priser = AI_PRISER[aiModell];
  if (!priser) return 0;

  var ANSLAG_TOKENS_UT = 220;
  var systemPromptTegn = AI_SYSTEM_PROMPT.length;
  var totalKostnad = 0;

  for (var i = 0; i < rader.length; i++) {
    var url = rader[i][2];
    var overskrift = String(rader[i][3] || '');
    var ingress = String(rader[i][4] || '');

    // Variant A - alltid
    totalKostnad += estimerEttKallKostnad(systemPromptTegn + overskrift.length + ingress.length + 40, ANSLAG_TOKENS_UT, priser);

    if (erDomeneIListe(url, domeneListe)) {
      // Variant B - antar verste fall (full TEKSTGRUNNLAG_MAKS_TEGN)
      totalKostnad += estimerEttKallKostnad(systemPromptTegn + overskrift.length + TEKSTGRUNNLAG_MAKS_TEGN + 150, ANSLAG_TOKENS_UT, priser);
      // Variant C - ingress + anslatt sokeordkontekst (opptil 3 x 200 tegn)
      totalKostnad += estimerEttKallKostnad(systemPromptTegn + overskrift.length + ingress.length + 600 + 150, ANSLAG_TOKENS_UT, priser);
    }
  }

  return totalKostnad;
}

/**
 * Bygger foresporsel-objektet (for UrlFetchApp.fetchAll()) for ETT AI-kall
 * med en allerede ferdigbygd brukertekst - samme modell/system-prompt/
 * headers/max_tokens som produksjonen (byggAiForesporsel() i
 * 10_AIIntegrasjon.gs), bare parameterisert direkte pa brukerTekst i
 * stedet for et treff-objekt, siden variant B/C bruker en annen
 * brukertekst-form (byggBrukerTekstMedUtvidetTekstgrunnlag()).
 *
 * @param {string} brukerTekst
 * @param {string} apiKey
 * @param {string} aiModell
 * @return {Object}
 */
function byggTekstgrunnlagTestForesporsel(brukerTekst, apiKey, aiModell) {
  var requestBody = {
    model: aiModell,
    max_tokens: 500,
    system: AI_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: brukerTekst }]
  };

  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
}

/**
 * Bygger én rad til "Tekstgrunnlag-test" fra et tolket AI-svar. Ren
 * funksjon - testbar med Node.
 *
 * @param {string} kjoringId
 * @param {string} artikkelId
 * @param {string} variant - "A" | "B" | "C"
 * @param {Object} tolket - fra tolkAiKategoriseringsSvar() (09_AITest.gs)
 * @param {string} tekstgrunnlagBrukt - den faktiske teksten denne varianten brukte
 * @param {number|string} tokensInn
 * @param {number|string} tokensUt
 * @param {number|string} kostnad
 * @return {Array}
 */
function byggTekstgrunnlagTestRad(kjoringId, artikkelId, variant, tolket, tekstgrunnlagBrukt, tokensInn, tokensUt, kostnad) {
  var validering = validateSummary(tolket.sammendrag, tekstgrunnlagBrukt);
  var valideringsTekst = validering.gyldig
    ? 'Gyldig'
    : ('Ugyldig (' + validering.antallAvvik + ' avvik: ' + validering.avvikendeOrd.join(', ') + ')');

  return [
    kjoringId,
    artikkelId,
    variant,
    bestemKiVurdering({ aiRelevant: tolket.relevant, aiParseFeilet: tolket.parseFeilet }),
    tolket.kategori || '',
    tolket.nevnerOss ? 'Ja' : 'Nei',
    tolket.notat || '',
    valideringsTekst,
    (tekstgrunnlagBrukt || '').length,
    tokensInn,
    tokensUt,
    kostnad,
    '' // "Riktig?" - fylles ut manuelt
  ];
}
