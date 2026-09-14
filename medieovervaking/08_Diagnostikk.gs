/**
 * 08_Diagnostikk.gs
 *
 * MIDLERTIDIG diagnostikk-fil - lagt til for å finne ut hvorfor skriptet
 * plutselig ga 0 treff på alle kilder etter at Søkeord-fanen ble utvidet
 * til 100+ rader og Kilder-fanen til ca. 50 rader.
 *
 * Denne filen ENDRER IKKE hvordan innlesing eller sokeordmatching faktisk
 * fungerer - den bare logger hva som skjer, slik at vi kan se den faktiske
 * årsaken før vi endrer noe.
 *
 * Kalles automatisk fra kjorTest() i 07_Hovedkjoring.gs (se der).
 *
 * NAR FEILEN ER FUNNET OG RETTET: denne fila kan enten slettes helt, eller
 * beholdes for senere feilsoking - se forslag i tilbakemeldingen fra
 * Claude Code etter forste diagnostikk-kjoring.
 */

/**
 * Kjorer all diagnostikk og logger resultatene med Logger.log.
 * Kalles fra kjorTest().
 *
 * @param {Spreadsheet} ss
 */
function kjorDiagnostikk(ss) {
  Logger.log('');
  Logger.log('########################################');
  Logger.log('### MIDLERTIDIG DIAGNOSTIKK - START ###');
  Logger.log('########################################');

  diagnostiserSokeordInnlesing(ss);
  diagnostiserSokeordMatching(ss);
  diagnostiserSelvrefererendeKilder(ss);

  Logger.log('########################################');
  Logger.log('### MIDLERTIDIG DIAGNOSTIKK - SLUTT ###');
  Logger.log('########################################');
  Logger.log('');
}

/**
 * Diagnostikk 1: Hvor mange rader leser skriptet faktisk inn fra
 * "Sokeord"-fanen, og hvilken datatype har Tier-verdiene?
 *
 * Leser cellene DIREKTE (uten a bruke hentSokeord() sin konvertering),
 * slik at vi ser noyaktig hva som faktisk star i arket.
 *
 * @param {Spreadsheet} ss
 */
function diagnostiserSokeordInnlesing(ss) {
  Logger.log('--- DIAGNOSTIKK 1: Innlesing fra "' + FANE_SOKEORD + '"-fanen ---');

  var ark = ss.getSheetByName(FANE_SOKEORD);
  var sisteRad = ark.getLastRow();
  var antallDatarader = sisteRad - 1; // minus overskriftsraden

  Logger.log('ark.getLastRow() = ' + sisteRad + ' -> antall datarader som BURDE leses: ' + antallDatarader);
  Logger.log('(Forventet: over 100. Hvis dette tallet er lavere enn det du faktisk har fylt ut i arket, ' +
    'er det bekreftet et omrade-/rekkevidde-problem.)');

  if (antallDatarader < 1) {
    Logger.log('INGEN datarader funnet i "' + FANE_SOKEORD + '" - avbryter resten av denne diagnostikken.');
    return;
  }

  var raData = ark.getRange(2, 1, antallDatarader, 3).getValues();

  Logger.log('Forste 5 sokeord (raverdier direkte fra arket):');
  for (var i = 0; i < Math.min(5, raData.length); i++) {
    loggSokeordRad(raData, i);
  }

  Logger.log('Siste 5 sokeord (raverdier direkte fra arket):');
  for (var j = Math.max(0, raData.length - 5); j < raData.length; j++) {
    loggSokeordRad(raData, j);
  }

  // Tell datatypene i HELE Tier-kolonnen, for a se om formateringen er
  // inkonsekvent pa tvers av alle radene (ikke bare de 10 vi logger over).
  var typeTelling = {};
  for (var k = 0; k < raData.length; k++) {
    var t = typeof raData[k][1];
    typeTelling[t] = (typeTelling[t] || 0) + 1;
  }
  Logger.log('Datatype-fordeling for HELE Tier-kolonnen (' + raData.length + ' rader): ' + JSON.stringify(typeTelling));

  // Sammenlign med hva den faktiske hentSokeord()-funksjonen returnerer,
  // for a se om selve innlesingsfunksjonen i bruk stemmer med raverdiene.
  var sokeordListe = hentSokeord(ss);
  Logger.log('Til sammenligning: hentSokeord() (slik den faktisk brukes i en vanlig kjoring) returnerte ' +
    sokeordListe.length + ' sokeord.');

  // Ny mistanke: encoding-problemer i sokeord med norske tegn (aeoa/aeøå).
  // Skanner ALLE sokeord for tegnmonstre som er typiske tegn pa feil
  // tegnsett ("mojibake") - f.eks. UTF-8-tekst som er blitt tolket som
  // Latin-1 et sted i kopier-lim-inn-kjeden.
  var mistenkeligeTegn = ['Ã', 'Â', '�', 'â€'];
  var mistenkeligeSokeord = [];
  for (var m = 0; m < sokeordListe.length; m++) {
    var s = sokeordListe[m].sokeord;
    for (var n = 0; n < mistenkeligeTegn.length; n++) {
      if (s.indexOf(mistenkeligeTegn[n]) !== -1) {
        mistenkeligeSokeord.push(s);
        break;
      }
    }
  }
  Logger.log('Sokeord med tegn som tyder pa feil tegnsett (mojibake): ' + mistenkeligeSokeord.length +
    ' av ' + sokeordListe.length + (mistenkeligeSokeord.length > 0 ? ' -> ' + JSON.stringify(mistenkeligeSokeord) : ''));

  // Full liste over ALLE sokeord som JSON, slik at ogsa usynlige tegn
  // (ekstra mellomrom, linjeskift, andre kontrolltegn) blir synlige.
  Logger.log('FULL liste over alle ' + sokeordListe.length + ' sokeord som faktisk brukes i matchingen (JSON, for a avslore usynlige tegn):');
  Logger.log(JSON.stringify(sokeordListe.map(function (r) { return r.sokeord; })));
}

/**
 * Logger en enkelt rad med sokeord/tier/kontekstord med rå verdi OG
 * datatype for Tier-kolonnen.
 *
 * @param {Array<Array>} raData
 * @param {number} indeks
 */
function loggSokeordRad(raData, indeks) {
  var rad = raData[indeks];
  var raSokeord = rad[0];
  var raTier = rad[1];
  var raKontekstord = rad[2];
  Logger.log('  Rad ' + (indeks + 2) + ': sokeord="' + raSokeord + '"' +
    ' | tier-verdi=' + JSON.stringify(raTier) +
    ' | tier-datatype=' + (typeof raTier) +
    ' | kontekstord="' + raKontekstord + '"');
}

/**
 * Diagnostikk 2: Fungerer selve sokeordmatchingen i det hele tatt?
 *
 * To deler:
 * a) En kontrollsjekk helt uavhengig av regnearket - tester
 *    finnMatchendeSokeord() mot en kunstig tekst og et kunstig sokeord vi
 *    VET burde matche ("Maritime CleanTech"). Feiler denne, er feilen i
 *    selve sammenligningslogikken, ikke i sokeord/artikkel-dataene.
 * b) Henter ekte artikler fra en kilde vi vet virker (forsoker DN forst),
 *    og kjorer dem mot den FULLE sokeordlisten fra arket.
 *
 * @param {Spreadsheet} ss
 */
function diagnostiserSokeordMatching(ss) {
  Logger.log('--- DIAGNOSTIKK 2: Sokeordmatching mot ekte artikkeltekster ---');

  var sokeordListe = hentSokeord(ss);

  // --- a) Kontrollsjekk, helt uavhengig av regnearket ---
  var kontrollTekst = 'Dette er en kontrolltekst som handler om Maritime CleanTech og maritim naering generelt.';
  var kontrollSokeord = [{ sokeord: 'Maritime CleanTech', tier: 1, kontekstord: [] }];
  var kontrollTreff = finnMatchendeSokeord(kontrollTekst, kontrollSokeord);

  Logger.log('Kontrollsjekk (kunstig tekst + kunstig sokeord, uavhengig av selve arket): ' +
    (kontrollTreff.length > 0
      ? 'MATCHET OK (' + kontrollTreff.join(', ') + ') - selve sammenligningslogikken virker.'
      : 'INGEN TREFF - selve sammenligningslogikken i finnMatchendeSokeord() ser ut til a vaere feil!'));

  // --- b) Test mot ekte artikkeltekster ---
  var kilder = hentKilder(ss);
  if (kilder.length === 0) {
    Logger.log('Ingen kilder funnet i "' + FANE_KILDER + '" - kan ikke teste mot ekte artikler.');
    return;
  }

  // Foretrekk kilder vi VET tidligere ga reelle treff (DN, E24, Teknisk
  // Ukeblad), i den rekkefolgen - fall tilbake til forste kilde som
  // faktisk svarer med artikler hvis ingen av dem skulle fungere na.
  var foretrukketNavn = ['energi og klima', 'dn', 'e24', 'teknisk ukeblad'];
  var foretrukketKilder = [];
  for (var q = 0; q < foretrukketNavn.length; q++) {
    for (var p = 0; p < kilder.length; p++) {
      var navnLower = kilder[p].navn.toLowerCase();
      if (navnLower.indexOf(foretrukketNavn[q]) !== -1 && foretrukketKilder.indexOf(kilder[p]) === -1) {
        foretrukketKilder.push(kilder[p]);
      }
    }
  }
  var restenAvKildene = kilder.filter(function (k) { return foretrukketKilder.indexOf(k) === -1; });
  var kildeRekkefolge = foretrukketKilder.concat(restenAvKildene);

  var testKilde = null;
  var testArtikler = [];

  for (var i = 0; i < kildeRekkefolge.length && testArtikler.length === 0; i++) {
    var resultat = hentRSSFeed(kildeRekkefolge[i].url);
    if (resultat.suksess && resultat.artikler.length > 0) {
      testKilde = kildeRekkefolge[i];
      testArtikler = resultat.artikler.slice(0, 5);
    }
  }

  if (!testKilde) {
    Logger.log('Fant ingen kilde med hentbare artikler akkurat na - kan ikke kjore denne delen av diagnostikken.');
    return;
  }

  Logger.log('Tester mot ' + testArtikler.length + ' ekte artikler fra "' + testKilde.navn + '" (' + testKilde.url + '):');

  var noenTreffTotalt = false;
  for (var a = 0; a < testArtikler.length; a++) {
    var artikkel = testArtikler[a];
    var tekst = artikkel.tittel + ' ' + artikkel.ingress;
    var treff = finnMatchendeSokeord(tekst, sokeordListe);
    if (treff.length > 0) noenTreffTotalt = true;

    Logger.log('  Artikkel ' + (a + 1) + ': "' + artikkel.tittel + '"');
    // FULL tekst som JSON, ikke bare lengde - avslorer encoding-artefakter
    // og skiller "ingress mangler" fra "ingress finnes, men matcher ikke".
    Logger.log('    Full tekst sokt i (JSON): ' + JSON.stringify(tekst));
    Logger.log('    Treff mot full sokeordliste (' + sokeordListe.length + ' sokeord): ' +
      (treff.length > 0 ? treff.join(', ') : 'INGEN'));
  }

  // Kontrollsjekk #2: samme ekte artikkeltekster, men mot noen handplukkede
  // sokeord vi VET er brede nok til a treffe generelt norsk/engelsk
  // nyhetsspråk ofte (ikke fra arket) - hvis DISSE heller ikke matcher noe
  // som helst pa tvers av 5 artikler, er det et sterkt signal om at noe er
  // galt i selve matchingen/teksten, ikke bare at sokeordlisten er for smal.
  var bredeTestord = [
    { sokeord: 'og', tier: 1, kontekstord: [] },
    { sokeord: 'i', tier: 1, kontekstord: [] },
    { sokeord: 'the', tier: 1, kontekstord: [] }
  ];
  var bredTreffFunnet = false;
  for (var b = 0; b < testArtikler.length; b++) {
    var breddTekst = testArtikler[b].tittel + ' ' + testArtikler[b].ingress;
    if (finnMatchendeSokeord(breddTekst, bredeTestord).length > 0) {
      bredTreffFunnet = true;
      break;
    }
  }
  Logger.log('Kontrollsjekk #2 (sokeordene "og"/"i"/"the" mot de samme ekte artiklene - burde nesten alltid treffe): ' +
    (bredTreffFunnet ? 'MATCHET OK' : 'INGEN TREFF - selv "og"/"i"/"the" matcher ikke, sterkt tegn pa encoding- eller tekstproblem'));

  Logger.log('Oppsummering diagnostikk 2: Ga NOEN av de ' + testArtikler.length +
    ' ekte artiklene treff mot den FULLE sokeordlisten fra arket? ' + (noenTreffTotalt ? 'JA' : 'NEI - ingen treff i det hele tatt'));
}

/**
 * Diagnostikk 3: Tester "selvrefererende" kilder - Google Alerts-kilder der
 * kildenavnet er identisk med et sokeord (f.eks. "AIMPERES" bade som Kilde
 * og som Sokeord). Slike varsler er den sterkeste testen vi har: Google har
 * selv funnet artikkelen fordi den nevner nøyaktig det sokeordet, sa HVIS
 * matchingen fungerer, bor disse SA A SI ALLTID gi treff nar de har
 * fersk data. Tester alle slike kilder som faktisk har artikler akkurat na,
 * uavhengig av om de allerede er logget som feilet/OK andre steder.
 *
 * @param {Spreadsheet} ss
 */
function diagnostiserSelvrefererendeKilder(ss) {
  Logger.log('--- DIAGNOSTIKK 3: Selvrefererende Google Alerts-kilder (kildenavn = sokeord) ---');

  var kilder = hentKilder(ss);
  var sokeordListe = hentSokeord(ss);
  var sokeordSettLower = {};
  for (var s = 0; s < sokeordListe.length; s++) {
    sokeordSettLower[sokeordListe[s].sokeord.toLowerCase()] = sokeordListe[s].sokeord;
  }

  var selvrefererendeKilder = [];
  for (var k = 0; k < kilder.length; k++) {
    var navnLower = kilder[k].navn.toLowerCase();
    if (sokeordSettLower.hasOwnProperty(navnLower)) {
      selvrefererendeKilder.push({ kilde: kilder[k], forventetSokeord: sokeordSettLower[navnLower] });
    }
  }

  Logger.log('Fant ' + selvrefererendeKilder.length + ' kilde(r) med navn som er identisk med et sokeord: ' +
    selvrefererendeKilder.map(function (r) { return r.kilde.navn; }).join(', '));

  if (selvrefererendeKilder.length === 0) {
    Logger.log('Ingen selvrefererende kilder a teste - hopper over denne diagnostikken.');
    return;
  }

  var noenTestetMedInnhold = false;

  for (var i = 0; i < selvrefererendeKilder.length; i++) {
    var kildeInfo = selvrefererendeKilder[i];
    var resultat = hentRSSFeed(kildeInfo.kilde.url);

    if (!resultat.suksess) {
      Logger.log('  "' + kildeInfo.kilde.navn + '": henting feilet (' + resultat.feilmelding + ') - kan ikke teste na.');
      continue;
    }
    if (resultat.artikler.length === 0) {
      Logger.log('  "' + kildeInfo.kilde.navn + '": 0 artikler i feeden akkurat na - kan ikke teste na.');
      continue;
    }

    noenTestetMedInnhold = true;
    Logger.log('  "' + kildeInfo.kilde.navn + '" (forventet sokeord: "' + kildeInfo.forventetSokeord + '"), ' +
      resultat.artikler.length + ' artikkel/artikler i feeden:');

    for (var a = 0; a < Math.min(3, resultat.artikler.length); a++) {
      var artikkel = resultat.artikler[a];
      var tekst = artikkel.tittel + ' ' + artikkel.ingress;
      var enkelSubstringTreff = tekst.toLowerCase().indexOf(kildeInfo.forventetSokeord.toLowerCase()) !== -1;
      var pipelineTreff = finnMatchendeSokeord(tekst, sokeordListe);

      Logger.log('    Artikkel ' + (a + 1) + ' (JSON): ' + JSON.stringify(tekst));
      Logger.log('      Inneholder teksten "' + kildeInfo.forventetSokeord + '" (enkelt indexOf)? ' + (enkelSubstringTreff ? 'JA' : 'NEI'));
      Logger.log('      Treff via full pipeline (finnMatchendeSokeord)? ' +
        (pipelineTreff.length > 0 ? 'JA (' + pipelineTreff.join(', ') + ')' : 'NEI'));
    }
  }

  if (!noenTestetMedInnhold) {
    Logger.log('Ingen av de selvrefererende kildene hadde hentbart innhold akkurat na - kunne ikke fullfore denne testen.');
  }
}
