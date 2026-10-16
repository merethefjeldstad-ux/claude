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
 * Fargepalett, logo og organisasjonsnavn under er Maritime CleanTechs
 * FASTE merkevareprofil (maritimecleantech.no/brand) - denne malen er
 * ment for NYE OVERVAKINGSTEMAER innenfor SAMME organisasjon, sa
 * fargene/logoen skal IKKE endres fra ark til ark. Det som varierer per
 * overvaking er PROSJEKTNAVN (temaet, brukt i tittel/emnefelt) og
 * KONTAKTPERSON_NAVN/KONTAKTPERSON_EPOST (begge i 01_Konfigurasjon.gs) -
 * ikke selve merkevaren.
 *
 * Tabellbasert layout med inline CSS + bgcolor-attributter (for best mulig
 * visning i Outlook). Ingen CSS-gradienter, ingen webfonter, ingen
 * JavaScript.
 *
 * MERK (avrundede hjorner pa KI-notat-boksen): border-radius respekteres
 * av Gmail og Apple Mail, men IKKE av Outlook (skrivebord, Word-motoren) -
 * der vises boksen med rette hjorner. Dette er en kjent begrensning i
 * HTML-e-post pa tvers av klienter, ikke noe som kan rettes med ren CSS.
 */

// --- Offisielle Maritime CleanTech-farger (maritimecleantech.no/brand) -
// faste for organisasjonen, IKKE noe som endres per overvakingstema ---
var MC_DEEP_BLUE = '#001530';           // overskrifter, tittel
var MC_DEEP_BLUE_700 = '#314257';       // brodtekst
var MC_DEEP_BLUE_500 = '#626F7F';       // dempet tekst (kilde, dato, bunntekst)
var MC_DEEP_BLUE_200 = '#C4C8CE';       // skillelinjer
var MC_BAKGRUNN_KORT = '#FFFFFF';       // bakgrunn i selve e-posten
var MC_BAKGRUNN_YTRE = '#E6E9ED';       // bakgrunn bak e-postkortet
var MC_MINT_BAKGRUNN = '#E9FFF0';       // KI-notat-boks
var MC_INNOVATION_BLUE = '#0066FF';     // lenker og "Les saken"
var MC_IRRELEVANT_BAKGRUNN = '#F5F5F5'; // "Mulig irrelevant"-seksjon

var MC_FONT_STACK = 'Inter, Arial, Helvetica, sans-serif';
var MC_ORGANISASJONSNAVN = 'Maritime CleanTech'; // vises i logo-alt-tekst og tekstlogo-fallback

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
 * inlinebilde hvis den ble hentet. tekstversjon brukes som body-parameter
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
  var emne = 'Medieovervåking ' + PROSJEKTNAVN + ' (test) - ' + dagensDato;

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
  // Logo (eller tekstlogo med organisasjonsnavnet - MC_ORGANISASJONSNAVN,
  // IKKE PROSJEKTNAVN, siden logoen representerer organisasjonen, ikke
  // overvakingstemaet) oppe til venstre, deretter tittel, deretter dato.
  // Luft rundt selve logoen holdes med en egen wrapping-div (padding-bottom)
  // slik at <img>-taggens style-attributt forblir noyaktig slik spesifisert,
  // uten ekstra inline-stiler pa den. Juster padding-verdien under hvis det
  // ikke matcher logoens faktiske proporsjoner.
  html += '<tr><td bgcolor="' + MC_BAKGRUNN_KORT + '" style="background-color:' + MC_BAKGRUNN_KORT +
    ';padding:24px 32px 20px 32px;border-bottom:1px solid ' + MC_DEEP_BLUE_200 + ';font-family:' + MC_FONT_STACK + ';">';
  if (harLogo) {
    html += '<div style="padding:0 0 20px 0;">' +
      '<img src="cid:logo" alt="' + escapeAttributt(MC_ORGANISASJONSNAVN) + '" height="40" style="display:block;border:0;height:40px;width:auto;">' +
      '</div>';
  } else {
    html += '<div style="font-size:18px;font-weight:bold;color:' + MC_DEEP_BLUE + ';margin:0 0 20px 0;">' +
      escapeHtml(MC_ORGANISASJONSNAVN) + '</div>';
  }
  html += '<div style="font-size:30px;line-height:36px;font-weight:bold;color:' + MC_DEEP_BLUE + ';margin:0;">Dagens medietreff.</div>';
  // PROSJEKTNAVN (overvakingstemaet) vises her - ikke i logoen/tekstlogoen
  // over, som alltid viser organisasjonen (Maritime CleanTech). Viktig nar
  // samme mottaker far flere ulike temaovervakinger fra samme organisasjon.
  html += '<div style="font-size:16px;line-height:22px;font-weight:bold;color:' + MC_DEEP_BLUE_500 + ';margin:4px 0 0 0;">' +
    escapeHtml(PROSJEKTNAVN) + '</div>';
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
  html += 'Spørsmål? Ta kontakt med ' + escapeHtml(KONTAKTPERSON_NAVN) + ' (<a href="mailto:' +
    escapeAttributt(KONTAKTPERSON_EPOST) + '" style="color:' + MC_INNOVATION_BLUE + ';">' +
    escapeHtml(KONTAKTPERSON_EPOST) + '</a>).';
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

  html += '<div style="font-size:12px;line-height:16px;color:' + MC_DEEP_BLUE_500 + ';margin:0 0 6px 0;">' +
    escapeHtml(treff.kilde) + ' · ' + escapeHtml(treff.matchendeOrd.join(', ')) + '</div>';

  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="display:block;font-size:19px;line-height:25px;font-weight:bold;color:' +
    MC_INNOVATION_BLUE + ';text-decoration:none;margin:0 0 6px 0;">' + escapeHtml(treff.tittel) + '</a>';

  if (treff.ingress) {
    html += '<div style="font-size:16px;line-height:22px;color:' + MC_DEEP_BLUE_700 + ';margin:0 0 10px 0;">' +
      escapeHtml(avkortTekst(treff.ingress, 180)) + '</div>';
  }

  if (treff.aiNotat) {
    html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
      MC_MINT_BAKGRUNN + '" style="background-color:' + MC_MINT_BAKGRUNN + ';border-radius:8px;margin:0 0 10px 0;">' +
      '<tr><td style="padding:12px 14px;border-radius:8px;">';
    html += '<div style="font-size:14px;line-height:20px;color:' + MC_DEEP_BLUE + ';">' + escapeHtml(treff.aiNotat) + '</div>';
    html += '</td></tr></table>';
  }

  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="font-size:14px;line-height:18px;font-weight:bold;color:' +
    MC_INNOVATION_BLUE + ';text-decoration:none;">Les saken →</a>';

  html += '</td></tr>';
  return html;
}

/**
 * Bygger HTML for en kompakt rad i "Mulig irrelevant"-seksjonen, inkludert
 * AI-ens begrunnelse for hvorfor den ble vurdert som trolig irrelevant.
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
  if (treff.aiBegrunnelse) {
    html += '<div style="font-size:12px;line-height:17px;color:' + MC_DEEP_BLUE_500 + ';font-style:italic;">' +
      escapeHtml(treff.aiBegrunnelse) + '</div>';
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
  linjer.push(MC_ORGANISASJONSNAVN.toUpperCase() + ' - MEDIEOVERVÅKING ' + PROSJEKTNAVN.toUpperCase() + ' - ' + dagensDatoTekst);
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
        linjer.push('Kilde: ' + treff.kilde + ' | Søkeord: ' + treff.matchendeOrd.join(', '));
        if (treff.ingress) linjer.push(treff.ingress);
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
        if (irTreff.aiBegrunnelse) linjer.push('AI-begrunnelse: ' + irTreff.aiBegrunnelse);
        linjer.push(irTreff.lenke);
        linjer.push('');
      }
    }
  }

  linjer.push('---');
  linjer.push('Denne e-posten sendes automatisk hver morgen av medieovervåkingsskriptet.');
  linjer.push('Spørsmål? Ta kontakt med ' + KONTAKTPERSON_NAVN + ' (' + KONTAKTPERSON_EPOST + ').');

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
 * eksempeldata (ikke ekte RSS-treff, og ikke knyttet til noe bestemt
 * overvakingstema) slik at du kan teste utseendet - bade med og uten
 * LOGO_FILE_ID satt - uten a bruke AI-kreditter eller pavirke
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
    'Eksempelkategori A': [
      {
        tittel: 'Eksempeloverskrift som viser hvordan et treff ser ut',
        lenke: 'https://example.no/eksempel-1',
        ingress: 'Dette er eksempel-ingress som viser hvor mye tekst som typisk vises under en overskrift, slik at du kan vurdere hvordan avkorting og linjehoyde ser ut i praksis.',
        kilde: 'Eksempel Avis',
        matchendeOrd: ['eksempelord'],
        aiRelevant: true,
        aiNotat: 'Dette er et eksempel pa hvordan et AI-notat ser ut i den mint-fargede boksen under ingressen.'
      },
      {
        tittel: 'Et treff uten AI-notat (f.eks. AI avslatt, eller ikke rukket a vurdere)',
        lenke: 'https://example.no/eksempel-2',
        ingress: 'Dette treffet har ingen AI-notat, slik at du kan se hvordan kortet ser ut uten den mint-fargede boksen.',
        kilde: 'En Annen Kilde',
        matchendeOrd: ['eksempelord 2'],
        aiRelevant: true,
        aiNotat: ''
      }
    ],
    'Eksempelkategori B': [
      {
        tittel: 'Et treff AI-en vurderer som trolig irrelevant',
        lenke: 'https://example.no/eksempel-irrelevant',
        ingress: 'Dette treffet havner i "Mulig irrelevant"-seksjonen nederst.',
        kilde: 'Tredje Kilde',
        matchendeOrd: ['tvetydig-sokeord'],
        aiRelevant: false,
        aiNotat: '',
        aiBegrunnelse: 'Eksempel pa AI-ens begrunnelse for hvorfor dette trolig ikke er relevant for ' + PROSJEKTNAVN + '.'
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
  var emne = '[TEST] Medieovervåking ' + PROSJEKTNAVN + ' (test) - ' + dagensDato;
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
