/**
 * 11_EpostMerkevare.gs
 *
 * Merkevaredesignet HTML-versjon av den daglige e-posten - en ren visuell
 * oppussing. IKKE en endring av hvilke artikler som velges ut, rekkefolge,
 * gruppering, KI-vurderingslogikk, feilhandtering eller sendetidspunkt -
 * alt det styres fortsatt fra 07_Hovedkjoring.gs og 10_AIIntegrasjon.gs,
 * helt uendret.
 *
 * Fail-safe: byggEpostHtmlMerkevare() kan i prinsippet kaste et unntak
 * (f.eks. en uventet datastruktur). Kalleren i 07_Hovedkjoring.gs fanger
 * dette i try/catch og faller tilbake til den gamle, enkle e-postformen
 * (byggEpostHtml() i 06_Epost.gs, HELT uendret av dette arbeidet) -
 * e-posten skal ALLTID ga ut, uansett hva som skjer her.
 *
 * Fargepalett og typografi er hentet fra maritimecleantech.no/brand - se
 * konstantene rett under. Tabellbasert layout med inline CSS + bgcolor-
 * attributter (for best mulig visning i Outlook). Ingen CSS-gradienter,
 * ingen webfonter, ingen JavaScript.
 */

// --- Offisielle Maritime CleanTech-farger (maritimecleantech.no/brand) ---
var MC_DEEP_BLUE = '#001530';           // overskrifter, tittel
var MC_DEEP_BLUE_700 = '#314257';       // brodtekst, AI-notat
var MC_DEEP_BLUE_500 = '#626F7F';       // dempet tekst (kilde, dato, bunntekst)
var MC_DEEP_BLUE_200 = '#C4C8CE';       // skillelinjer, AI-notat venstrekant
var MC_BAKGRUNN_KORT = '#FFFFFF';       // bakgrunn i selve e-posten
var MC_BAKGRUNN_YTRE = '#F5F5F5';       // bakgrunn bak e-postkortet (Deep Blue 50)
var MC_INNOVATION_BLUE = '#0066FF';     // "Les saken" og "Nevner oss" (tittel-lenken er MC_DEEP_BLUE)
var MC_IRRELEVANT_BAKGRUNN = '#F5F5F5'; // "Mulig irrelevant"-seksjon

var MC_FONT_STACK = 'Inter, Arial, Helvetica, sans-serif';
var MC_KONTAKTPERSON_NAVN = 'Merethe Fjeldstad';
var MC_KONTAKTPERSON_EPOST = 'merethe@maritimecleantech.no';

/**
 * Henter logobilde fra Google Drive via Script Property LOGO_FILE_ID.
 * Feiler ALDRI med et kastet unntak - returnerer i stedet en feilmelding
 * kalleren kan logge og falle tilbake fra (viser tekstlogo i stedet).
 *
 * Krever Drive-tilgang - se README for hvilken tillatelse du ma godkjenne
 * forste gang dette kjores.
 *
 * @return {{blob: Blob|null, feilmelding: string|null}}
 */
function hentLogoBlob() {
  var fileId = PropertiesService.getScriptProperties().getProperty('LOGO_FILE_ID');
  if (!fileId) {
    return { blob: null, feilmelding: 'Script Property LOGO_FILE_ID er ikke satt - bruker tekstlogo.' };
  }

  try {
    var fil = DriveApp.getFileById(fileId);
    var blob = fil.getBlob();
    return { blob: blob, feilmelding: null };
  } catch (e) {
    return { blob: null, feilmelding: 'Klarte ikke a hente logofil (LOGO_FILE_ID=' + fileId + '): ' + e.message };
  }
}

/**
 * Sender e-posten med den merkevaredesignede HTML-en, inkludert logo som
 * inlinebilde hvis den ble hentet. tekstversjon brukes som body-parameteret
 * i GmailApp.sendEmail - den rene tekst-fallbacken for klienter som ikke
 * viser HTML.
 *
 * @param {Array<string>} mottakere
 * @param {string} html
 * @param {string} tekstversjon
 * @param {Blob|null} logoBlob
 */
function sendEpostMedLogo(mottakere, html, tekstversjon, logoBlob) {
  if (mottakere.length === 0) {
    Logger.log('ADVARSEL: Ingen mottakere funnet i fanen "' + FANE_MOTTAKERE + '" - e-post ble IKKE sendt.');
    return;
  }

  var dagensDato = Utilities.formatDate(new Date(), TIDSSONE, 'dd.MM.yyyy');
  var emne = 'Medieovervåking Maritime CleanTech (test) - ' + dagensDato;

  var options = { htmlBody: html };
  if (logoBlob) {
    options.inlineImages = { logo: logoBlob };
  }

  GmailApp.sendEmail(mottakere.join(','), emne, tekstversjon, options);
}

/**
 * Bygger den merkevaredesignede HTML-e-posten. Samme inndata og samme
 * relevant/irrelevant-partisjonering som byggEpostHtml() i 06_Epost.gs -
 * kun utseendet er nytt.
 *
 * @param {Object} treffPerKategori
 * @param {number} antallOk
 * @param {number} totaltAntallKilder
 * @param {number} antallFeilet
 * @param {Array<string>} feilendeKilderNavn
 * @param {Object} aiStatistikk
 * @param {boolean} harLogo - true hvis et logobilde faktisk ble hentet
 * @return {string}
 */
function byggEpostHtmlMerkevare(treffPerKategori, antallOk, totaltAntallKilder, antallFeilet, feilendeKilderNavn, aiStatistikk, harLogo) {
  var partisjon = partisjonerTreff(treffPerKategori);
  var kategorier = Object.keys(partisjon.relevantePerKategori).sort();
  var dagensDatoTekst = Utilities.formatDate(new Date(), TIDSSONE, 'EEEE d. MMMM yyyy');

  var html = '<html><body style="margin:0;padding:0;background-color:' + MC_BAKGRUNN_YTRE + ';">';
  html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
    MC_BAKGRUNN_YTRE + '" style="background-color:' + MC_BAKGRUNN_YTRE + ';">';
  html += '<tr><td align="center" style="padding:24px 12px;">';
  html += '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
    MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT + ';max-width:600px;width:100%;">';

  // --- HODE ---
  // Logo (eller tekstlogo) oppe til venstre, deretter tittel, deretter dato.
  // Luft rundt selve logoen holdes med en egen wrapping-div (padding-bottom)
  // slik at <img>-taggens style-attributt forblir noyaktig slik spesifisert,
  // uten ekstra inline-stiler tilfort direkte pa den.
  html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
    ';padding:24px 32px 20px 32px;border-bottom:1px solid ' + MC_DEEP_BLUE_200 + ';font-family:' + MC_FONT_STACK + ';">';
  if (harLogo) {
    html += '<div style="padding:0 0 20px 0;">' +
      '<img src="cid:logo" alt="Maritime CleanTech" height="40" style="display:block;border:0;height:40px;width:auto;">' +
      '</div>';
  } else {
    html += '<div style="font-size:18px;font-weight:bold;color:' + MC_DEEP_BLUE + ';margin:0 0 20px 0;">Maritime CleanTech</div>';
  }
  html += '<div style="font-size:30px;line-height:36px;font-weight:bold;color:' + MC_DEEP_BLUE + ';margin:0;">Dagens medietreff.</div>';
  html += '<div style="font-size:13px;line-height:18px;color:' + MC_DEEP_BLUE_500 + ';margin:6px 0 0 0;">' +
    escapeHtml(dagensDatoTekst) + '</div>';
  html += '</td></tr>';

  // --- KORT OPPSUMMERING ---
  html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
    ';padding:20px 32px;font-family:' + MC_FONT_STACK + ';border-bottom:1px solid ' + MC_DEEP_BLUE_200 + ';">';
  html += '<div style="font-size:16px;line-height:22px;color:' + MC_DEEP_BLUE_700 + ';">';
  html += '<strong style="color:' + MC_DEEP_BLUE + ';">' + partisjon.totaltAntallTreff + ' treff</strong> i dag';
  if (partisjon.irrelevanteTreff.length > 0) {
    html += ', hvorav <strong style="color:' + MC_DEEP_BLUE + ';">' + partisjon.irrelevanteTreff.length +
      '</strong> under «Mulig irrelevant»';
  }
  html += '.</div>';
  html += '<div style="font-size:13px;line-height:20px;color:' + MC_DEEP_BLUE_500 + ';margin-top:6px;">';
  html += antallOk + ' av ' + totaltAntallKilder + ' kilder hentet OK.';
  if (antallFeilet > 0) {
    html += ' ' + antallFeilet + ' kilde(r) feilet: ' + escapeHtml(feilendeKilderNavn.join(', ')) + '.';
  }
  html += '</div>';
  if (aiStatistikk && aiStatistikk.stoppetTidlig) {
    html += '<div style="font-size:13px;line-height:20px;color:' + MC_DEEP_BLUE_500 + ';margin-top:6px;">' +
      'AI-vurdering stoppet underveis: ' + escapeHtml(aiStatistikk.stoppArsak) + '</div>';
  }
  html += '</td></tr>';

  // --- TREFF ---
  if (partisjon.totaltAntallTreff === 0) {
    html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
      ';padding:24px 32px;font-family:' + MC_FONT_STACK + ';font-size:16px;color:' + MC_DEEP_BLUE_700 + ';">';
    html += 'Ingen treff mot søkeordlisten i dag.';
    html += '</td></tr>';
  } else {
    for (var k = 0; k < kategorier.length; k++) {
      var kategori = kategorier[k];
      var treffListe = partisjon.relevantePerKategori[kategori];

      html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
        ';padding:20px 32px 0 32px;font-family:' + MC_FONT_STACK + ';">';
      html += '<div style="font-size:18px;line-height:24px;font-weight:bold;color:' + MC_DEEP_BLUE +
        ';margin:0 0 4px 0;">' + escapeHtml(kategori) + '</div>';
      html += '</td></tr>';

      for (var t = 0; t < treffListe.length; t++) {
        html += byggTreffKortHtmlMerkevare(treffListe[t], t === treffListe.length - 1);
      }
    }

    if (partisjon.irrelevanteTreff.length > 0) {
      html += '<tr><td bgcolor="' + MC_IRRELEVANT_BAKGRUNN + '" style="background-color:' + MC_IRRELEVANT_BAKGRUNN +
        ';padding:20px 32px;font-family:' + MC_FONT_STACK + ';">';
      html += '<div style="font-size:16px;line-height:22px;font-weight:bold;color:' + MC_DEEP_BLUE_500 +
        ';margin:0 0 4px 0;">Mulig irrelevant</div>';
      html += '<div style="font-size:13px;line-height:18px;color:' + MC_DEEP_BLUE_500 + ';margin:0 0 14px 0;">' +
        'Disse matchet et søkeord, men AI-vurderingen mener de trolig ikke er relevante. Sjekk selv ved tvil.</div>';
      for (var ir = 0; ir < partisjon.irrelevanteTreff.length; ir++) {
        html += byggIrrelevantRadHtmlMerkevare(partisjon.irrelevanteTreff[ir], ir === partisjon.irrelevanteTreff.length - 1);
      }
      html += '</td></tr>';
    }
  }

  // --- BUNNTEKST ---
  html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
    ';padding:20px 32px;font-family:' + MC_FONT_STACK + ';border-top:1px solid ' + MC_DEEP_BLUE_200 + ';">';
  html += '<div style="font-size:12px;line-height:18px;color:' + MC_DEEP_BLUE_500 + ';">';
  html += 'Denne e-posten sendes automatisk hver morgen av medieovervåkingsskriptet. ';
  html += 'Sammendrag, kategorisering og «Nevner oss»-vurderingen over er generert av kunstig ' +
    'intelligens (KI) og kan inneholde feil. ';
  html += 'Spørsmål? Ta kontakt med ' + escapeHtml(MC_KONTAKTPERSON_NAVN) + ' (<a href="mailto:' +
    escapeAttributt(MC_KONTAKTPERSON_EPOST) + '" style="color:' + MC_INNOVATION_BLUE + ';">' +
    escapeHtml(MC_KONTAKTPERSON_EPOST) + '</a>).';
  html += '</div>';
  html += '</td></tr>';

  html += '</table>';
  html += '</td></tr>';
  html += '</table>';
  html += '</body></html>';

  return html;
}

/**
 * Bygger HTML for ett enkelt relevant treff-kort.
 *
 * @param {Object} treff
 * @param {boolean} erSiste - true hvis dette er siste kort i kategorien
 *   (styrer om skillelinje skal tegnes under)
 * @return {string}
 */
function byggTreffKortHtmlMerkevare(treff, erSiste) {
  var html = '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
    ';padding:16px 32px ' + (erSiste ? '20px' : '16px') + ' 32px;font-family:' + MC_FONT_STACK +
    (erSiste ? '' : ';border-bottom:1px solid ' + MC_DEEP_BLUE_200) + ';">';

  // Kategori vises KUN som kategorioverskriften over kortene (se
  // byggEpostHtmlMerkevare) - ikke her ogsa, for a unnga at den samme
  // kategorien gjentas pa hvert enkelt treff. "Ikke KI-vurdert" er et
  // annet signal (treffet ble ikke vurdert i det hele tatt) og vises
  // fortsatt, uavhengig av kategori-duplisering.
  var kildeLinjeDeler = ['Kilde: ' + escapeHtml(treff.kilde), 'Søkeord: ' + escapeHtml(treff.matchendeOrd.join(', '))];
  if (treff.aiParseFeilet) {
    kildeLinjeDeler.push('Ikke KI-vurdert');
  }
  html += '<div style="font-size:12px;line-height:16px;color:' + MC_DEEP_BLUE_500 + ';margin:0 0 6px 0;">';
  if (treff.aiNevnerOss) {
    html += '<span style="font-weight:bold;color:' + MC_INNOVATION_BLUE + ';">Nevner oss</span> · ';
  }
  html += kildeLinjeDeler.join(' · ') + '</div>';

  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="display:block;font-size:19px;line-height:25px;font-weight:bold;color:' +
    MC_DEEP_BLUE + ';text-decoration:none;margin:0 0 6px 0;">' + escapeHtml(treff.tittel) + '</a>';

  var visningstekst = treff.aiSammendrag || treff.ingress;
  if (visningstekst) {
    html += '<div style="font-size:16px;line-height:22px;color:' + MC_DEEP_BLUE_700 + ';margin:0 0 10px 0;">' +
      escapeHtml(avkortTekst(visningstekst, 400)) + '</div>';
  }

  if (treff.aiNotat) {
    html += '<div style="font-size:14px;line-height:20px;color:' + MC_DEEP_BLUE_700 + ';border-left:3px solid ' +
      MC_DEEP_BLUE_200 + ';padding-left:12px;margin:0 0 10px 0;">' + escapeHtml(treff.aiNotat) + '</div>';
  }

  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="font-size:14px;line-height:18px;font-weight:bold;color:' +
    MC_INNOVATION_BLUE + ';text-decoration:underline;">Les saken →</a>';

  html += '</td></tr>';
  return html;
}

/**
 * Bygger HTML for en kompakt rad i "Mulig irrelevant"-seksjonen, inkludert
 * AI-ens korte grunn til at den ble vurdert som trolig irrelevant.
 *
 * @param {Object} treff
 * @param {boolean} erSiste
 * @return {string}
 */
function byggIrrelevantRadHtmlMerkevare(treff, erSiste) {
  var html = '<div style="' + (erSiste ? '' : 'padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid ' + MC_DEEP_BLUE_200 + ';') + '">';

  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="display:block;font-size:14px;line-height:19px;font-weight:bold;color:' +
    MC_INNOVATION_BLUE + ';text-decoration:none;margin:0 0 2px 0;">' + escapeHtml(treff.tittel) + '</a>';
  html += '<div style="font-size:12px;line-height:16px;color:' + MC_DEEP_BLUE_500 + ';margin:0 0 4px 0;">' +
    escapeHtml(treff.kilde) + '</div>';
  if (treff.aiIrrelevantGrunn) {
    html += '<div style="font-size:12px;line-height:17px;color:' + MC_DEEP_BLUE_500 + ';font-style:italic;">' +
      escapeHtml(treff.aiIrrelevantGrunn) + '</div>';
  }
  html += '</div>';
  return html;
}

/**
 * Bygger en ren tekst-versjon av e-posten, brukt som body-parameter i
 * GmailApp.sendEmail (fallback for klienter som ikke viser HTML).
 *
 * @param {Object} treffPerKategori
 * @param {number} antallOk
 * @param {number} totaltAntallKilder
 * @param {number} antallFeilet
 * @param {Array<string>} feilendeKilderNavn
 * @param {Object} aiStatistikk
 * @return {string}
 */
function byggEpostTekstversjonMerkevare(treffPerKategori, antallOk, totaltAntallKilder, antallFeilet, feilendeKilderNavn, aiStatistikk) {
  var partisjon = partisjonerTreff(treffPerKategori);
  var kategorier = Object.keys(partisjon.relevantePerKategori).sort();
  var dagensDatoTekst = Utilities.formatDate(new Date(), TIDSSONE, 'EEEE d. MMMM yyyy');

  var linjer = [];
  linjer.push('MEDIEOVERVÅKING MARITIME CLEANTECH - ' + dagensDatoTekst);
  linjer.push('');
  linjer.push(partisjon.totaltAntallTreff + ' treff i dag' +
    (partisjon.irrelevanteTreff.length > 0 ? ', hvorav ' + partisjon.irrelevanteTreff.length + ' under "Mulig irrelevant"' : '') + '.');
  linjer.push(antallOk + ' av ' + totaltAntallKilder + ' kilder hentet OK.' +
    (antallFeilet > 0 ? ' ' + antallFeilet + ' kilde(r) feilet: ' + feilendeKilderNavn.join(', ') + '.' : ''));
  if (aiStatistikk && aiStatistikk.stoppetTidlig) {
    linjer.push('AI-vurdering stoppet underveis: ' + aiStatistikk.stoppArsak);
  }
  linjer.push('');

  if (partisjon.totaltAntallTreff === 0) {
    linjer.push('Ingen treff mot søkeordlisten i dag.');
  } else {
    for (var k = 0; k < kategorier.length; k++) {
      var kategori = kategorier[k];
      linjer.push('== ' + kategori + ' ==');
      var treffListe = partisjon.relevantePerKategori[kategori];
      for (var t = 0; t < treffListe.length; t++) {
        var treff = treffListe[t];
        linjer.push(treff.tittel);
        // Kategori vises kun som "== <kategori> =="-overskriften over, ikke
        // gjentatt her - se tilsvarende kommentar i byggTreffKortHtmlMerkevare.
        var kildeLinjeTekst = 'Kilde: ' + treff.kilde + ' | Søkeord: ' + treff.matchendeOrd.join(', ');
        if (treff.aiParseFeilet) {
          kildeLinjeTekst += ' | Ikke KI-vurdert';
        }
        if (treff.aiNevnerOss) kildeLinjeTekst = 'Nevner oss | ' + kildeLinjeTekst;
        linjer.push(kildeLinjeTekst);
        var visningstekst = treff.aiSammendrag || treff.ingress;
        if (visningstekst) linjer.push(visningstekst);
        if (treff.aiNotat) linjer.push('AI-notat: ' + treff.aiNotat);
        linjer.push('Les saken: ' + treff.lenke);
        linjer.push('');
      }
    }

    if (partisjon.irrelevanteTreff.length > 0) {
      linjer.push('== Mulig irrelevant ==');
      for (var ir = 0; ir < partisjon.irrelevanteTreff.length; ir++) {
        var irTreff = partisjon.irrelevanteTreff[ir];
        linjer.push(irTreff.tittel + ' (Kilde: ' + irTreff.kilde + ')');
        if (irTreff.aiIrrelevantGrunn) linjer.push(irTreff.aiIrrelevantGrunn);
        linjer.push(irTreff.lenke);
        linjer.push('');
      }
    }
  }

  linjer.push('---');
  linjer.push('Denne e-posten sendes automatisk hver morgen av medieovervåkingsskriptet.');
  linjer.push('Sammendrag, kategorisering og «Nevner oss»-vurderingen over er generert av ' +
    'kunstig intelligens (KI) og kan inneholde feil.');
  linjer.push('Spørsmål? Ta kontakt med ' + MC_KONTAKTPERSON_NAVN + ' (' + MC_KONTAKTPERSON_EPOST + ').');

  return linjer.join('\n');
}

/**
 * Deler treffPerKategori i relevante (vises under vanlig kategori) og
 * irrelevante (aiRelevant === false, vises i egen seksjon) - samme regel
 * som byggEpostHtml() i 06_Epost.gs.
 *
 * @param {Object} treffPerKategori
 * @return {{relevantePerKategori: Object, irrelevanteTreff: Array<Object>, totaltAntallTreff: number}}
 */
function partisjonerTreff(treffPerKategori) {
  var relevantePerKategori = {};
  var irrelevanteTreff = [];
  var totaltAntallTreff = 0;

  var alleKategoriNavn = Object.keys(treffPerKategori);
  for (var k = 0; k < alleKategoriNavn.length; k++) {
    var kategoriNavn = alleKategoriNavn[k];
    var originalListe = treffPerKategori[kategoriNavn];
    for (var t = 0; t < originalListe.length; t++) {
      var treff = originalListe[t];
      totaltAntallTreff++;
      if (treff.aiRelevant === false) {
        irrelevanteTreff.push(treff);
      } else {
        if (!relevantePerKategori[kategoriNavn]) relevantePerKategori[kategoriNavn] = [];
        relevantePerKategori[kategoriNavn].push(treff);
      }
    }
  }

  return {
    relevantePerKategori: relevantePerKategori,
    irrelevanteTreff: irrelevanteTreff,
    totaltAntallTreff: totaltAntallTreff
  };
}

/**
 * Korter ned en tekst til maks antall tegn, ved naermeste ordgrense, med
 * "…" pa slutten hvis den ble korter. Kun for visning (ingress 1-2 linjer
 * i e-postkortene) - pavirker ikke hvilken tekst som faktisk sokes i andre
 * steder i skriptet (den fulle teksten brukes fortsatt til sokeordmatching
 * og AI-vurdering, kun visningen her er korter).
 *
 * @param {string} tekst
 * @param {number} maksTegn
 * @return {string}
 */
function avkortTekst(tekst, maksTegn) {
  if (!tekst || tekst.length <= maksTegn) return tekst;
  var avkortet = tekst.substring(0, maksTegn);
  var sisteMellomrom = avkortet.lastIndexOf(' ');
  if (sisteMellomrom > maksTegn * 0.6) {
    avkortet = avkortet.substring(0, sisteMellomrom);
  }
  return avkortet + '…';
}

/**
 * Sender en forhandsvisning av dagens e-postmal til DEG (skriptets eier),
 * ALDRI til den ekte mottakerlisten i "Mottakere"-fanen. Bruker fast
 * eksempeldata (ikke ekte RSS-treff) slik at du kan teste utseendet - bade
 * med og uten LOGO_FILE_ID satt - uten a bruke AI-kreditter eller pavirke
 * "Sendte artikler"/dedup-tilstanden.
 *
 * Kjor denne, sjekk e-posten i bade Gmail (nettleser) og Outlook, FOR dere
 * aktiverer det nye designet i den daglige kjoringen.
 */
function previewEmail() {
  var eier = Session.getActiveUser().getEmail();
  if (!eier) {
    Logger.log('FEIL: Klarte ikke a finne din egen e-postadresse (Session.getActiveUser().getEmail() var tom). Avbryter.');
    return;
  }

  var eksempelTreff = {
    'Energi og framdrift': [
      {
        tittel: 'Nytt hydrogenprosjekt skal kutte utslipp fra hurtigbåter',
        lenke: 'https://example.no/hydrogen-hurtigbat',
        ingress: 'Et konsortium av norske verft og redere lanserer et nytt pilotprosjekt for hydrogendrevne hurtigbåter langs vestlandskysten, med mål om nullutslipp innen 2028.',
        kilde: 'Skipsrevyen',
        matchendeOrd: ['hydrogen', 'nullutslipp'],
        aiRelevant: true,
        aiKategori: 'Energi og framdrift',
        aiSammendrag: 'Et konsortium av norske verft og redere starter et pilotprosjekt for hydrogendrevne hurtigbåter på Vestlandet. Målet er nullutslipp innen 2028.',
        aiNevnerOss: false,
        aiNotat: 'Pilotprosjektet har en investeringsramme på 80 mill. kr og skal etter planen på vannet i 2026.'
      },
      {
        tittel: 'Ocean Charger-teknologien tas i bruk på ny ferjestrekning',
        lenke: 'https://example.no/ocean-charger-ferje',
        ingress: 'Hurtigladesystemet Ocean Charger fra Maritime CleanTech-partner Kongsberg installeres nå på enda en ferjestrekning, og kutter ladetiden til under ti minutter.',
        kilde: 'Energi og Klima',
        matchendeOrd: ['Ocean Charger'],
        aiRelevant: true,
        aiKategori: 'Energi og framdrift',
        aiSammendrag: 'Hurtigladesystemet Ocean Charger, utviklet sammen med Maritime CleanTech-partner Kongsberg, tas i bruk på enda en ferjestrekning og kutter ladetiden til under ti minutter.',
        aiNevnerOss: true,
        aiNotat: ''
      },
      {
        tittel: 'Ny rapport om hydrogenfyllestasjoner langs kysten',
        lenke: 'https://example.no/hydrogenfyllestasjoner-rapport',
        ingress: 'Rapporten, utarbeidet i samarbeid med Ocean Charger-teamet, kartlegger behovet for fyllestasjoner de neste fem årene.',
        kilde: 'TU',
        matchendeOrd: ['hydrogen'],
        aiRelevant: true,
        aiKategori: '',
        aiSammendrag: '', // tom - viser at rå ingress brukes som fallback nar AI-svaret ikke kunne tolkes
        aiNevnerOss: true,
        aiNotat: '',
        aiParseFeilet: true
      }
    ],
    'Politikk og regulering': [
      {
        tittel: 'Regjeringen varsler nye krav til utslippsfri skipsfart i fjordene',
        lenke: 'https://example.no/regjeringen-utslippsfri-fjord',
        ingress: 'Klima- og miljødepartementet legger frem forslag om strengere utslippskrav for cruiseskip og ferjer i verdensarvfjordene fra 2026.',
        kilde: 'Aftenposten',
        matchendeOrd: ['Grønn skipsfart'],
        aiRelevant: true,
        aiKategori: 'Politikk og regulering',
        aiNevnerOss: false,
        aiNotat: 'Kravet trer i kraft fra 1. januar 2026 og gjelder alle fartøy over 10 000 bruttotonn.'
      },
      {
        tittel: 'Lokalt fotballag henter inn ny spiller fra Apollo IF',
        lenke: 'https://example.no/apollo-fotball',
        ingress: 'Klubben bekrefter overgangen etter flere ukers forhandlinger.',
        kilde: 'Lokalavisen',
        matchendeOrd: ['Apollo'],
        aiRelevant: false,
        aiKategori: '',
        aiNevnerOss: false,
        aiNotat: '',
        aiIrrelevantGrunn: 'Apollo viser til et fotballag, ikke et maritimt prosjekt.'
      }
    ]
  };

  var eksempelAiStatistikk = {
    antallKall: 3, tokensInn: 450, tokensUt: 210, kostnad: 0.000345,
    feil: [], stoppetTidlig: false, stoppArsak: ''
  };

  Logger.log('=== previewEmail(): sender forhandsvisning til ' + eier + ' (ALDRI til Mottakere-fanen) ===');

  var logoResultat = hentLogoBlob();
  Logger.log('Logo: ' + (logoResultat.blob ? 'hentet OK' : 'IKKE hentet - ' + logoResultat.feilmelding));

  var html = byggEpostHtmlMerkevare(eksempelTreff, 7, 8, 1, ['Eksempel Avis'], eksempelAiStatistikk, !!logoResultat.blob);
  var tekstversjon = byggEpostTekstversjonMerkevare(eksempelTreff, 7, 8, 1, ['Eksempel Avis'], eksempelAiStatistikk);

  var dagensDato = Utilities.formatDate(new Date(), TIDSSONE, 'dd.MM.yyyy');
  var emne = '[TEST] Medieovervåking Maritime CleanTech (test) - ' + dagensDato;
  var options = { htmlBody: html };
  if (logoResultat.blob) {
    options.inlineImages = { logo: logoResultat.blob };
  }

  GmailApp.sendEmail(eier, emne, tekstversjon, options);

  Logger.log('Forhandsvisning sendt til ' + eier + '. Sjekk innboksen din (Gmail i nettleser, og gjerne ' +
    'ogsa Outlook hvis du har tilgang til a apne/videresende den der).');
  Logger.log('For a se BEGGE logo-variantene: kjor previewEmail() en gang med LOGO_FILE_ID satt, ' +
    'og en gang med LOGO_FILE_ID fjernet/tom.');
}
