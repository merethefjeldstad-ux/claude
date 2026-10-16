/**
 * 07_Hovedkjoring.gs
 *
 * Selve "dirigenten" - kobler sammen alle de andre filene til en
 * komplett kjoring:
 *   1. Les inn kilder, sokeord, mottakere og tidligere sendte URL-er
 *   2. Hent RSS fra hver kilde (feil i EN kilde stopper ALDRI resten)
 *   3. Filtrer artikler fra siste TIDSVINDU_ARTIKKEL_TIMER timer (se
 *      01_Konfigurasjon.gs - satt til 72t) mot sokeordlisten
 *   4. Dedupliser mot tidligere sendte artikler
 *   5. (Fase 2, valgfritt) La AI vurdere relevans og skrive notat for de
 *      NYE treffene - se 10_AIIntegrasjon.gs. Styres av Script Property
 *      AI_ENABLED. Feiler AI-steget av noen grunn stopper det ALDRI
 *      e-postutsendingen - se try/catch rundt kallet under.
 *   6. Bygg og send statusrapport pa e-post
 *   7. Logg resultatet per kilde i "Kjoringslogg", AI-statistikk i
 *      "Kjøretidslogg", og oppdater "Kilder" og "Sendte artikler"
 *
 * To funksjoner kaller denne logikken:
 *   - kjorDaglig(): satt opp med en tidsutlosning (trigger) kl. ca 06:45
 *   - kjorTest():   for manuell kjoring fra editoren mens du tester
 * Begge gjor eksakt det samme - all logging med Logger.log er alltid pa,
 * sa "kjorTest" gir deg full innsikt nar du kjorer den manuelt og ser pa
 * "Utforelseslogg" ("Execution log") i Apps Script-editoren etterpa.
 */

/**
 * Hovedfunksjonen som gjor hele jobben. Kalles av bade kjorDaglig() og
 * kjorTest() - se disse to helt nederst i filen.
 */
function kjorMedieovervaking() {
  var startTid = new Date().getTime();
  Logger.log('=== Starter medieovervaking ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var kilder = hentKilder(ss);
  var sokeordListe = hentSokeord(ss);
  var mottakere = hentMottakere(ss);
  var sendteUrlerSet = hentSendteUrler(ss);

  Logger.log('Fant ' + kilder.length + ' kilder, ' + sokeordListe.length +
    ' sokeord og ' + mottakere.length + ' mottakere.');

  if (kilder.length === 0) {
    Logger.log('INGEN kilder funnet i fanen "' + FANE_KILDER + '". Har du kjort forsteGangsOppsett ' +
      'og fylt inn kilder? Avbryter.');
    return;
  }

  var treffPerKategori = {};   // kategori -> liste med treffobjekter
  var antallOk = 0;
  var antallFeilet = 0;
  var feilendeKilderNavn = [];
  var tidsbudsjettSprengt = false;

  for (var i = 0; i < kilder.length; i++) {
    var kilde = kilder[i];

    // --- Enkel tidsbudsjett-sjekk ---
    // Apps Script stopper kjoringen tvangsmessig etter 6 minutter. Vi varsler
    // og hopper over resterende kilder hvis vi naermer oss grensen, slik at
    // vi fortsatt rekker a bygge og sende e-posten med det vi har sa langt.
    var brukTidMs = new Date().getTime() - startTid;
    if (brukTidMs > TIDSGRENSE_HENTING_MS) {
      Logger.log('ADVARSEL: Naermer oss Apps Scripts 6-minuttersgrense (' +
        Math.round(brukTidMs / 1000) + ' sekunder brukt sa langt). ' +
        'Hopper over ' + (kilder.length - i) + ' resterende kilde(r) denne kjoringen.');

      for (var j = i; j < kilder.length; j++) {
        loggKjoring(ss, kilder[j].navn, 'IKKE_KJORT', 'Hoppet over pga tidsbudsjett (naermer seg 6-min grensen)', 0);
      }
      tidsbudsjettSprengt = true;
      break;
    }

    Logger.log('Henter kilde ' + (i + 1) + '/' + kilder.length + ': ' + kilde.navn + ' (' + kilde.url + ')');
    var resultat = hentRSSFeed(kilde.url);

    if (!resultat.suksess) {
      Logger.log('FEIL for "' + kilde.navn + '": ' + resultat.feilmelding);
      antallFeilet++;
      feilendeKilderNavn.push(kilde.navn);
      oppdaterKildeStatus(ss, kilde.radnummer, 'FEILET', null, 0);
      loggKjoring(ss, kilde.navn, 'FEILET', resultat.feilmelding, 0);
      continue;
    }

    var friskeArtikler = resultat.artikler.filter(function (a) {
      return erInnenTidsvindu(a.dato);
    });

    var treffTeller = 0;
    for (var a = 0; a < friskeArtikler.length; a++) {
      var artikkel = friskeArtikler[a];

      if (!artikkel.lenke) {
        continue; // uten lenke kan vi verken dedup-sjekke eller lenke til artikkelen i e-posten
      }

      var tekstTilSok = artikkel.tittel + ' ' + artikkel.ingress;
      var matchendeOrd = finnMatchendeSokeord(tekstTilSok, sokeordListe);

      if (matchendeOrd.length === 0) continue;
      if (sendteUrlerSet[artikkel.lenke]) continue; // allerede sendt tidligere - dedup

      treffTeller++;

      if (!treffPerKategori[kilde.kategori]) {
        treffPerKategori[kilde.kategori] = [];
      }
      treffPerKategori[kilde.kategori].push({
        tittel: artikkel.tittel,
        lenke: artikkel.lenke,
        ingress: artikkel.ingress,
        kilde: kilde.navn,
        matchendeOrd: matchendeOrd
      });

      // Merk denne som "sett" ogsa lokalt, i tilfelle samme URL dukker opp
      // flere ganger i samme kjoring (f.eks. fra flere kilder)
      sendteUrlerSet[artikkel.lenke] = true;
    }

    antallOk++;
    oppdaterKildeStatus(ss, kilde.radnummer, 'OK', new Date(), treffTeller);
    loggKjoring(ss, kilde.navn, 'OK', '', treffTeller);
    Logger.log('"' + kilde.navn + '": OK - ' + friskeArtikler.length + ' artikler siste ' +
      TIDSVINDU_ARTIKKEL_TIMER + 't, ' + treffTeller + ' nye treff.');
  }

  // --- Fase 2 (valgfritt): la AI vurdere relevans og skrive notat ---
  // Alle NYE treff (allerede dedupliserte over) samles i en flat liste og
  // sendes til vurderTreffMedAI() i 10_AIIntegrasjon.gs, som muterer hvert
  // treff-objekt med .aiRelevant (true/false/null) og .aiNotat. Hele
  // kallet star i try/catch: uansett hva som gar galt i AI-steget (nettverk,
  // uventet API-endring, feil i egen kode) skal e-posten ALLTID sendes
  // etterpa, bare uten AI-notat for de(n) som ikke rakk a bli vurdert.
  var alleNyeTreff = samleAlleTreff(treffPerKategori);
  var aiStatistikk = { antallKall: 0, tokensInn: 0, tokensUt: 0, kostnad: 0, feil: [], stoppetTidlig: false, stoppArsak: '' };

  try {
    aiStatistikk = vurderTreffMedAI(alleNyeTreff);
  } catch (e) {
    var uventetFeil = 'Uventet feil i AI-steget - fortsetter uten AI-notat: ' + e.message;
    Logger.log(uventetFeil);
    aiStatistikk.feil.push(uventetFeil);
  }

  // --- Bygg og send merkevaredesignet e-post, med fail-safe til gammelt
  // format (06_Epost.gs, helt uendret) hvis NOE som helst feiler her - se
  // 11_EpostMerkevare.gs. Logo-henting og mal-bygging kan begge feile uten
  // at e-postutsendingen stopper. Eventuelle feil havner i aiStatistikk.feil
  // slik at de vises i samme Kjøretidslogg-rad som AI-feil.
  Logger.log('Bygger merkevaredesignet e-post-HTML...');
  var logoResultat = hentLogoBlob();
  if (logoResultat.feilmelding) {
    Logger.log('Logo: ' + logoResultat.feilmelding);
    aiStatistikk.feil.push('Logo: ' + logoResultat.feilmelding);
  }

  var html = null;
  var tekstversjon = null;
  try {
    html = byggEpostHtmlMerkevare(treffPerKategori, antallOk, kilder.length, antallFeilet,
      feilendeKilderNavn, aiStatistikk, !!logoResultat.blob);
    tekstversjon = byggEpostTekstversjonMerkevare(treffPerKategori, antallOk, kilder.length,
      antallFeilet, feilendeKilderNavn, aiStatistikk);
  } catch (e) {
    var merkevareFeil = 'Klarte ikke a bygge merkevaredesignet e-post - sender gammelt format i stedet: ' + e.message;
    Logger.log(merkevareFeil);
    aiStatistikk.feil.push(merkevareFeil);
    html = null;
  }

  Logger.log('Sender e-post til ' + mottakere.length + ' mottaker(e)...');
  if (html) {
    sendEpostMedLogo(mottakere, html, tekstversjon, logoResultat.blob);
  } else {
    var gammelHtml = byggEpostHtml(treffPerKategori, antallOk, kilder.length, antallFeilet, feilendeKilderNavn, aiStatistikk);
    sendEpost(mottakere, gammelHtml);
  }

  loggAiKjoretid(ss, aiStatistikk);

  if (alleNyeTreff.length > 0) {
    Logger.log('Registrerer ' + alleNyeTreff.length + ' nye artikkel-URL-er (inkl. AI-vurdering) i "' + FANE_SENDTE_ARTIKLER + '".');
    leggTilSendteUrler(ss, alleNyeTreff);
  }

  var totalTidSekunder = Math.round((new Date().getTime() - startTid) / 1000);
  Logger.log('=== Ferdig. ' + antallOk + ' av ' + kilder.length + ' kilder OK, ' +
    antallFeilet + ' feilet' + (tidsbudsjettSprengt ? ' (tidsbudsjett ble sprengt)' : '') +
    '. Total tid: ' + totalTidSekunder + ' sekunder. ===');
}

/**
 * Hovedfunksjon for den daglige, automatiske kjoringen.
 * Denne er funksjonen du kobler til en tidsutlosning (trigger) i Apps
 * Script-editoren (se README for hvordan).
 */
function kjorDaglig() {
  kjorMedieovervaking();
}

/**
 * Identisk logikk som kjorDaglig(), men ment for manuell kjoring fra
 * editoren mens du tester oppsettet. Etter kjoring: se "Utforelseslogg"
 * ("Execution log" / klokke-ikonet til venstre i editoren) for a se
 * detaljert steg-for-steg-logg av hva som skjedde.
 */
function kjorTest() {
  kjorMedieovervaking();
}
