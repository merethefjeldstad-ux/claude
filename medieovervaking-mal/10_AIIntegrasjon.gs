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
 * Vurderer en liste med NYE treff (allerede filtrert mot "Sendte artikler"
 * av kjorMedieovervaking() for denne kalles) med Claude: relevans (true/
 * false) og et kort notat. Muterer HVERT treff-objekt i listen direkte med:
 *   treff.aiRelevant    - true / false / null (null = ikke vurdert)
 *   treff.aiNotat       - string (tom hvis ikke vurdert)
 *   treff.aiBegrunnelse - string (AI-ens begrunnelse for relevansvurderingen,
 *                         tom hvis ikke vurdert - brukt i e-postens "Mulig
 *                         irrelevant"-seksjon, se 11_EpostMerkevare.gs)
 *
 * @param {Array<Object>} treffListe - treff-objekter med minst
 *   {tittel, ingress, kilde, lenke}
 * @return {{antallKall:number, tokensInn:number, tokensUt:number,
 *   kostnad:number, feil:Array<string>, stoppetTidlig:boolean,
 *   stoppArsak:string}}
 */
function vurderTreffMedAI(treffListe) {
  var statistikk = {
    antallKall: 0,
    tokensInn: 0,
    tokensUt: 0,
    kostnad: 0,
    feil: [],
    stoppetTidlig: false,
    stoppArsak: ''
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

    for (var i = 0; i < batch.length; i++) {
      statistikk.antallKall++;
      var tolket = tolkAiRespons(responser[i], aiModell);

      if (tolket.stoppMelding) {
        // Utgiftstak nadd - stopp ALT videre AI-arbeid umiddelbart, ikke
        // bare resten av denne batchen.
        statistikk.stoppetTidlig = true;
        statistikk.stoppArsak = tolket.stoppMelding;
        statistikk.feil.push(tolket.stoppMelding);
        Logger.log('STOPPER AI-steget (ingen nye forsok): ' + tolket.stoppMelding);
        return statistikk;
      }

      batch[i].aiRelevant = tolket.relevant;
      batch[i].aiNotat = tolket.notat || '';
      batch[i].aiBegrunnelse = tolket.begrunnelse || '';

      if (tolket.feilmelding) {
        statistikk.feil.push('"' + batch[i].tittel + '": ' + tolket.feilmelding);
      }
      if (typeof tolket.tokensInn === 'number') statistikk.tokensInn += tolket.tokensInn;
      if (typeof tolket.tokensUt === 'number') statistikk.tokensUt += tolket.tokensUt;
      if (typeof tolket.kostnad === 'number') statistikk.kostnad += tolket.kostnad;
    }
  }

  Logger.log('AI-steget ferdig: ' + statistikk.antallKall + ' kall, ' +
    statistikk.tokensInn + ' tokens inn, ' + statistikk.tokensUt + ' tokens ut, ' +
    '$' + statistikk.kostnad.toFixed(4) + ' anslatt kostnad.');

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
 * UrlFetchApp.fetchAll()-batcher) til et ensartet resultat. Samme
 * feilhandtering som runAiTest() i 09_AITest.gs: robust JSON-parsing med
 * fallback til "usikker" (relevant: null), og samme sjekk for nadd
 * utgiftstak via sjekkForUtgiftstakStopp().
 *
 * @param {HTTPResponse} httpRespons
 * @param {string} aiModell
 * @return {{relevant:(boolean|null), notat:string, tokensInn:(number|undefined),
 *   tokensUt:(number|undefined), kostnad:(number|undefined),
 *   feilmelding:(string|undefined), stoppMelding:(string|undefined)}}
 */
function tolkAiRespons(httpRespons, aiModell) {
  var httpKode = httpRespons.getResponseCode();
  var raTekst = httpRespons.getContentText();
  var svarJson = parseJsonTrygt(raTekst);

  var utgiftstakMelding = sjekkForUtgiftstakStopp(httpKode, svarJson);
  if (utgiftstakMelding) {
    return { relevant: null, notat: '', stoppMelding: utgiftstakMelding };
  }

  if (httpKode < 200 || httpKode >= 300) {
    var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
      svarJson.error.message : raTekst.substring(0, 300);
    return { relevant: null, notat: '', feilmelding: 'HTTP-feil ' + httpKode + ': ' + feilmelding };
  }

  var tokensInn = (svarJson && svarJson.usage) ? svarJson.usage.input_tokens : undefined;
  var tokensUt = (svarJson && svarJson.usage) ? svarJson.usage.output_tokens : undefined;
  var kostnadVerdi = beregnKostnad(aiModell, tokensInn, tokensUt);
  var kostnad = (typeof kostnadVerdi === 'number') ? kostnadVerdi : undefined;

  var tekstBlokk = hentForsteTekstBlokk(svarJson);
  var tolketJson = tekstBlokk ? parseAiSvarJson(tekstBlokk) : null;

  if (!tolketJson || typeof tolketJson.relevant !== 'boolean') {
    return {
      relevant: null,
      notat: '',
      begrunnelse: '',
      tokensInn: tokensInn,
      tokensUt: tokensUt,
      kostnad: kostnad,
      feilmelding: 'Klarte ikke a tolke AI-svaret som gyldig JSON.'
    };
  }

  return {
    relevant: tolketJson.relevant,
    notat: tolketJson.notat || '',
    begrunnelse: tolketJson.begrunnelse || '',
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
