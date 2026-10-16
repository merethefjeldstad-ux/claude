/**
 * 09_AITest.gs
 *
 * Tester Anthropic API (Claude) mot fanen "AI-test", som et forprosjekt til
 * Fase 2 (AI-vurdering/notat for daglige treff - se 10_AIIntegrasjon.gs).
 * Dette er IKKE koblet til den daglige kjoringen (kjorDaglig/kjorTest) - kun
 * til manuell testing via funksjonen runAiTest() under.
 *
 * Fanen "AI-test" ma ha disse kolonnene fra for (du oppretter raden selv,
 * skriptet oppretter IKKE fanen):
 *   A Overskrift | B Ingress | C Kilde | D Forventet
 * Skriptet skriver til:
 *   E Relevant | F Begrunnelse | G Notat | H Tokens inn | I Tokens ut |
 *   J Kostnad USD | K Modell
 *
 * Krever to Script Properties (Prosjektinnstillinger -> Skriptegenskaper):
 *   ANTHROPIC_API_KEY - din Anthropic API-nokkel
 *   AI_MODEL          - modell-id, f.eks. "claude-haiku-5-5" eller
 *                        "claude-sonnet-5-5"
 *
 * Systemprompten under bruker PROSJEKTNAVN (satt i 01_Konfigurasjon.gs) -
 * husk a ha satt den for du tester. Vurder ogsa a utvide prompten med noen
 * setninger om HVA overvakingen faktisk gjelder (bransje, nokkelbegreper,
 * eventuelle tvetydige sokeord som trenger kontekst) - jo mer presist
 * Claude vet hva "relevant" betyr for ditt tema, jo bedre blir vurderingen.
 *
 * Nokkelen logges ALDRI noe sted i dette skriptet.
 */

// Fanenavn - endre her hvis du gir fanen et annet navn
var FANE_AI_TEST = 'AI-test';

// Maks antall rader behandlet per kjoring (unngår a sprenge 6-minuttersgrensen
// og demper eventuelle kostnader hvis noe gar galt midt i en stor test-liste)
var AI_TEST_MAKS_RADER = 40;

// Pris per million tokens (USD). Oppdater her hvis Anthropic endrer prisene,
// eller legg til flere modeller etter samme monster.
var AI_PRISER = {
  'claude-haiku-5-5': { inn: 0.10, ut: 0.50 },
  'claude-sonnet-5-5': { inn: 2, ut: 10 }
};

// System-prompten AI-en far for hver vurdering. Bygges rundt PROSJEKTNAVN -
// tilpass gjerne resten av teksten til ditt overvakingstema (se kommentaren
// ovenst i fila).
var AI_SYSTEM_PROMPT =
  'Du vurderer treff i en daglig medieovervåking for ' + PROSJEKTNAVN + '. ' +
  'Vurder ut fra overskrift og ingress om saken faktisk er relevant for dette ' +
  'overvåkingstemaet. Ord som også kan bety noe helt annet krever riktig ' +
  'kontekst for å telle som relevant. Er du usikker, svar relevant og si det ' +
  'i begrunnelsen. Notat: 1–2 setninger på norsk om hva saken handler om og ' +
  'hvor søkeordet er nevnt, kun basert på teksten. Ikke finn på detaljer. ' +
  'Svar bare med JSON: {"relevant": true/false, "begrunnelse": "...", "notat": "..."}';

/**
 * Hovedfunksjonen - kjor denne manuelt fra Apps Script-editoren.
 * Leser rader fra "AI-test", kaller Claude for hver rad, og skriver
 * resultatet tilbake i kolonne E-K. Stopper sikkert ved tegn pa at
 * utgiftstaket er nadd (se sjekkForUtgiftstakStopp()).
 */
function runAiTest() {
  var startTid = new Date().getTime();
  Logger.log('=== Starter runAiTest ===');

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  var aiModell = PropertiesService.getScriptProperties().getProperty('AI_MODEL');

  if (!apiKey) {
    Logger.log('FEIL: Script Property "ANTHROPIC_API_KEY" er ikke satt. ' +
      'Ga til Prosjektinnstillinger -> Skriptegenskaper og legg den til. Avbryter.');
    return;
  }
  if (!aiModell) {
    Logger.log('FEIL: Script Property "AI_MODEL" er ikke satt (f.eks. "claude-haiku-5-5" ' +
      'eller "claude-sonnet-5-5"). Avbryter.');
    return;
  }
  if (!AI_PRISER[aiModell]) {
    Logger.log('ADVARSEL: Ukjent modell "' + aiModell + '" i AI_PRISER-tabellen i koden. ' +
      'Kostnad vil bli logget som 0 - legg til riktig pris i AI_PRISER hvis dette ikke stemmer.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ark = ss.getSheetByName(FANE_AI_TEST);
  if (!ark) {
    Logger.log('FEIL: Fant ingen fane som heter "' + FANE_AI_TEST + '". Avbryter.');
    return;
  }

  var sisteRad = ark.getLastRow();
  if (sisteRad < 2) {
    Logger.log('Ingen datarader funnet i "' + FANE_AI_TEST + '" (kun overskriftsrad). Avbryter.');
    return;
  }

  var antallDatarader = sisteRad - 1;
  var antallABehandle = Math.min(antallDatarader, AI_TEST_MAKS_RADER);
  if (antallDatarader > AI_TEST_MAKS_RADER) {
    Logger.log('Fant ' + antallDatarader + ' datarader, men behandler kun de forste ' +
      AI_TEST_MAKS_RADER + ' denne kjoringen (AI_TEST_MAKS_RADER). Kjor runAiTest() igjen ' +
      'for a fortsette med resten.');
  }

  var data = ark.getRange(2, 1, antallABehandle, 4).getValues(); // A:D
  var harLoggetRaRespons = false;
  var antallBehandlet = 0;
  var totalKostnadDenneKjoringen = 0;
  var stoppet = false;

  for (var i = 0; i < data.length; i++) {
    var radnummer = i + 2;
    var overskrift = String(data[i][0] || '').trim();
    var ingress = String(data[i][1] || '').trim();
    var kilde = String(data[i][2] || '').trim();

    if (!overskrift && !ingress) {
      continue; // tom rad - hopp over
    }

    Logger.log('Rad ' + radnummer + ': kaller Claude (' + aiModell + ') for "' + overskrift + '"...');

    var brukerTekst = 'Overskrift: ' + overskrift + '\nIngress: ' + ingress +
      (kilde ? '\nKilde: ' + kilde : '');

    var requestBody = {
      model: aiModell,
      max_tokens: 300,
      system: AI_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: brukerTekst }
      ]
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };

    var httpKode = null;
    var raTekst = null;

    try {
      var respons = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
      httpKode = respons.getResponseCode();
      raTekst = respons.getContentText();
    } catch (e) {
      Logger.log('  Nettverksfeil pa rad ' + radnummer + ': ' + e.message);
      skrivAiResultat(ark, radnummer, 'usikker', '', 'Nettverksfeil: ' + e.message, '', '', '', aiModell);
      antallBehandlet++;
      continue;
    }

    // Logg ETT rarespons-eksempel forste gang, slik at vi kan se faktisk
    // responsform fra API-et. Responsen fra Anthropic inneholder aldri
    // API-nokkelen (den sendes kun i foresporselen, ikke i svaret).
    if (!harLoggetRaRespons) {
      Logger.log('RÅRESPONS-EKSEMPEL (HTTP ' + httpKode + '), kun for a se responsformen:');
      Logger.log(raTekst);
      harLoggetRaRespons = true;
    }

    var svarJson = parseJsonTrygt(raTekst);

    // --- Sjekk for utgiftstak-stopp FOR noe annet, per krav 6 ---
    var utgiftstakMelding = sjekkForUtgiftstakStopp(httpKode, svarJson);
    if (utgiftstakMelding) {
      Logger.log('STOPPER runAiTest(): ' + utgiftstakMelding);
      skrivAiResultat(ark, radnummer, 'usikker', '', 'STOPPET: ' + utgiftstakMelding, '', '', '', aiModell);
      stoppet = true;
      break;
    }

    if (httpKode < 200 || httpKode >= 300) {
      var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
        svarJson.error.message : raTekst.substring(0, 300);
      Logger.log('  HTTP-feil ' + httpKode + ' pa rad ' + radnummer + ': ' + feilmelding);
      skrivAiResultat(ark, radnummer, 'usikker', '', 'HTTP-feil ' + httpKode + ': ' + feilmelding, '', '', '', aiModell);
      antallBehandlet++;
      continue;
    }

    // --- Vellykket HTTP-kall (200) ---
    var tokensInn = (svarJson && svarJson.usage) ? svarJson.usage.input_tokens : '';
    var tokensUt = (svarJson && svarJson.usage) ? svarJson.usage.output_tokens : '';
    var kostnad = beregnKostnad(aiModell, tokensInn, tokensUt);
    if (typeof kostnad === 'number') {
      totalKostnadDenneKjoringen += kostnad;
    }

    var tekstBlokk = hentForsteTekstBlokk(svarJson);
    var tolket = tekstBlokk ? parseAiSvarJson(tekstBlokk) : null;

    if (!tolket || typeof tolket.relevant !== 'boolean') {
      Logger.log('  Klarte ikke a tolke AI-svaret som forventet JSON pa rad ' + radnummer +
        ' - setter "usikker". Ra tekst fra Claude: ' + (tekstBlokk || '(tom)'));
      skrivAiResultat(ark, radnummer, 'usikker',
        (tolket && tolket.begrunnelse) || '(kunne ikke tolke AI-svar som gyldig JSON)',
        (tolket && tolket.notat) || '',
        tokensInn, tokensUt, kostnad, aiModell);
    } else {
      skrivAiResultat(ark, radnummer, tolket.relevant ? 'ja' : 'nei',
        tolket.begrunnelse || '', tolket.notat || '',
        tokensInn, tokensUt, kostnad, aiModell);
    }

    antallBehandlet++;
  }

  var totalTidSekunder = Math.round((new Date().getTime() - startTid) / 1000);
  Logger.log('=== Ferdig. ' + antallBehandlet + ' rad(er) behandlet' +
    (stoppet ? ' (STOPPET fore tiden - se melding over)' : '') +
    '. Total kostnad denne kjoringen: $' + totalKostnadDenneKjoringen.toFixed(4) +
    '. Tid brukt: ' + totalTidSekunder + ' sekunder. ===');
}

/**
 * Skriver resultatkolonnene E-K for en gitt rad.
 *
 * @param {Sheet} ark
 * @param {number} radnummer
 * @param {string} relevant - "ja" / "nei" / "usikker"
 * @param {string} begrunnelse
 * @param {string} notat
 * @param {number|string} tokensInn
 * @param {number|string} tokensUt
 * @param {number|string} kostnad
 * @param {string} modell
 */
function skrivAiResultat(ark, radnummer, relevant, begrunnelse, notat, tokensInn, tokensUt, kostnad, modell) {
  ark.getRange(radnummer, 5, 1, 7).setValues([[
    relevant,
    begrunnelse,
    notat,
    tokensInn,
    tokensUt,
    (typeof kostnad === 'number') ? kostnad : '',
    modell
  ]]);
}

/**
 * Sjekker om responsen indikerer at utgiftstaket er nadd:
 * - HTTP 429 med error_code "enforced_spend_limit_reached"
 * - HTTP 400 der meldingen begynner med "You have reached your specified"
 *
 * @param {number} httpKode
 * @param {Object|null} svarJson
 * @return {string|null} forklarende melding hvis stopp skal skje, ellers null
 */
function sjekkForUtgiftstakStopp(httpKode, svarJson) {
  if (!svarJson || !svarJson.error) return null;

  var feil = svarJson.error;
  var melding = feil.message || '';
  var errorCode = feil.error_code || svarJson.error_code || '';

  if (httpKode === 429 && errorCode === 'enforced_spend_limit_reached') {
    return 'Utgiftstak nadd (HTTP 429, error_code=enforced_spend_limit_reached). ' +
      'Kjoringen er stoppet - prov ikke pa nytt for taket er justert. Melding fra API: ' + melding;
  }
  if (httpKode === 400 && melding.indexOf('You have reached your specified') === 0) {
    return 'Utgiftstak nadd (HTTP 400). Kjoringen er stoppet - prov ikke pa nytt for ' +
      'taket er justert. Melding fra API: ' + melding;
  }
  return null;
}

/**
 * Beregner kostnad i USD ut fra token-bruk og pris per million tokens
 * (AI_PRISER-tabellen ovenst i fila).
 *
 * @param {string} modell
 * @param {number|string} tokensInn
 * @param {number|string} tokensUt
 * @return {number|string} kostnad i USD, eller tom streng hvis prisdata mangler
 */
function beregnKostnad(modell, tokensInn, tokensUt) {
  var priser = AI_PRISER[modell];
  if (!priser || typeof tokensInn !== 'number' || typeof tokensUt !== 'number') {
    return '';
  }
  var kostnad = (tokensInn / 1000000) * priser.inn + (tokensUt / 1000000) * priser.ut;
  return Math.round(kostnad * 1000000) / 1000000; // avrund til 6 desimaler
}

/**
 * Henter den forste tekstblokken (type "text") fra et Anthropic-svar.
 *
 * @param {Object} svarJson - parset JSON-svar fra /v1/messages
 * @return {string} tekstinnholdet, eller tom streng hvis ikke funnet
 */
function hentForsteTekstBlokk(svarJson) {
  if (!svarJson || !svarJson.content || !svarJson.content.length) return '';
  for (var i = 0; i < svarJson.content.length; i++) {
    if (svarJson.content[i].type === 'text') {
      return svarJson.content[i].text || '';
    }
  }
  return '';
}

/**
 * Tolker Claudes svartekst som JSON, robust mot eventuelle kodegjerder
 * (```json ... ``` eller ``` ... ```) rundt selve JSON-objektet, slik
 * modeller noen ganger legger til til tross for instruksjon om a ikke gjore det.
 *
 * @param {string} tekst
 * @return {Object|null} tolket objekt, eller null hvis parsing feilet
 */
function parseAiSvarJson(tekst) {
  if (!tekst) return null;
  var renset = tekst.trim();
  renset = renset.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(renset);
  } catch (e) {
    return null;
  }
}

/**
 * Trygg JSON.parse som returnerer null i stedet for a kaste et unntak.
 * Brukes pa selve HTTP-responskroppen (ikke Claudes svartekst - se
 * parseAiSvarJson() for det).
 *
 * @param {string} tekst
 * @return {Object|null}
 */
function parseJsonTrygt(tekst) {
  if (!tekst) return null;
  try {
    return JSON.parse(tekst);
  } catch (e) {
    return null;
  }
}
