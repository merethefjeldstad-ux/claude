/**
 * 10_AIIntegrasjon.gs
 *
 * Kobler AI-vurdering (Claude) inn i den DAGLIGE kjoringen (kjorDaglig/
 * kjorTest, se 07_Hovedkjoring.gs) - Fase 2. Bygger pa de samme
 * hjelpefunksjonene som den frittstaende testfunksjonen runAiTest() i
 * 09_AITest.gs (AI_SYSTEM_PROMPT, AI_PRISER, parseAiSvarJson(),
 * parseJsonTrygt(), hentForsteTekstBlokk(), beregnKostnad(),
 * sjekkForUtgiftstakStopp()) - IKKE en kopi av den logikken.
 *
 * Hovedfunksjonen her er vurderTreffMedAI(treffListe), kalt fra
 * kjorMedieovervaking() i 07_Hovedkjoring.gs, ALLTID innenfor try/catch
 * der den kalles - uansett hva som gar galt her, skal e-posten fortsatt
 * sendes etterpa (bare uten AI-notat for de treffene som ikke rakk a bli
 * vurdert).
 *
 * Styres av tre Script Properties (Prosjektinnstillinger -> Skriptegenskaper):
 *   AI_ENABLED        - "true" for a sla pa AI-vurdering, alt annet (eller
 *                        ikke satt) betyr av - da kjorer resten som ren
 *                        Fase 1, helt uten AI-kall.
 *   ANTHROPIC_API_KEY  - samme som brukt av runAiTest() i 09_AITest.gs.
 *   AI_MODEL           - samme som brukt av runAiTest().
 *
 * Nokkelen logges ALDRI noe sted i dette skriptet.
 */

// Maks antall AI-kall per daglig kjoring (separat fra AI_TEST_MAKS_RADER i
// 09_AITest.gs, som gjelder for den manuelle testfunksjonen).
var AI_MAKS_KALL_PER_KJORING = 40;

// Tidsbudsjett for HELE AI-steget (ikke hele skriptet - RSS-henting har sitt
// eget budsjett, se TIDSGRENSE_HENTING_MS i 01_Konfigurasjon.gs). Brukes opp
// -> resten av de nye treffene sendes uten AI-notat, ikke droppes.
var AI_TIDSBUDSJETT_MS = 4.5 * 60 * 1000;

// Antall parallelle kall per batch via UrlFetchApp.fetchAll() - reduserer
// hvor mye av AI_TIDSBUDSJETT_MS som gar med til a vente pa nettverket.
var AI_BATCH_STORRELSE = 5;

// Fane for AI-kjoringsstatistikk (antall kall, tokens, kostnad, feil).
// Opprettes automatisk forste gang noe skal logges dit.
var FANE_KJORETIDSLOGG = 'Kjøretidslogg';

/**
 * Anvender et tolket AI-resultat (fra tolkAiRespons()) pa ett treff-objekt
 * og oppdaterer kjoringsstatistikken. Brukt bade for forste forsok og for
 * retry-forsoket i vurderTreffMedAI(), slik at begge folger eksakt samme
 * logikk nar resultatet skal skrives til treffet.
 *
 * @param {Object} treff
 * @param {Object} tolket - se tolkAiRespons()
 * @param {Object} statistikk
 */
function anvendTolketResultatPaaTreff(treff, tolket, statistikk) {
  treff.aiRelevant = tolket.relevant;
  treff.aiKategori = tolket.kategori || '';
  treff.aiNevnerOss = tolket.nevnerOss === true;
  treff.aiNotat = tolket.notat || '';
  treff.aiIrrelevantGrunn = tolket.irrelevantGrunn || '';

  if (tolket.feilmelding) {
    statistikk.feil.push('"' + treff.tittel + '": ' + tolket.feilmelding);
  }
  if (typeof tolket.tokensInn === 'number') statistikk.tokensInn += tolket.tokensInn;
  if (typeof tolket.tokensUt === 'number') statistikk.tokensUt += tolket.tokensUt;
  if (typeof tolket.kostnad === 'number') statistikk.kostnad += tolket.kostnad;
}

/**
 * Vurderer en liste med NYE treff (allerede filtrert mot "Sendte artikler"
 * av kjorMedieovervaking() for denne kalles) med Claude: relevans (true/
 * false), kategori, om saken nevner oss, og et kort notat. Muterer HVERT
 * treff-objekt i listen direkte med:
 *   treff.aiRelevant      - true / false / null (null = ikke vurdert)
 *   treff.aiKategori      - string, en av AI_KATEGORIER (09_AITest.gs),
 *                           tom hvis ikke vurdert
 *   treff.aiNevnerOss     - boolean (kode-treff i OUR_NAMES ELLER modellens
 *                           svar - se 09_AITest.gs - alltid satt, ogsa ved feil)
 *   treff.aiNotat         - string (tom hvis ikke vurdert eller intet a notere)
 *   treff.aiIrrelevantGrunn - string, satt KUN nar aiRelevant er false - brukt
 *                           i e-postens "Mulig irrelevant"-seksjon, se
 *                           11_EpostMerkevare.gs
 *   treff.aiParseFeilet   - boolean, true KUN hvis AI-svaret ikke kunne
 *                           tolkes verken forste gang eller etter retry -
 *                           brukt til a vise "Ikke KI-vurdert" i stedet for
 *                           kategori i e-posten, se 11_EpostMerkevare.gs
 *
 * Ved parse-feil (ugyldig JSON i et ellers vellykket AI-svar) forsokes ETT
 * nytt kall for det treffet (maks en gang). Begge forsokene teller i
 * antallKall og kostnad, og kostnadsstoppen (sjekkForUtgiftstakStopp) gjelder
 * likt for begge.
 *
 * @param {Array<Object>} treffListe - treff-objekter med minst
 *   {tittel, ingress, kilde, lenke}
 * @return {{antallKall:number, tokensInn:number, tokensUt:number,
 *   kostnad:number, feil:Array<string>, stoppetTidlig:boolean,
 *   stoppArsak:string, antallParseFeil:number}}
 */
function vurderTreffMedAI(treffListe) {
  var statistikk = {
    antallKall: 0,
    tokensInn: 0,
    tokensUt: 0,
    kostnad: 0,
    feil: [],
    stoppetTidlig: false,
    stoppArsak: '',
    antallParseFeil: 0
  };

  var aiEnabled = PropertiesService.getScriptProperties().getProperty('AI_ENABLED');
  if (aiEnabled !== 'true') {
    Logger.log('AI-notat er avslatt (Script Property AI_ENABLED er ikke "true") - hopper over AI-steget.');
    return statistikk;
  }

  if (!treffListe || treffListe.length === 0) {
    return statistikk;
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  var aiModell = PropertiesService.getScriptProperties().getProperty('AI_MODEL');
  if (!apiKey || !aiModell) {
    var manglerMelding = 'AI_ENABLED er "true", men ANTHROPIC_API_KEY og/eller AI_MODEL mangler som ' +
      'Script Property. Hopper over AI-steget - treffene sendes uten notat.';
    Logger.log(manglerMelding);
    statistikk.feil.push(manglerMelding);
    return statistikk;
  }

  var treffABehandle = treffListe.slice(0, AI_MAKS_KALL_PER_KJORING);
  if (treffListe.length > AI_MAKS_KALL_PER_KJORING) {
    Logger.log('AI-steget: ' + treffListe.length + ' nye treff totalt, behandler kun de forste ' +
      AI_MAKS_KALL_PER_KJORING + ' denne kjoringen (AI_MAKS_KALL_PER_KJORING). De resterende ' +
      (treffListe.length - AI_MAKS_KALL_PER_KJORING) + ' sendes uten AI-notat.');
  }

  Logger.log('AI-steget starter: ' + treffABehandle.length + ' treff a vurdere med ' + aiModell +
    ', i batcher pa ' + AI_BATCH_STORRELSE + '.');

  var aiStartTid = new Date().getTime();
  var sisteRaFeilTekst = '';

  for (var start = 0; start < treffABehandle.length; start += AI_BATCH_STORRELSE) {
    var bruktMs = new Date().getTime() - aiStartTid;
    if (bruktMs > AI_TIDSBUDSJETT_MS) {
      statistikk.stoppetTidlig = true;
      statistikk.stoppArsak = 'Tidsbudsjettet for AI-steget (' +
        (AI_TIDSBUDSJETT_MS / 60000) + ' min) ble brukt opp etter ' +
        statistikk.antallKall + ' av ' + treffABehandle.length + ' kall.';
      Logger.log(statistikk.stoppArsak + ' Resten sendes uten AI-notat.');
      break;
    }

    var batch = treffABehandle.slice(start, start + AI_BATCH_STORRELSE);
    var foresporsler = batch.map(function (treff) {
      return byggAiForesporsel(treff, apiKey, aiModell);
    });

    var responser;
    try {
      responser = UrlFetchApp.fetchAll(foresporsler);
    } catch (e) {
      var batchFeil = 'Nettverksfeil ved batch-kall til Claude (' + batch.length + ' treff hoppet over): ' + e.message;
      Logger.log(batchFeil);
      statistikk.feil.push(batchFeil);
      continue; // prov neste batch i stedet for a stoppe helt
    }

    var trengerRetry = [];

    for (var i = 0; i < batch.length; i++) {
      statistikk.antallKall++;
      var kildeTekst = batch[i].tittel + ' ' + (batch[i].ingress || '');
      var tolket = tolkAiRespons(responser[i], aiModell, kildeTekst);

      if (tolket.stoppMelding) {
        // Utgiftstak nadd - stopp ALT videre AI-arbeid umiddelbart, ikke
        // bare resten av denne batchen.
        statistikk.stoppetTidlig = true;
        statistikk.stoppArsak = tolket.stoppMelding;
        statistikk.feil.push(tolket.stoppMelding);
        Logger.log('STOPPER AI-steget (ingen nye forsok): ' + tolket.stoppMelding);
        return statistikk;
      }

      anvendTolketResultatPaaTreff(batch[i], tolket, statistikk);

      if (tolket.parseFeilet) {
        trengerRetry.push(batch[i]);
      }
    }

    // --- Retry (maks en gang per treff) for de der AI-svaret ikke kunne
    // tolkes - teller i antallKall/kostnad, og kostnadsstoppen gjelder likt.
    if (trengerRetry.length > 0) {
      Logger.log('Forsoker pa nytt for ' + trengerRetry.length + ' treff der AI-svaret ikke kunne tolkes...');
      var retryForesporsler = trengerRetry.map(function (treff) {
        return byggAiForesporsel(treff, apiKey, aiModell);
      });

      var retryResponser;
      try {
        retryResponser = UrlFetchApp.fetchAll(retryForesporsler);
      } catch (e) {
        var retryNettverksfeil = 'Nettverksfeil ved retry-kall til Claude (' + trengerRetry.length + ' treff): ' + e.message;
        Logger.log(retryNettverksfeil);
        statistikk.feil.push(retryNettverksfeil);
        retryResponser = null;
      }

      if (retryResponser) {
        for (var r = 0; r < trengerRetry.length; r++) {
          statistikk.antallKall++;
          var retryTreff = trengerRetry[r];
          var retryKildeTekst = retryTreff.tittel + ' ' + (retryTreff.ingress || '');
          var retryTolket = tolkAiRespons(retryResponser[r], aiModell, retryKildeTekst);

          if (retryTolket.stoppMelding) {
            statistikk.stoppetTidlig = true;
            statistikk.stoppArsak = retryTolket.stoppMelding;
            statistikk.feil.push(retryTolket.stoppMelding);
            Logger.log('STOPPER AI-steget (ingen nye forsok): ' + retryTolket.stoppMelding);
            return statistikk;
          }

          anvendTolketResultatPaaTreff(retryTreff, retryTolket, statistikk);

          if (retryTolket.parseFeilet) {
            statistikk.antallParseFeil++;
            retryTreff.aiParseFeilet = true;
            sisteRaFeilTekst = retryTolket.raFeilTekst || '(ingen rafeil-tekst)';
            Logger.log('  Parse-feil (etter retry) for "' + retryTreff.tittel + '": ' + sisteRaFeilTekst);
          }
        }
      } else {
        // Retry-batchen feilet helt pa nettverksniva - behold forste forsoks
        // resultat (allerede relevant=true/tom kategori via anvendTolketResultatPaaTreff).
        for (var rr = 0; rr < trengerRetry.length; rr++) {
          statistikk.antallParseFeil++;
          trengerRetry[rr].aiParseFeilet = true;
        }
      }
    }
  }

  if (statistikk.antallParseFeil > 0) {
    statistikk.feil.push(statistikk.antallParseFeil + ' parse-feil denne kjoringen (etter retry).' +
      (sisteRaFeilTekst ? ' Siste rå feil: ' + sisteRaFeilTekst.substring(0, 200) : ''));
  }

  Logger.log('AI-steget ferdig: ' + statistikk.antallKall + ' kall, ' +
    statistikk.tokensInn + ' tokens inn, ' + statistikk.tokensUt + ' tokens ut, ' +
    '$' + statistikk.kostnad.toFixed(4) + ' anslatt kostnad, ' +
    statistikk.antallParseFeil + ' parse-feil.');

  return statistikk;
}

/**
 * Bygger ett enkelt foresporsel-objekt i formatet UrlFetchApp.fetchAll()
 * forventer (samme felt som options-objektet til UrlFetchApp.fetch(), pluss
 * "url").
 *
 * @param {Object} treff
 * @param {string} apiKey
 * @param {string} aiModell
 * @return {Object}
 */
function byggAiForesporsel(treff, apiKey, aiModell) {
  var brukerTekst = 'Overskrift: ' + treff.tittel + '\nIngress: ' + treff.ingress +
    (treff.kilde ? '\nKilde: ' + treff.kilde : '');

  var requestBody = {
    model: aiModell,
    max_tokens: 300,
    system: AI_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: brukerTekst }
    ]
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
 * Tolker ett HTTPResponse-objekt fra et AI-kall (bade fra enkeltkall og fra
 * UrlFetchApp.fetchAll()-batcher) til et ensartet resultat. HTTP-feil og
 * nadd utgiftstak (sjekkForUtgiftstakStopp()) handteres her, som for -
 * fortsatt "usikker" (relevant: null) for disse, siden det er en annen
 * feiltype enn et JSON-parse-problem i selve AI-svaret. Selve innholdet i
 * et vellykket (HTTP 200) svar tolkes av den delte tolkAiKategoriseringsSvar()
 * i 09_AITest.gs, som runAiTest() ogsa bruker - garanterer identisk tolkning.
 *
 * kildeTekstForNevnerOss (overskrift+ingress) sendes med i ALLE tilfeller,
 * ogsa HTTP-feil/utgiftstak, slik at et kode-basert "nevner oss"-treff
 * (OUR_NAMES i 09_AITest.gs) aldri forsvinner bare fordi AI-kallet feiler.
 *
 * @param {HTTPResponse} httpRespons
 * @param {string} aiModell
 * @param {string} kildeTekstForNevnerOss
 * @return {{relevant:(boolean|null), kategori:(string|undefined),
 *   nevnerOss:(boolean|undefined), notat:string,
 *   irrelevantGrunn:(string|undefined), parseFeilet:(boolean|undefined),
 *   raFeilTekst:(string|undefined), tokensInn:(number|undefined),
 *   tokensUt:(number|undefined), kostnad:(number|undefined),
 *   feilmelding:(string|undefined), stoppMelding:(string|undefined)}}
 */
function tolkAiRespons(httpRespons, aiModell, kildeTekstForNevnerOss) {
  var httpKode = httpRespons.getResponseCode();
  var raTekst = httpRespons.getContentText();
  var svarJson = parseJsonTrygt(raTekst);

  var utgiftstakMelding = sjekkForUtgiftstakStopp(httpKode, svarJson);
  if (utgiftstakMelding) {
    var kodeTreffUtgiftstak = nevnerOssIKode(kildeTekstForNevnerOss);
    return {
      relevant: null, kategori: '', nevnerOss: kodeTreffUtgiftstak,
      nevnerOssKilde: kodeTreffUtgiftstak ? 'kode' : '', notat: '', stoppMelding: utgiftstakMelding
    };
  }

  if (httpKode < 200 || httpKode >= 300) {
    var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
      svarJson.error.message : raTekst.substring(0, 300);
    var kodeTreffHttp = nevnerOssIKode(kildeTekstForNevnerOss);
    return {
      relevant: null, kategori: '', nevnerOss: kodeTreffHttp,
      nevnerOssKilde: kodeTreffHttp ? 'kode' : '', notat: '',
      feilmelding: 'HTTP-feil ' + httpKode + ': ' + feilmelding
    };
  }

  var tokensInn = (svarJson && svarJson.usage) ? svarJson.usage.input_tokens : undefined;
  var tokensUt = (svarJson && svarJson.usage) ? svarJson.usage.output_tokens : undefined;
  var kostnadVerdi = beregnKostnad(aiModell, tokensInn, tokensUt);
  var kostnad = (typeof kostnadVerdi === 'number') ? kostnadVerdi : undefined;

  var tekstBlokk = hentForsteTekstBlokk(svarJson);
  var tolket = tolkAiKategoriseringsSvar(tekstBlokk, kildeTekstForNevnerOss);

  return {
    relevant: tolket.relevant,
    kategori: tolket.kategori,
    nevnerOss: tolket.nevnerOss,
    nevnerOssKilde: tolket.nevnerOssKilde,
    notat: tolket.notat,
    irrelevantGrunn: tolket.irrelevantGrunn,
    parseFeilet: tolket.parseFeilet,
    raFeilTekst: tolket.parseFeilet ? byggRaFeilTekst(tekstBlokk, svarJson) : undefined,
    tokensInn: tokensInn,
    tokensUt: tokensUt,
    kostnad: kostnad
  };
}

/**
 * Slar sammen treffPerKategori (kategori -> liste) til en enkelt flat
 * liste, uten a kopiere selve treff-objektene (samme referanser - mutasjon
 * av et treff i den flate listen pavirker ogsa originalen i
 * treffPerKategori, som er noyaktig det vurderTreffMedAI() er ment a gjore).
 *
 * @param {Object} treffPerKategori
 * @return {Array<Object>}
 */
function samleAlleTreff(treffPerKategori) {
  var alle = [];
  var kategorier = Object.keys(treffPerKategori);
  for (var i = 0; i < kategorier.length; i++) {
    alle = alle.concat(treffPerKategori[kategorier[i]]);
  }
  return alle;
}

/**
 * Logger AI-kjoringsstatistikk for dagens kjoring til "Kjøretidslogg".
 * Oppretter fanen automatisk (med overskrifter) forste gang den trengs.
 *
 * Feil-kolonnen samler na ogsa eventuelle logo-/e-postmal-feil fra
 * 11_EpostMerkevare.gs (se kallet i 07_Hovedkjoring.gs) - ikke bare
 * AI-feil - siden dette er det ene stedet i regnearket som samler
 * "noe gikk galt denne kjoringen, men e-posten ble sendt likevel".
 *
 * @param {Spreadsheet} ss
 * @param {Object} statistikk - se vurderTreffMedAI(). .feil kan inneholde
 *   bade AI-, logo- og e-postmal-feilmeldinger, slatt sammen av kalleren.
 */
function loggAiKjoretid(ss, statistikk) {
  var ark = ss.getSheetByName(FANE_KJORETIDSLOGG);
  if (!ark) {
    ark = ss.insertSheet(FANE_KJORETIDSLOGG);
    var overskrifter = ['Tidspunkt', 'Antall kall', 'Tokens inn', 'Tokens ut', 'Anslått kostnad USD', 'Feil'];
    ark.getRange(1, 1, 1, overskrifter.length).setValues([overskrifter]);
    ark.getRange(1, 1, 1, overskrifter.length).setFontWeight('bold');
    ark.setFrozenRows(1);
  }

  var feilTekst = statistikk.feil.length > 0 ? statistikk.feil.join(' | ') : '';
  ark.appendRow([
    new Date(),
    statistikk.antallKall,
    statistikk.tokensInn,
    statistikk.tokensUt,
    Math.round(statistikk.kostnad * 1000000) / 1000000,
    feilTekst
  ]);
}
