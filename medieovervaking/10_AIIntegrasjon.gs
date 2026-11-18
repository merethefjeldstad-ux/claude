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

// ---------------------------------------------------------------------
// Steg E3: hvilket tekstgrunnlag AI-kallet som PAVIRKER E-POSTEN bruker,
// for treff fra kilder i KILDER_MED_HELSIDE (14_Tekstgrunnlag.gs). Treff
// fra andre kilder bruker ALLTID "ingress" uansett denne verdien - det
// finnes ingen hel side a hente for dem.
//   "ingress"   - STANDARD. Eksakt samme oppforsel som for Steg E3 (tittel
//                 + RSS-ingress) - se Steg A, punkt 1.
//   "hel side"  - extractMainContent() av hele siden.
//   "kontekst"  - RSS-ingress + extractKeywordContext()-utdrag fra siden.
// IKKE endre denne til noe annet enn "ingress" uten a ha sett ekte
// E2-resultater (runTekstgrunnlagTest(), 15_TekstgrunnlagTest.gs) for de
// aktuelle kildene FORST, og uten at KILDER_MED_HELSIDE er fylt ut.
// ---------------------------------------------------------------------
var TEKSTGRUNNLAG_MODUS = 'ingress';

// Skyggemodus: nar true, kjores i TILLEGG en ekstra AI-foresporsel med
// TEKSTGRUNNLAG_MODUS-varianten for treff fra KILDER_MED_HELSIDE, KUN for
// logging/sammenligning (Skygge-*-kolonnene i Artikkellogg, se
// 12_Artikkellogg.gs). E-posten bygges UANSETT fra "ingress"-resultatet
// nar denne er true - det er selve poenget: man kan prove ut "hel side"/
// "kontekst" i produksjon uten at det kan pavirke hva som sendes ut.
// STANDARD false (av).
var SKYGGE_TEKSTGRUNNLAG = false;

// Maks antall EKSTRA (skygge-)kall per kjoring - helt separat fra, og i
// tillegg til, AI_MAKS_KALL_PER_KJORING.
var SKYGGE_TEKSTGRUNNLAG_MAKS_EKSTRAKALL = 10;

// Batch-storrelse for sidehenting (UrlFetchApp.fetchAll()) nar et utvidet
// tekstgrunnlag (hel side/kontekst) skal bygges - egen konstant fra
// AI_BATCH_STORRELSE siden sidehenting og AI-kall er to ulike nettverkskall.
var TEKSTGRUNNLAG_HENTING_BATCH = 5;

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
  treff.aiSammendrag = tolket.sammendrag || '';
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
 *   treff.aiSammendrag    - string, KI-skrevet sammendrag som erstatter rå
 *                           RSS-ingress i e-posten, tom hvis ikke vurdert
 *                           (da brukes rå ingress som fallback, se
 *                           11_EpostMerkevare.gs)
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

  // Steg E3: utvidet tekstgrunnlag for PRIMAERKALLET (det som pavirker
  // e-posten), KUN nar TEKSTGRUNNLAG_MODUS er endret fra standarden
  // "ingress". Hentingen star i egen try/catch - hvis den feiler helt,
  // fortsetter resten av AI-steget som om TEKSTGRUNNLAG_MODUS var "ingress"
  // (kartet blir da tomt, og alle treff faller tilbake til ingress under).
  var primaerTekstgrunnlagKart = {};
  if (TEKSTGRUNNLAG_MODUS !== 'ingress') {
    try {
      primaerTekstgrunnlagKart = hentUtvidetTekstgrunnlagForTreff(treffABehandle, TEKSTGRUNNLAG_MODUS);
    } catch (e) {
      Logger.log('Henting av utvidet tekstgrunnlag (TEKSTGRUNNLAG_MODUS="' + TEKSTGRUNNLAG_MODUS +
        '") feilet helt - alle treff bruker ingress denne kjoringen: ' + e.message);
      primaerTekstgrunnlagKart = {};
    }
  }

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
    batch.forEach(function (treff) {
      treff.tekstgrunnlag = primaerTekstgrunnlagKart[treff.lenke] ? TEKSTGRUNNLAG_MODUS : 'ingress';
    });
    var foresporsler = batch.map(function (treff) {
      return byggAiForesporsel(treff, apiKey, aiModell, primaerTekstgrunnlagKart[treff.lenke]);
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
      } else if (batch[i].tekstgrunnlag !== 'ingress') {
        // Steg E3: sammendraget er skrevet fra et utvidet tekstgrunnlag
        // (hel side/kontekst) - valider det mot SAMME tekst for a fange opp
        // oppdiktede egennavn/tall. Ved avvik faller e-posten automatisk
        // tilbake til ra ingress (se anvendValideringAvUtvidetSammendrag()
        // og visningstekst-logikken i 11_EpostMerkevare.gs) - ingen ny tekst
        // i selve e-posten.
        anvendValideringAvUtvidetSammendrag(batch[i], primaerTekstgrunnlagKart[batch[i].lenke]);
      }
    }

    // --- Retry (maks en gang per treff) for de der AI-svaret ikke kunne
    // tolkes - teller i antallKall/kostnad, og kostnadsstoppen gjelder likt.
    if (trengerRetry.length > 0) {
      Logger.log('Forsoker pa nytt for ' + trengerRetry.length + ' treff der AI-svaret ikke kunne tolkes...');
      var retryForesporsler = trengerRetry.map(function (treff) {
        return byggAiForesporsel(treff, apiKey, aiModell, primaerTekstgrunnlagKart[treff.lenke]);
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
          } else if (retryTreff.tekstgrunnlag !== 'ingress') {
            anvendValideringAvUtvidetSammendrag(retryTreff, primaerTekstgrunnlagKart[retryTreff.lenke]);
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

  // Steg E3 skyggemodus - egen try/catch slik at en feil her ALDRI kan
  // hindre at statistikken over (fra det ordinaere AI-steget, som allerede
  // er ferdig) kommer frem til loggAiKjoretid()/e-postutsendingen.
  if (!statistikk.stoppetTidlig) {
    try {
      kjorSkyggemodusEkstrakall(treffABehandle, apiKey, aiModell, aiStartTid, statistikk);
    } catch (e) {
      var skyggeFeil = 'Uventet feil i SKYGGE_TEKSTGRUNNLAG - pavirker IKKE e-postutsendingen: ' + e.message;
      Logger.log(skyggeFeil);
      statistikk.feil.push(skyggeFeil);
    }
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
 * @param {string} [utvidetTekstgrunnlag] - Steg E3: hvis satt, brukes denne
 *   teksten (hel side/kontekst, se hentUtvidetTekstgrunnlagForTreff() under
 *   og byggBrukerTekstMedUtvidetTekstgrunnlag() i 14_Tekstgrunnlag.gs) i
 *   stedet for tittel+ingress. Utelatt/tom = eksakt samme brukertekst som
 *   for Steg E3.
 * @return {Object}
 */
function byggAiForesporsel(treff, apiKey, aiModell, utvidetTekstgrunnlag) {
  var brukerTekst = utvidetTekstgrunnlag ?
    byggBrukerTekstMedUtvidetTekstgrunnlag(treff.tittel, treff.kilde, utvidetTekstgrunnlag) :
    'Overskrift: ' + treff.tittel + '\nIngress: ' + treff.ingress +
      (treff.kilde ? '\nKilde: ' + treff.kilde : '');

  var requestBody = {
    model: aiModell,
    max_tokens: 500,
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
      relevant: null, kategori: '', sammendrag: '', nevnerOss: kodeTreffUtgiftstak,
      nevnerOssKilde: kodeTreffUtgiftstak ? 'kode' : '', notat: '', stoppMelding: utgiftstakMelding
    };
  }

  if (httpKode < 200 || httpKode >= 300) {
    var feilmelding = (svarJson && svarJson.error && svarJson.error.message) ?
      svarJson.error.message : raTekst.substring(0, 300);
    var kodeTreffHttp = nevnerOssIKode(kildeTekstForNevnerOss);
    return {
      relevant: null, kategori: '', sammendrag: '', nevnerOss: kodeTreffHttp,
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
    sammendrag: tolket.sammendrag,
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
 * Steg C: Modell-ID og Promptversjon er lagt til som kolonne G/H (til
 * HOYRE for de eksisterende A-F, som er uendret). Begge star tomme hvis
 * AI faktisk ikke ble kalt denne kjoringen (statistikk.antallKall === 0 -
 * AI av, eller feilet for forste kall), for a unnga a antyde at en modell
 * ble brukt nar den ikke ble det.
 *
 * @param {Spreadsheet} ss
 * @param {Object} statistikk - se vurderTreffMedAI(). .feil kan inneholde
 *   bade AI-, logo- og e-postmal-feilmeldinger, slatt sammen av kalleren.
 */
function loggAiKjoretid(ss, statistikk) {
  var ark = ss.getSheetByName(FANE_KJORETIDSLOGG);
  if (!ark) {
    ark = ss.insertSheet(FANE_KJORETIDSLOGG);
    var overskrifter = ['Tidspunkt', 'Antall kall', 'Tokens inn', 'Tokens ut', 'Anslått kostnad USD', 'Feil', 'Modell-ID', 'Promptversjon'];
    ark.getRange(1, 1, 1, overskrifter.length).setValues([overskrifter]);
    ark.getRange(1, 1, 1, overskrifter.length).setFontWeight('bold');
    ark.setFrozenRows(1);
  }
  sikreKjoretidsloggKolonner(ark);

  var feilTekst = statistikk.feil.length > 0 ? statistikk.feil.join(' | ') : '';
  var aiModell = statistikk.antallKall > 0 ? (PropertiesService.getScriptProperties().getProperty('AI_MODEL') || '') : '';
  var promptversjon = statistikk.antallKall > 0 ? PROMPT_VERSION : '';

  ark.appendRow([
    new Date(),
    statistikk.antallKall,
    statistikk.tokensInn,
    statistikk.tokensUt,
    Math.round(statistikk.kostnad * 1000000) / 1000000,
    feilTekst,
    aiModell,
    promptversjon
  ]);
}

/**
 * Sikrer at "Kjøretidslogg" har de 8 kolonnene (inkl. Modell-ID/
 * Promptversjon lagt til i Steg C). Eldre ark som kun hadde de 6 forste
 * kolonnene far de to nye overskriftene lagt til automatisk til HOYRE -
 * ingen manuell oppdatering av eksisterende ark er nodvendig, samme
 * monster som sikreSendteArtiklerKolonner() i 05_Deduplisering.gs.
 *
 * @param {Sheet} ark
 */
function sikreKjoretidsloggKolonner(ark) {
  if (ark.getLastColumn() >= 8) return;

  var nyeOverskrifter = ['Modell-ID', 'Promptversjon'];
  ark.getRange(1, 7, 1, nyeOverskrifter.length).setValues([nyeOverskrifter]);
  ark.getRange(1, 7, 1, nyeOverskrifter.length).setFontWeight('bold');
}

/**
 * Steg E3: henter hele siden (batchet via UrlFetchApp.fetchAll()) for treff
 * fra kilder i KILDER_MED_HELSIDE (14_Tekstgrunnlag.gs) og bygger utvidet
 * tekstgrunnlag for modusVerdi:
 *   "hel side"  - extractMainContent() av hele siden.
 *   "kontekst"  - treff.ingress + extractKeywordContext()-utdrag fra siden,
 *                 rundt treff.matchendeOrd[0] (samme sokeord som allerede
 *                 er funnet a matche denne artikkelen).
 *
 * Brukt av BADE primaerkallet i vurderTreffMedAI() (nar TEKSTGRUNNLAG_MODUS
 * != "ingress") og skyggemodus-ekstrakallene (kjorSkyggemodusEkstrakall()
 * under).
 *
 * Treff som IKKE er fra en kilde i KILDER_MED_HELSIDE, der sidehenting
 * feiler (nettverk/HTTP-feil), eller der extractMainContent() gir tom
 * streng (betalingsmur eller ukjent struktur - IKKE noe forsok pa a omga
 * dette, se 14_Tekstgrunnlag.gs), far INGEN oppforing i det returnerte
 * kartet - kalleren faller da tilbake til ingress for disse. Kaster ALDRI
 * videre - en feil for ett enkelt treff skal aldri stoppe de andre.
 *
 * @param {Array<Object>} treffListe
 * @param {string} modusVerdi - "hel side" | "kontekst"
 * @return {Object} kart fra treff.lenke -> utvidet tekstgrunnlag (string)
 */
function hentUtvidetTekstgrunnlagForTreff(treffListe, modusVerdi) {
  var resultat = {};
  var aktuelle = treffListe.filter(function (treff) {
    return erDomeneIListe(treff.lenke, KILDER_MED_HELSIDE);
  });
  if (aktuelle.length === 0) return resultat;

  for (var start = 0; start < aktuelle.length; start += TEKSTGRUNNLAG_HENTING_BATCH) {
    var batch = aktuelle.slice(start, start + TEKSTGRUNNLAG_HENTING_BATCH);
    var foresporsler = batch.map(function (treff) {
      return {
        url: treff.lenke,
        method: 'get',
        headers: { 'User-Agent': TEKSTGRUNNLAG_USER_AGENT },
        muteHttpExceptions: true,
        followRedirects: true
      };
    });

    var responser;
    try {
      responser = UrlFetchApp.fetchAll(foresporsler);
    } catch (e) {
      Logger.log('Sidehenting for utvidet tekstgrunnlag feilet for en batch pa ' + batch.length +
        ' treff (faller tilbake til ingress for disse): ' + e.message);
      continue;
    }

    for (var i = 0; i < batch.length; i++) {
      try {
        var httpKode = responser[i].getResponseCode();
        if (httpKode < 200 || httpKode >= 300) continue;

        var hovedinnhold = extractMainContent(responser[i].getContentText());
        if (!hovedinnhold) continue; // betalingsmur/ukjent struktur -> ingress brukes

        if (modusVerdi === 'kontekst') {
          var sokeord = (batch[i].matchendeOrd && batch[i].matchendeOrd[0]) || '';
          var utdrag = sokeord ? extractKeywordContext(hovedinnhold, sokeord) : [];
          resultat[batch[i].lenke] = (batch[i].ingress || '') +
            (utdrag.length > 0 ? '\n\n' + utdrag.join('\n\n(...)\n\n') : '');
        } else {
          resultat[batch[i].lenke] = hovedinnhold;
        }
      } catch (e) {
        Logger.log('Bygging av utvidet tekstgrunnlag feilet for "' + batch[i].tittel +
          '" (faller tilbake til ingress): ' + e.message);
      }
    }
  }

  return resultat;
}

/**
 * Steg E3: validerer et AI-skrevet sammendrag (skrevet fra et UTVIDET
 * tekstgrunnlag - hel side/kontekst) mot SAMME tekst, via validateSummary()
 * i 14_Tekstgrunnlag.gs. Ved avvik (for mange uverifiserte egennavn/tall)
 * tommes treff.aiSammendrag, slik at e-posten AUTOMATISK faller tilbake til
 * ra ingress - eksakt samme fallback-mekanisme som allerede brukes ved
 * parse-feil (se visningstekst-linjene i 11_EpostMerkevare.gs). Ingen nytt
 * element vises i e-posten - kun treff.aiValideringsFeilet settes, lest av
 * bestemKiVurdering() i 12_Artikkellogg.gs (Artikkellogg/etterprovbarhet).
 *
 * @param {Object} treff
 * @param {string} utvidetTekstgrunnlag - teksten sammendraget faktisk ble skrevet fra
 */
function anvendValideringAvUtvidetSammendrag(treff, utvidetTekstgrunnlag) {
  var validering = validateSummary(treff.aiSammendrag, utvidetTekstgrunnlag);
  if (!validering.gyldig) {
    treff.aiSammendrag = '';
    treff.aiValideringsFeilet = true;
  }
}

/**
 * Steg E3 skyggemodus: kjorer EKSTRA AI-foresporsler (pavirker ALDRI
 * e-posten) for a sammenligne TEKSTGRUNNLAG_MODUS-varianten mot "ingress",
 * for et utvalg av dagens treff fra KILDER_MED_HELSIDE. Resultatet skrives
 * KUN til egne treff.aiSkygge*-felt (lest av byggArtikkelloggRad() i
 * 12_Artikkellogg.gs) - rorer ALDRI treff.aiRelevant/aiKategori/
 * aiSammendrag/aiNevnerOss/aiNotat/aiIrrelevantGrunn.
 *
 * Gjor ingenting hvis SKYGGE_TEKSTGRUNNLAG er av, TEKSTGRUNNLAG_MODUS er
 * "ingress" (ingenting a sammenligne med), eller tidsbudsjettet (samme
 * AI_TIDSBUDSJETT_MS, delt klokke med hovedlopet via aiStartTid) allerede
 * er brukt opp. Respekterer kostnadsstoppen pa eksakt samme mate som
 * hovedlopet (tolkAiRespons() -> sjekkForUtgiftstakStopp(), uendret logikk)
 * - stopper umiddelbart, uten flere forsok, hvis taket er nadd. Kaster
 * ALDRI videre - en feil her skal aldri hindre at e-posten sendes
 * (kalleren, vurderTreffMedAI(), har allerede en egen try/catch rundt dette
 * kallet).
 *
 * @param {Array<Object>} treffABehandle - samme liste (og samme objekter)
 *   som allerede er vurdert av hovedlopet i vurderTreffMedAI()
 * @param {string} apiKey
 * @param {string} aiModell
 * @param {number} aiStartTid - delt klokke med hovedlopet
 * @param {Object} statistikk - muteres med antallKall/tokensInn/tokensUt/
 *   kostnad/feil for de ekstra kallene (reell kostnad - skal telle med i
 *   Kjoretidslogg)
 */
function kjorSkyggemodusEkstrakall(treffABehandle, apiKey, aiModell, aiStartTid, statistikk) {
  if (!SKYGGE_TEKSTGRUNNLAG) return;
  if (TEKSTGRUNNLAG_MODUS === 'ingress') {
    Logger.log('SKYGGE_TEKSTGRUNNLAG er pa, men TEKSTGRUNNLAG_MODUS er "ingress" - ingenting a sammenligne med, hopper over.');
    return;
  }

  var kandidater = treffABehandle.filter(function (treff) {
    return erDomeneIListe(treff.lenke, KILDER_MED_HELSIDE);
  }).slice(0, SKYGGE_TEKSTGRUNNLAG_MAKS_EKSTRAKALL);

  if (kandidater.length === 0) return;

  if (new Date().getTime() - aiStartTid > AI_TIDSBUDSJETT_MS) {
    Logger.log('SKYGGE_TEKSTGRUNNLAG: tidsbudsjettet er allerede brukt opp - hopper over alle ' +
      kandidater.length + ' skygge-kall denne kjoringen.');
    return;
  }

  Logger.log('SKYGGE_TEKSTGRUNNLAG: kjorer opp til ' + kandidater.length + ' ekstra kall (variant "' +
    TEKSTGRUNNLAG_MODUS + '") for sammenligning - pavirker ALDRI e-posten.');

  var tekstgrunnlagKart = hentUtvidetTekstgrunnlagForTreff(kandidater, TEKSTGRUNNLAG_MODUS);

  for (var start = 0; start < kandidater.length; start += AI_BATCH_STORRELSE) {
    if (new Date().getTime() - aiStartTid > AI_TIDSBUDSJETT_MS) {
      Logger.log('SKYGGE_TEKSTGRUNNLAG: tidsbudsjettet ble brukt opp underveis - resten hoppes over denne kjoringen.');
      break;
    }

    var batch = kandidater.slice(start, start + AI_BATCH_STORRELSE).filter(function (treff) {
      return !!tekstgrunnlagKart[treff.lenke];
    });
    if (batch.length === 0) continue;

    var foresporsler = batch.map(function (treff) {
      return byggAiForesporsel(treff, apiKey, aiModell, tekstgrunnlagKart[treff.lenke]);
    });

    var responser;
    try {
      responser = UrlFetchApp.fetchAll(foresporsler);
    } catch (e) {
      var batchFeil = 'SKYGGE_TEKSTGRUNNLAG: nettverksfeil ved ekstra AI-kall (' + batch.length + ' treff hoppet over): ' + e.message;
      Logger.log(batchFeil);
      statistikk.feil.push(batchFeil);
      continue;
    }

    for (var i = 0; i < batch.length; i++) {
      statistikk.antallKall++;
      var treff = batch[i];
      var kildeTekst = treff.tittel + ' ' + (treff.ingress || '');
      var tolket = tolkAiRespons(responser[i], aiModell, kildeTekst);

      if (tolket.stoppMelding) {
        statistikk.stoppetTidlig = true;
        statistikk.stoppArsak = tolket.stoppMelding;
        statistikk.feil.push(tolket.stoppMelding);
        Logger.log('SKYGGE_TEKSTGRUNNLAG: STOPPER (utgiftstak nadd, ingen flere forsok) - ' + tolket.stoppMelding);
        return;
      }

      if (typeof tolket.tokensInn === 'number') statistikk.tokensInn += tolket.tokensInn;
      if (typeof tolket.tokensUt === 'number') statistikk.tokensUt += tolket.tokensUt;
      if (typeof tolket.kostnad === 'number') statistikk.kostnad += tolket.kostnad;
      if (tolket.feilmelding) statistikk.feil.push('SKYGGE_TEKSTGRUNNLAG "' + treff.tittel + '": ' + tolket.feilmelding);

      treff.aiSkyggeTekstgrunnlag = TEKSTGRUNNLAG_MODUS;
      treff.aiSkyggeTokensInn = tolket.tokensInn;
      treff.aiSkyggeTokensUt = tolket.tokensUt;

      if (tolket.parseFeilet) {
        treff.aiSkyggeVurdering = 'Tvil';
        treff.aiSkyggeValidering = '';
      } else {
        treff.aiSkyggeVurdering = tolket.relevant === true ? 'Relevant' : (tolket.relevant === false ? 'Ikke relevant' : 'Ikke vurdert');
        var validering = validateSummary(tolket.sammendrag, tekstgrunnlagKart[treff.lenke]);
        treff.aiSkyggeValidering = validering.gyldig ?
          'Gyldig' : ('Ugyldig (' + validering.antallAvvik + ' avvik: ' + validering.avvikendeOrd.join(', ') + ')');
      }
    }
  }
}

/**
 * Steg E3: manuell, ISOLERT test av tekstgrunnlag-/skyggemodus-oppsettet i
 * vurderTreffMedAI() - UTEN å kjøre hele kjorMedieovervaking(). Ingen
 * RSS-henting, INGEN e-post, INGEN skriving til "Sendte artikler" eller
 * "Artikkellogg". Samme prinsipp som testArtikkellogg() (Steg B),
 * runRegression() (Steg D) og runTekstgrunnlagTest() (Steg E2): et
 * frittstaende verktoy for a se at justeringene faktisk virker, uten a
 * kjore en hel prosess som ville sendt e-post til mottakerne.
 *
 * Gjor fortsatt ETT (eller TO, hvis SKYGGE_TEKSTGRUNNLAG er pa) ekte,
 * BETALT AI-kall til Claude for akkurat denne ene artikkelen - samme
 * kostnadsniva som ett enkelt kall i runAiTest()/den daglige kjoringen.
 * Henter ogsa hele "lenke"-siden hvis domenet star i KILDER_MED_HELSIDE OG
 * TEKSTGRUNNLAG_MODUS ikke er "ingress".
 *
 * Kjor manuelt fra Apps Script-editoren: velg "testTekstgrunnlagIProduksjon"
 * i nedtrekksmenyen, endre parameterverdiene under til en artikkel du vil
 * teste med, og trykk "Kjor". Les resultatet i kjoringsloggen
 * (Vis -> Logger, eller Ctrl+Enter).
 *
 * @param {string} lenke - ekte, hentbar URL (kreves for a teste "hel side"/"kontekst")
 * @param {string} tittel
 * @param {string} [ingress]
 * @param {string} [kilde]
 * @param {string} [sokeord] - kun relevant for TEKSTGRUNNLAG_MODUS="kontekst" (extractKeywordContext)
 */
function testTekstgrunnlagIProduksjon(lenke, tittel, ingress, kilde, sokeord) {
  Logger.log('=== testTekstgrunnlagIProduksjon() ===');
  Logger.log('Rorer IKKE "Sendte artikler" eller "Artikkellogg". Sender INGEN e-post. ' +
    'Gjor derimot EKTE, BETALTE AI-kall (og evt. sidehenting) - se resultatet under.');

  if (!lenke || !tittel) {
    Logger.log('FEIL: "lenke" og "tittel" er pakrevd. Eksempel: ' +
      'testTekstgrunnlagIProduksjon("https://tu.no/en-sak", "En tittel", "En ingress", "TU", "hydrogen")');
    return;
  }

  Logger.log('Gjeldende oppsett: TEKSTGRUNNLAG_MODUS="' + TEKSTGRUNNLAG_MODUS + '", SKYGGE_TEKSTGRUNNLAG=' +
    SKYGGE_TEKSTGRUNNLAG + ', KILDER_MED_HELSIDE=' + JSON.stringify(KILDER_MED_HELSIDE) + '.');

  if (!erDomeneIListe(lenke, KILDER_MED_HELSIDE)) {
    Logger.log('MERK: domenet til "lenke" star IKKE i KILDER_MED_HELSIDE - denne artikkelen bruker derfor ' +
      'kun "ingress", uansett TEKSTGRUNNLAG_MODUS/SKYGGE_TEKSTGRUNNLAG. Legg domenet til i ' +
      '14_Tekstgrunnlag.gs forst hvis du vil teste "hel side"/"kontekst".');
  }

  var testTreff = {
    tittel: '[TEST] ' + tittel,
    ingress: ingress || '',
    kilde: kilde || '',
    lenke: lenke,
    matchendeOrd: sokeord ? [sokeord] : []
  };

  var statistikk = vurderTreffMedAI([testTreff]);

  Logger.log('--- Resultat ---');
  Logger.log('Tekstgrunnlag brukt (primaert, pavirker e-posten): "' + testTreff.tekstgrunnlag + '"');
  Logger.log('aiRelevant=' + testTreff.aiRelevant + ', aiKategori="' + testTreff.aiKategori +
    '", aiNevnerOss=' + testTreff.aiNevnerOss);
  Logger.log('aiSammendrag: ' + (testTreff.aiSammendrag || '(tom - e-posten faller tilbake til ingress)'));
  Logger.log('aiValideringsFeilet=' + !!testTreff.aiValideringsFeilet + (testTreff.aiValideringsFeilet ?
    ' (sammendraget hadde for mange uverifiserte egennavn/tall mot det utvidede tekstgrunnlaget - derfor tomt over)' : ''));
  Logger.log('KI-vurdering (samme klassifisering som Artikkellogg): ' + bestemKiVurdering(testTreff));

  if (SKYGGE_TEKSTGRUNNLAG) {
    Logger.log('Skygge-vurdering="' + (testTreff.aiSkyggeVurdering || '(ingen - se MERK over, eller TEKSTGRUNNLAG_MODUS="ingress")') +
      '", Skygge-tekstgrunnlag="' + (testTreff.aiSkyggeTekstgrunnlag || '') +
      '", Skygge-validering="' + (testTreff.aiSkyggeValidering || '') + '"');
  }

  Logger.log('Antall AI-kall denne testen gjorde: ' + statistikk.antallKall + ' (kostnad ca $' + statistikk.kostnad.toFixed(4) + ').');
  if (statistikk.feil.length > 0) Logger.log('Feil/advarsler: ' + statistikk.feil.join(' | '));

  Logger.log('Ferdig. Ingenting er skrevet til regnearket, og ingen e-post er sendt.');
}
