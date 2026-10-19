/**
 * 09_AITest.gs
 *
 * Tester Anthropic API (Claude) mot fanen "AI-test", som et forprosjekt til
 * Fase 2 (AI-oppsummering/relevansvurdering). Dette er IKKE koblet til den
 * daglige kjoringen (kjorDaglig/kjorTest) - kun til manuell testing via
 * funksjonen runAiTest() under.
 *
 * Fanen "AI-test" ma ha disse kolonnene fra for (du oppretter raden selv,
 * skriptet oppretter IKKE fanen):
 *   A Overskrift | B Ingress | C Kilde | D Forventet
 * Skriptet skriver til:
 *   E Relevant | F Kategori | G Nevner oss | H Notat | I Irrelevant grunn |
 *   J Tokens inn | K Tokens ut | L Kostnad USD | M Modell
 *
 * Krever to Script Properties (Prosjektinnstillinger -> Skriptegenskaper):
 *   ANTHROPIC_API_KEY - din Anthropic API-nokkel
 *   AI_MODEL          - modell-id, f.eks. "claude-haiku-5-5" eller
 *                        "claude-sonnet-5-5"
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

// Kategoriene AI-en kan velge mellom - ETT sted a endre/legge til kategorier.
// Brukes bade til a bygge kategorilisten i prompten (byggAiKategoriListeForPrompt)
// og til a validere/normalisere kategorien AI-en svarer med (normaliserAiKategori).
var AI_KATEGORIER = [
  { navn: 'Energi og framdrift', beskrivelse: 'alternative drivstoff som hydrogen, ammoniakk og metanol; batteri og elektrifisering; vindfremdrift' },
  { navn: 'Skip, verft og havn', beskrivelse: 'verft, skipsbygging, landstrøm, havneinfrastruktur' },
  { navn: 'Digitalisering og systemer', beskrivelse: 'KI, systemintegrasjon, energieffektivitet, automasjon' },
  { navn: 'Politikk og regulering', beskrivelse: 'IMO/EU, støtteordninger, Enova, krav og rammevilkår' },
  { navn: 'Annet', beskrivelse: 'saker som ikke passer naturlig inn i noen av kategoriene over' }
];

/**
 * Bygger kategorilisten som settes inn i AI_SYSTEM_PROMPT under.
 * @return {string}
 */
function byggAiKategoriListeForPrompt() {
  return AI_KATEGORIER.map(function (k) {
    return '- ' + k.navn + ' (' + k.beskrivelse + ')';
  }).join('\n');
}

/**
 * @param {string} kategori
 * @return {boolean} true hvis kategori er et av navnene i AI_KATEGORIER
 */
function erGyldigAiKategori(kategori) {
  for (var i = 0; i < AI_KATEGORIER.length; i++) {
    if (AI_KATEGORIER[i].navn === kategori) return true;
  }
  return false;
}

/**
 * Normaliserer en rå kategori-streng fra AI-svaret: gyldige kategorinavn
 * beholdes uendret, alt annet (ukjent, tom, feil type) blir "Annet".
 * @param {*} raKategori
 * @return {string}
 */
function normaliserAiKategori(raKategori) {
  var kategori = typeof raKategori === 'string' ? raKategori.trim() : '';
  return erGyldigAiKategori(kategori) ? kategori : 'Annet';
}

// System-prompten AI-en far for hver vurdering (pa norsk, slik spesifisert).
var AI_SYSTEM_PROMPT =
  'Du vurderer treff i en daglig medieovervåking for Maritime CleanTech ' +
  '(maritime nullutslippsløsninger: hydrogen, ammoniakk, metanol, batteri, ' +
  'vindfremdrift, landstrøm, KI i shipping og prosjektene HyShip, FLAGSHIPS, ' +
  'Ocean Charger, Orcelle Horizon, TrAM, AIMPERES m.fl.). Du ser KUN ' +
  'overskrift og ingress, ikke resten av artikkelen - vurder relevans ut ' +
  'fra denne teksten alene, og påstå ingenting om innhold du ikke kan se. ' +
  'Ord som kan bety noe annet (GASS, TrAM, Apollo, AWESOME, FLAGSHIPS) ' +
  'krever maritim kontekst i teksten for å telle som relevant.\n\n' +
  'Velg nøyaktig én kategori som passer hovedtemaet i saken, fra listen ' +
  'under. Bruk "Annet" kun hvis ingen av de andre passer:\n' +
  byggAiKategoriListeForPrompt() + '\n\n' +
  'Sett "nevner_oss" til true KUN hvis overskriften eller ingressen ' +
  'navngir Maritime CleanTech, et av deres prosjekter, eller en kjent ' +
  'samarbeidspartner ved navn. Ellers false.\n\n' +
  'Notat skal normalt være en tom streng. Skriv kun et notat hvis teksten ' +
  'gir konkret informasjon som IKKE allerede står i overskrift eller ' +
  'ingress, eller som krever oppfølging (konkrete tall, beløp, ' +
  'tidsfrister, vedtak, en konkurrent eller lansering å være obs på). ' +
  'Bruk ALDRI notatet til å si at saken nevner Maritime CleanTech - det ' +
  'er det "nevner_oss" er til for. Notatet skal være maks én setning, ' +
  'maks 20 ord, på norsk. Gjenta ALDRI overskriften. Si ALDRI at saken er ' +
  '"relevant" eller "direkte relevant", og forklar ALDRI hvorfor den er ' +
  'relevant.\n\n' +
  '"irrelevant_grunn" fylles KUN ut når relevant er false: maks 10 ord, ' +
  'konkret (eksempel: "Naturgass til oppvarming, ikke prosjektet GASS"). ' +
  'La den stå tom når relevant er true.\n\n' +
  'Svar KUN med JSON, uten kodeblokk (ingen ```), uten annen tekst før ' +
  'eller etter: {"relevant": true/false, "kategori": "...", ' +
  '"nevner_oss": true/false, "notat": "...", "irrelevant_grunn": "..."}';

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
  var antallParseFeil = 0;
  var antallTommeNotater = 0;
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
      skrivAiResultat(ark, radnummer, 'usikker', '', '', 'Nettverksfeil: ' + e.message, '', '', '', '', aiModell);
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
      skrivAiResultat(ark, radnummer, 'usikker', '', '', 'STOPPET: ' + utgiftstakMelding, '', '', '', '', aiModell);
      stoppet = true;
      break;
    }

    if (httpKode < 200 || httpKode >= 300) {
      var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
        svarJson.error.message : raTekst.substring(0, 300);
      Logger.log('  HTTP-feil ' + httpKode + ' pa rad ' + radnummer + ': ' + feilmelding);
      skrivAiResultat(ark, radnummer, 'usikker', '', '', 'HTTP-feil ' + httpKode + ': ' + feilmelding, '', '', '', '', aiModell);
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
    var tolket = tolkAiKategoriseringsSvar(tekstBlokk);

    if (tolket.parseFeilet) {
      antallParseFeil++;
      Logger.log('  Klarte ikke a tolke AI-svaret som forventet JSON pa rad ' + radnummer +
        ' - behandler som relevant uten kategori (se krav om parse-feil-handtering). ' +
        'Ra tekst fra Claude: ' + (tekstBlokk || '(tom)'));
    }
    if (!tolket.notat) {
      antallTommeNotater++;
    }

    skrivAiResultat(ark, radnummer, tolket.relevant ? 'ja' : 'nei', tolket.kategori,
      tolket.nevnerOss, tolket.notat, tolket.irrelevantGrunn,
      tokensInn, tokensUt, kostnad, aiModell);

    antallBehandlet++;
  }

  var totalTidSekunder = Math.round((new Date().getTime() - startTid) / 1000);
  Logger.log('=== Ferdig. ' + antallBehandlet + ' rad(er) behandlet' +
    (stoppet ? ' (STOPPET fore tiden - se melding over)' : '') +
    '. Parse-feil: ' + antallParseFeil + '. Tomme notater: ' + antallTommeNotater + ' av ' +
    antallBehandlet + '. Total kostnad denne kjoringen: $' + totalKostnadDenneKjoringen.toFixed(4) +
    '. Tid brukt: ' + totalTidSekunder + ' sekunder. ===');
}

/**
 * Skriver resultatkolonnene E-M for en gitt rad.
 *
 * @param {Sheet} ark
 * @param {number} radnummer
 * @param {string} relevant - "ja" / "nei" / "usikker"
 * @param {string} kategori
 * @param {boolean|string} nevnerOss - true/false, eller "" ved feil/stopp (ikke vurdert)
 * @param {string} notat
 * @param {string} irrelevantGrunn
 * @param {number|string} tokensInn
 * @param {number|string} tokensUt
 * @param {number|string} kostnad
 * @param {string} modell
 */
function skrivAiResultat(ark, radnummer, relevant, kategori, nevnerOss, notat, irrelevantGrunn, tokensInn, tokensUt, kostnad, modell) {
  ark.getRange(radnummer, 5, 1, 9).setValues([[
    relevant,
    kategori,
    nevnerOss === true ? 'ja' : (nevnerOss === false ? 'nei' : ''),
    notat,
    irrelevantGrunn,
    tokensInn,
    tokensUt,
    (typeof kostnad === 'number') ? kostnad : '',
    modell
  ]]);
}

/**
 * Sjekker om responsen indikerer at utgiftstaket er nadd, per krav 6:
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
    // Siste utvei: trekk ut det forste {...}-blokken i teksten (i tilfelle
    // modellen likevel la til forklarende tekst for/etter selve JSON-en).
    var treff = renset.match(/\{[\s\S]*\}/);
    if (treff) {
      try {
        return JSON.parse(treff[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Tolker Claudes svartekst til et ensartet resultat. Delt mellom runAiTest()
 * her og tolkAiRespons() i 10_AIIntegrasjon.gs, slik at begge garantert
 * tolker AI-svaret pa eksakt samme mate.
 *
 * Ved parse-feil (ugyldig/manglende JSON, eller "relevant" som ikke er en
 * boolean) behandles treffet som relevant=true med tom kategori,
 * nevnerOss=false og tomt notat - IKKE som en egen "usikker"-tilstand.
 * parseFeilet=true lar kalleren telle opp antall parse-feil per kjoring.
 *
 * @param {string} tekstBlokk - Claudes svartekst (forste tekstblokk)
 * @return {{relevant:boolean, kategori:string, nevnerOss:boolean,
 *   notat:string, irrelevantGrunn:string, parseFeilet:boolean}}
 */
function tolkAiKategoriseringsSvar(tekstBlokk) {
  var tolket = tekstBlokk ? parseAiSvarJson(tekstBlokk) : null;

  if (!tolket || typeof tolket.relevant !== 'boolean') {
    return { relevant: true, kategori: '', nevnerOss: false, notat: '', irrelevantGrunn: '', parseFeilet: true };
  }

  return {
    relevant: tolket.relevant,
    kategori: normaliserAiKategori(tolket.kategori),
    nevnerOss: tolket.nevner_oss === true,
    notat: typeof tolket.notat === 'string' ? tolket.notat : '',
    irrelevantGrunn: typeof tolket.irrelevant_grunn === 'string' ? tolket.irrelevant_grunn : '',
    parseFeilet: false
  };
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
