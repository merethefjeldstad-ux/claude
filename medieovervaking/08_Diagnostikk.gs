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
  diagnostiserTier2Kontekstsjekk(ss);
  diagnostiserAlleTier2Kontekstord(ss);

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

/**
 * Diagnostikk 4: Undersoker et konkret rapportert avvik - Tier 2-sokeordet
 * "GASS" ble godkjent for artikkelen "EU vil forby olje og gass fra Arktis"
 * (Energi og Klima) uten at noen av kontekstordene (skip, shipping, maritim,
 * rederi, Maritime CleanTech) er synlige i ingressen slik den vises i
 * e-postrapporten.
 *
 * Henter Energi og Klima-kildene pa nytt og kjorer den EKTE produksjons-
 * funksjonen finnMatchendeSokeord() mot hver artikkel (ikke en kopi av
 * logikken - vi tester det faktiske kodepunktet). For hvert Tier 2-sokeord
 * der selve ordet finnes i teksten, logges i tillegg en fullstendig manuell
 * gjennomgang av kontekstsjekken, slik at vi kan se noyaktig hvor et
 * eventuelt avvik mellom "skal godkjennes" og "ble faktisk godkjent" oppstar.
 *
 * @param {Spreadsheet} ss
 */
function diagnostiserTier2Kontekstsjekk(ss) {
  Logger.log('--- DIAGNOSTIKK 4: Tier 2-kontekstsjekk (fokus: "GASS" / Energi og Klima) ---');

  var sokeordListe = hentSokeord(ss);
  var kilder = hentKilder(ss);

  var energiOgKlimaKilder = kilder.filter(function (k) {
    return k.navn.toLowerCase().indexOf('energi og klima') !== -1;
  });

  if (energiOgKlimaKilder.length === 0) {
    Logger.log('Fant ingen kilde med "Energi og Klima" i navnet - kan ikke kjore denne diagnostikken.');
    return;
  }

  for (var k = 0; k < energiOgKlimaKilder.length; k++) {
    var kilde = energiOgKlimaKilder[k];
    var resultat = hentRSSFeed(kilde.url);

    if (!resultat.suksess) {
      Logger.log('  "' + kilde.navn + '": henting feilet (' + resultat.feilmelding + ') - kan ikke sjekke na.');
      continue;
    }

    Logger.log('  "' + kilde.navn + '": ' + resultat.artikler.length +
      ' artikkel/artikler i feeden akkurat na (uavhengig av ferskhetsvindu).');

    for (var a = 0; a < resultat.artikler.length; a++) {
      var artikkel = resultat.artikler[a];
      var tekst = artikkel.tittel + ' ' + artikkel.ingress;
      var normalisertTekst = tekst.toLowerCase();

      // Kjorer den EKTE produksjonsfunksjonen - vi diagnostiserer det
      // faktiske kodepunktet, ikke en reimplementasjon av logikken.
      var faktiskeTreff = finnMatchendeSokeord(tekst, sokeordListe);

      var erKjentEksempel = normalisertTekst.indexOf('gass') !== -1 && normalisertTekst.indexOf('arktis') !== -1;

      // For a holde loggen lesbar: kun artikler med minst ett faktisk treff,
      // pluss det spesifikt rapporterte eksempelet uansett utfall.
      if (faktiskeTreff.length === 0 && !erKjentEksempel) {
        continue;
      }

      Logger.log('    Artikkel: "' + artikkel.tittel + '"' +
        (erKjentEksempel ? '  <-- DETTE SER UT TIL A VAERE DET RAPPORTERTE EKSEMPELET' : ''));
      Logger.log('      Full tekst sokt i (tittel + ingress, JSON): ' + JSON.stringify(tekst));
      Logger.log('      Faktiske treff fra produksjonsfunksjonen finnMatchendeSokeord(): ' +
        (faktiskeTreff.length > 0 ? faktiskeTreff.join(', ') : 'INGEN'));

      for (var s = 0; s < sokeordListe.length; s++) {
        var rad = sokeordListe[s];
        if (rad.tier !== 2) continue;

        var ordFunnet = normalisertTekst.indexOf(rad.sokeord.toLowerCase()) !== -1;
        if (!ordFunnet) continue; // selve sokeordet er ikke engang i teksten - ikke relevant her

        var kontekstordFunnet = [];
        var kontekstordVisning = [];
        for (var c = 0; c < rad.kontekstord.length; c++) {
          var kFunnet = normalisertTekst.indexOf(rad.kontekstord[c].toLowerCase()) !== -1;
          kontekstordFunnet.push(kFunnet);
          kontekstordVisning.push('"' + rad.kontekstord[c] + '"=' + kFunnet);
        }

        var noenKontekstFunnet = kontekstordFunnet.indexOf(true) !== -1;
        var faktiskGodkjent = faktiskeTreff.indexOf(rad.sokeord) !== -1;

        Logger.log('      Tier 2-sokeord "' + rad.sokeord + '" (tier-verdi i minnet: ' + rad.tier +
          ', datatype: ' + (typeof rad.tier) + ') - selve ordet ER funnet i teksten.');
        Logger.log('        Kontekstord lest inn fra arket: [' +
          rad.kontekstord.map(function (x) { return '"' + x + '"'; }).join(', ') + ']' +
          (rad.kontekstord.length === 0 ? '  <-- INGEN kontekstord konfigurert for dette sokeordet' : ''));
        Logger.log('        Kontekstsjekk per ord: ' +
          (kontekstordVisning.length > 0 ? kontekstordVisning.join(', ') : '(ingen ord a sjekke)'));
        Logger.log('        Minst ett kontekstord funnet? ' + noenKontekstFunnet);
        Logger.log('        Ble sokeordet FAKTISK godkjent av produksjonsfunksjonen? ' + faktiskGodkjent);

        if (faktiskGodkjent && !noenKontekstFunnet) {
          Logger.log('        !!! AVVIK: godkjent UTEN at noe kontekstord ble funnet - logikkfeil bekreftet for dette tilfellet !!!');
        } else if (!faktiskGodkjent && noenKontekstFunnet) {
          Logger.log('        !!! AVVIK (motsatt retning): kontekstord funnet, men IKKE godkjent !!!');
        } else {
          Logger.log('        Konsistent - manuell sjekk og produksjonsfunksjonen er enige for dette sokeordet/denne artikkelen.');
        }
      }
    }
  }
}

/**
 * Diagnostikk 5: Full gjennomgang av kontekstord for ALLE Tier 2-sokeord,
 * ikke bare "GASS". Flagger kontekstord som er sa korte at de lett kan
 * matche tilfeldig inni andre ord (substring-sok uten ordgrense-sjekk) -
 * samme mekanisme som avslorte "KI"-problemet i diagnostikk 4 (matchet
 * inni "Kilder"). Rene datalister, ingen RSS-henting - kjapt a kjore.
 *
 * @param {Spreadsheet} ss
 */
function diagnostiserAlleTier2Kontekstord(ss) {
  Logger.log('--- DIAGNOSTIKK 5: Full gjennomgang av Tier 2-kontekstord ---');

  var sokeordListe = hentSokeord(ss);
  var tier2Rader = sokeordListe.filter(function (r) { return r.tier === 2; });

  Logger.log('Fant ' + tier2Rader.length + ' Tier 2-sokeord totalt.');

  var TERSKEL_KORT_ORD = 3; // kontekstord med 3 tegn eller faerre flagges som risikable
  var totaltAntallRisikable = 0;

  for (var i = 0; i < tier2Rader.length; i++) {
    var rad = tier2Rader[i];
    var kontekstordVisning = rad.kontekstord.map(function (x) { return '"' + x + '"'; }).join(', ');

    var risikableIDenneRaden = [];
    for (var j = 0; j < rad.kontekstord.length; j++) {
      if (rad.kontekstord[j].length <= TERSKEL_KORT_ORD) {
        risikableIDenneRaden.push(rad.kontekstord[j]);
      }
    }

    if (rad.kontekstord.length === 0) {
      Logger.log('  "' + rad.sokeord + '": INGEN kontekstord konfigurert - dette Tier 2-ordet kan ALDRI matche.');
    } else if (risikableIDenneRaden.length > 0) {
      totaltAntallRisikable += risikableIDenneRaden.length;
      Logger.log('  "' + rad.sokeord + '": [' + kontekstordVisning + ']  <-- RISIKABELT: ' +
        risikableIDenneRaden.map(function (x) { return '"' + x + '" (' + x.length + ' tegn)'; }).join(', ') +
        ' - korte ord kan matche tilfeldig inni andre ord');
    } else {
      Logger.log('  "' + rad.sokeord + '": [' + kontekstordVisning + ']');
    }
  }

  Logger.log('Oppsummering diagnostikk 5: ' + totaltAntallRisikable +
    ' potensielt risikable (<=' + TERSKEL_KORT_ORD + ' tegn) kontekstord funnet pa tvers av ' +
    tier2Rader.length + ' Tier 2-sokeord. Disse bor vurderes manuelt i arket - korte ord/forkortelser ' +
    'matcher lett tilfeldig inni andre ord siden sokingen er substring-basert uten ordgrense-sjekk.');
}
