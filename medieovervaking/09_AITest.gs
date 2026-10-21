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
 *   E Relevant | F Kategori | G Nevner oss | H Nevner oss - kilde |
 *   I Notat | J Irrelevant grunn | K Rå feil | L Tokens inn | M Tokens ut |
 *   N Kostnad USD | O Modell
 *
 * Krever to Script Properties (Prosjektinnstillinger -> Skriptegenskaper):
 *   ANTHROPIC_API_KEY - din Anthropic API-nokkel
 *   AI_MODEL          - modell-id, f.eks. "claude-haiku-5-5" eller
 *                        "claude-sonnet-5-5"
 *
 * Nokkelen logges ALDRI noe sted i dette skriptet.
 */

// ---------------------------------------------------------------------
// Navn/prosjekter som regnes som "oss" - uavhengig av hva AI-modellen
// svarer. Sjekkes case-insensitivt mot overskrift+ingress for hvert treff.
// Endelig nevner_oss = (treff i denne listen) ELLER (modellens nevner_oss).
// Dette gjelder OGSA nar KI-kallet feiler eller ikke kan tolkes - nevner_oss
// skal ALDRI ende opp som false/usynlig bare fordi AI-kallet feilet.
//
// Hvert element er enten en ren streng (teller alltid, samme substreng-sok
// som for), eller et objekt {navn, kreverKontekst} for navn som er for
// upresise alene til a telle som "oss" pa egen hand (f.eks. "Maritime AI
// Centre" - vi er partner der, men de fleste sakene som nevner senteret
// (generelle nyheter, masteroppgaver osv.) handler ikke om OSS spesifikt).
// Da ma minst ett av ordene i kreverKontekst OGSA finnes i samme tekst for
// at treffet skal telle - samme prinsipp som "kontekstord" for Tier
// 2-sokeord i 01_Konfigurasjon.gs.
//
// Tvetydige navn (FLAGSHIPS, TrAM, Apollo, GASS, AWESOME) er IKKE med her
// med vilje - de krever kontekst AI-en selv ma vurdere, og overlates
// derfor til modellens egen vurdering, som i dag.
// ---------------------------------------------------------------------
var OUR_NAMES = [
  'Maritime CleanTech', 'HyShip', 'Ocean Charger', 'Orcelle Horizon',
  'AIMPERES', 'FIT-HORIZONS', 'LOWNOISER', 'STEESMAT', 'H2NOR', 'SeaThrive',
  'Ship-aH2oy', 'CleanFlow Energy network',
  { navn: 'Maritime AI Centre', kreverKontekst: ['Maritime CleanTech'] }
];

/**
 * @param {string} tekst - typisk overskrift + ingress
 * @return {boolean} true hvis et av navnene i OUR_NAMES finnes i teksten
 *   (case-insensitivt substreng-sok). For navn med kreverKontekst ma minst
 *   ett av kontekstordene OGSA finnes i samme tekst.
 */
function nevnerOssIKode(tekst) {
  if (!tekst) return false;
  var lav = String(tekst).toLowerCase();
  for (var i = 0; i < OUR_NAMES.length; i++) {
    var element = OUR_NAMES[i];

    if (typeof element === 'string') {
      if (lav.indexOf(element.toLowerCase()) !== -1) return true;
      continue;
    }

    if (lav.indexOf(element.navn.toLowerCase()) === -1) continue;
    var kreverKontekst = element.kreverKontekst || [];
    for (var j = 0; j < kreverKontekst.length; j++) {
      if (lav.indexOf(kreverKontekst[j].toLowerCase()) !== -1) return true;
    }
  }
  return false;
}

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
 * Gjor ETT rått HTTP-kall til Claude. Kaster videre ved nettverksfeil
 * (fanges av kalleren) - gjor INGEN tolkning selv, se
 * gjorOgTolkEttKlaudeKall() for det.
 *
 * @param {string} apiKey
 * @param {string} aiModell
 * @param {string} brukerTekst
 * @return {{httpKode:number, raTekst:string}}
 */
function gjorEttKlaudeKall(apiKey, aiModell, brukerTekst) {
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
  var respons = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  return { httpKode: respons.getResponseCode(), raTekst: respons.getContentText() };
}

/**
 * Gjor ETT API-kall til Claude og tolker det fullt ut: nettverksfeil,
 * utgiftstak-stopp, HTTP-feil, og selve JSON-innholdet (via den delte
 * tolkAiKategoriseringsSvar()). Brukes av runAiTest() for bade forste
 * forsok og det ene retry-forsoket, slik at begge folger eksakt samme
 * logikk - se krav om retry ved parse-feil.
 *
 * @param {string} apiKey
 * @param {string} aiModell
 * @param {string} brukerTekst
 * @param {string} kildeTekstForNevnerOss
 * @return {{type:string, tolket:(Object|undefined), raFeilTekst:(string|undefined),
 *   tokensInn:*, tokensUt:*, kostnad:*, raTekst:(string|undefined),
 *   feilmelding:(string|undefined), stoppMelding:(string|undefined)}}
 *   type er en av: 'nettverksfeil' | 'utgiftstak' | 'http-feil' | 'ok'
 */
function gjorOgTolkEttKlaudeKall(apiKey, aiModell, brukerTekst, kildeTekstForNevnerOss) {
  var kall;
  try {
    kall = gjorEttKlaudeKall(apiKey, aiModell, brukerTekst);
  } catch (e) {
    return { type: 'nettverksfeil', feilmelding: e.message };
  }

  var svarJson = parseJsonTrygt(kall.raTekst);

  var utgiftstakMelding = sjekkForUtgiftstakStopp(kall.httpKode, svarJson);
  if (utgiftstakMelding) {
    return { type: 'utgiftstak', stoppMelding: utgiftstakMelding, raTekst: kall.raTekst };
  }

  if (kall.httpKode < 200 || kall.httpKode >= 300) {
    var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
      svarJson.error.message : kall.raTekst.substring(0, 300);
    return { type: 'http-feil', feilmelding: 'HTTP-feil ' + kall.httpKode + ': ' + feilmelding, raTekst: kall.raTekst };
  }

  var tokensInn = (svarJson && svarJson.usage) ? svarJson.usage.input_tokens : '';
  var tokensUt = (svarJson && svarJson.usage) ? svarJson.usage.output_tokens : '';
  var kostnad = beregnKostnad(aiModell, tokensInn, tokensUt);

  var tekstBlokk = hentForsteTekstBlokk(svarJson);
  var tolket = tolkAiKategoriseringsSvar(tekstBlokk, kildeTekstForNevnerOss);

  return {
    type: 'ok',
    tolket: tolket,
    raFeilTekst: tolket.parseFeilet ? byggRaFeilTekst(tekstBlokk, svarJson) : '',
    tokensInn: tokensInn,
    tokensUt: tokensUt,
    kostnad: kostnad,
    raTekst: kall.raTekst
  };
}

/**
 * Legger sammen to tall-eller-tom-streng-verdier (som tokensInn/tokensUt/
 * kostnad kan vaere). Brukes til a summere forste forsok + retry-forsoket
 * for samme rad i runAiTest().
 *
 * @param {number|string} a
 * @param {number|string} b
 * @return {number|string}
 */
function leggSammen(a, b) {
  if (typeof a !== 'number' && typeof b !== 'number') return '';
  return (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0);
}

/**
 * Hovedfunksjonen - kjor denne manuelt fra Apps Script-editoren.
 * Leser rader fra "AI-test", kaller Claude for hver rad, og skriver
 * resultatet tilbake i kolonne E-O. Forsoker en gang til (maks en gang
 * per rad) hvis AI-svaret ikke kan tolkes. Stopper sikkert ved tegn pa at
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

    var kildeTekstForNevnerOss = overskrift + ' ' + ingress;
    var brukerTekst = 'Overskrift: ' + overskrift + '\nIngress: ' + ingress +
      (kilde ? '\nKilde: ' + kilde : '');

    var forsok = gjorOgTolkEttKlaudeKall(apiKey, aiModell, brukerTekst, kildeTekstForNevnerOss);

    // Logg ETT rarespons-eksempel forste gang, slik at vi kan se faktisk
    // responsform fra API-et. Responsen fra Anthropic inneholder aldri
    // API-nokkelen (den sendes kun i foresporselen, ikke i svaret).
    if (!harLoggetRaRespons && forsok.raTekst) {
      Logger.log('RÅRESPONS-EKSEMPEL, kun for a se responsformen:');
      Logger.log(forsok.raTekst);
      harLoggetRaRespons = true;
    }

    if (forsok.type === 'nettverksfeil') {
      Logger.log('  Nettverksfeil pa rad ' + radnummer + ': ' + forsok.feilmelding);
      var kodeTreffNett = nevnerOssIKode(kildeTekstForNevnerOss);
      skrivAiResultat(ark, radnummer, 'usikker', '', kodeTreffNett, kodeTreffNett ? 'kode' : '',
        'Nettverksfeil: ' + forsok.feilmelding, '', '', '', '', '', aiModell);
      antallBehandlet++;
      continue;
    }

    if (forsok.type === 'utgiftstak') {
      Logger.log('STOPPER runAiTest(): ' + forsok.stoppMelding);
      var kodeTreffStopp = nevnerOssIKode(kildeTekstForNevnerOss);
      skrivAiResultat(ark, radnummer, 'usikker', '', kodeTreffStopp, kodeTreffStopp ? 'kode' : '',
        'STOPPET: ' + forsok.stoppMelding, '', '', '', '', '', aiModell);
      stoppet = true;
      break;
    }

    if (forsok.type === 'http-feil') {
      Logger.log('  ' + forsok.feilmelding + ' (rad ' + radnummer + ')');
      var kodeTreffHttp = nevnerOssIKode(kildeTekstForNevnerOss);
      skrivAiResultat(ark, radnummer, 'usikker', '', kodeTreffHttp, kodeTreffHttp ? 'kode' : '',
        forsok.feilmelding, '', '', '', '', '', aiModell);
      antallBehandlet++;
      continue;
    }

    // --- forsok.type === 'ok' ---
    var tolket = forsok.tolket;
    var tokensInn = forsok.tokensInn;
    var tokensUt = forsok.tokensUt;
    var kostnad = forsok.kostnad;
    var raFeilTekst = forsok.raFeilTekst;
    if (typeof kostnad === 'number') totalKostnadDenneKjoringen += kostnad;

    if (tolket.parseFeilet) {
      Logger.log('  Klarte ikke a tolke AI-svaret pa rad ' + radnummer + ' - forsoker en gang til...');
      var retry = gjorOgTolkEttKlaudeKall(apiKey, aiModell, brukerTekst, kildeTekstForNevnerOss);

      if (retry.type === 'utgiftstak') {
        Logger.log('STOPPER runAiTest() (under retry): ' + retry.stoppMelding);
        skrivAiResultat(ark, radnummer, 'usikker', '', tolket.nevnerOss, tolket.nevnerOssKilde,
          'STOPPET (retry): ' + retry.stoppMelding, '', raFeilTekst, tokensInn, tokensUt, kostnad, aiModell);
        stoppet = true;
        break;
      }

      if (retry.type === 'ok') {
        if (typeof retry.kostnad === 'number') totalKostnadDenneKjoringen += retry.kostnad;
        tokensInn = leggSammen(tokensInn, retry.tokensInn);
        tokensUt = leggSammen(tokensUt, retry.tokensUt);
        kostnad = leggSammen(kostnad, retry.kostnad);
        tolket = retry.tolket;
        raFeilTekst = retry.raFeilTekst;
      } else {
        Logger.log('  Retry pa rad ' + radnummer + ' feilet ogsa (' + retry.type + '): ' +
          (retry.feilmelding || '(ingen feilmelding)') + ' - behold forste forsoks resultat.');
      }

      if (tolket.parseFeilet) {
        antallParseFeil++;
        Logger.log('  Parse-feil (etter retry) pa rad ' + radnummer + ': ' +
          (raFeilTekst || '(ingen rafeil-tekst)'));
      }
    }

    if (!tolket.notat) {
      antallTommeNotater++;
    }

    skrivAiResultat(ark, radnummer, tolket.relevant ? 'ja' : 'nei', tolket.kategori,
      tolket.nevnerOss, tolket.nevnerOssKilde, tolket.notat, tolket.irrelevantGrunn, raFeilTekst,
      tokensInn, tokensUt, kostnad, aiModell);

    antallBehandlet++;
  }

  var totalTidSekunder = Math.round((new Date().getTime() - startTid) / 1000);
  Logger.log('=== Ferdig. ' + antallBehandlet + ' rad(er) behandlet' +
    (stoppet ? ' (STOPPET fore tiden - se melding over)' : '') +
    '. Parse-feil (etter retry): ' + antallParseFeil + '. Tomme notater: ' + antallTommeNotater + ' av ' +
    antallBehandlet + '. Total kostnad denne kjoringen: $' + totalKostnadDenneKjoringen.toFixed(4) +
    '. Tid brukt: ' + totalTidSekunder + ' sekunder. ===');
}

/**
 * Skriver resultatkolonnene E-O for en gitt rad.
 *
 * @param {Sheet} ark
 * @param {number} radnummer
 * @param {string} relevant - "ja" / "nei" / "usikker"
 * @param {string} kategori
 * @param {boolean|string} nevnerOss - true/false, eller "" ved feil/stopp (ikke vurdert)
 * @param {string} nevnerOssKilde - "kode" / "modell" / "begge" / ""
 * @param {string} notat
 * @param {string} irrelevantGrunn
 * @param {string} raFeil - diagnosetekst fra byggRaFeilTekst() ved parse-feil, ellers ""
 * @param {number|string} tokensInn
 * @param {number|string} tokensUt
 * @param {number|string} kostnad
 * @param {string} modell
 */
function skrivAiResultat(ark, radnummer, relevant, kategori, nevnerOss, nevnerOssKilde, notat, irrelevantGrunn, raFeil, tokensInn, tokensUt, kostnad, modell) {
  ark.getRange(radnummer, 5, 1, 11).setValues([[
    relevant,
    kategori,
    nevnerOss === true ? 'ja' : (nevnerOss === false ? 'nei' : ''),
    nevnerOssKilde || '',
    notat,
    irrelevantGrunn,
    raFeil || '',
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
 * boolean) behandles treffet som relevant=true med tom kategori og tomt
 * notat - IKKE som en egen "usikker"-tilstand. parseFeilet=true lar
 * kalleren telle opp antall parse-feil per kjoring (etter ev. retry).
 *
 * nevnerOss er ALLTID (kode-treff i OUR_NAMES) ELLER (modellens svar) -
 * ogsa nar parsingen feiler, slik at et kode-basert "nevner oss"-treff
 * aldri forsvinner bare fordi AI-svaret ikke kunne tolkes.
 *
 * @param {string} tekstBlokk - Claudes svartekst (forste tekstblokk)
 * @param {string} kildeTekstForNevnerOss - overskrift+ingress, brukt til
 *   kode-basert nevnerOss-sjekk (nevnerOssIKode())
 * @return {{relevant:boolean, kategori:string, nevnerOss:boolean,
 *   nevnerOssKilde:string, notat:string, irrelevantGrunn:string,
 *   parseFeilet:boolean}}
 */
function tolkAiKategoriseringsSvar(tekstBlokk, kildeTekstForNevnerOss) {
  var tolket = tekstBlokk ? parseAiSvarJson(tekstBlokk) : null;
  var kodeTreff = nevnerOssIKode(kildeTekstForNevnerOss);

  if (!tolket || typeof tolket.relevant !== 'boolean') {
    return {
      relevant: true,
      kategori: '',
      nevnerOss: kodeTreff,
      nevnerOssKilde: kodeTreff ? 'kode' : '',
      notat: '',
      irrelevantGrunn: '',
      parseFeilet: true
    };
  }

  var modellNevnerOss = tolket.nevner_oss === true;
  var nevnerOssKilde = '';
  if (kodeTreff && modellNevnerOss) nevnerOssKilde = 'begge';
  else if (kodeTreff) nevnerOssKilde = 'kode';
  else if (modellNevnerOss) nevnerOssKilde = 'modell';

  return {
    relevant: tolket.relevant,
    kategori: normaliserAiKategori(tolket.kategori),
    nevnerOss: kodeTreff || modellNevnerOss,
    nevnerOssKilde: nevnerOssKilde,
    notat: typeof tolket.notat === 'string' ? tolket.notat : '',
    irrelevantGrunn: typeof tolket.irrelevant_grunn === 'string' ? tolket.irrelevant_grunn : '',
    parseFeilet: false
  };
}

/**
 * Bygger en kort diagnosetekst for en rad/treff der AI-svaret ikke kunne
 * tolkes: de forste 500 tegnene av Claudes svartekst, pluss stop_reason
 * fra Anthropic-responsen (f.eks. "end_turn" eller "max_tokens" - sistnevnte
 * forklarer ofte en avkuttet/ugyldig JSON). Brukt til kolonnen "Rå feil" i
 * "AI-test" og i feiloppsummeringen i "Kjøretidslogg".
 *
 * @param {string} tekstBlokk
 * @param {Object|null} svarJson - det fulle parsede API-svaret
 * @return {string}
 */
function byggRaFeilTekst(tekstBlokk, svarJson) {
  var stopReason = (svarJson && svarJson.stop_reason) ? svarJson.stop_reason : '(ukjent)';
  var utdrag = (tekstBlokk || '').substring(0, 500);
  return 'stop_reason=' + stopReason + ' | ' + utdrag;
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
