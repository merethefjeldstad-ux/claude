/**
 * 06_Epost.gs
 *
 * Bygger og sender den daglige HTML-e-posten.
 *
 * Fase 1 bruker den ra RSS-ingressen direkte - ingen AI er involvert.
 * OVERST i e-posten vises alltid en statusoppsummering over hvor mange
 * kilder som ble hentet OK/FEILET - dette ER hovedhensikten med Fase 1,
 * sa brukeren kan se kildedekningen uten a apne regnearket.
 */

/**
 * Bygger HTML-innholdet i e-posten.
 *
 * Treff med aiRelevant === false (AI-en vurderer det som trolig IKKE
 * relevant) fjernes ALDRI fra e-posten - de samles i en egen seksjon
 * "Mulig irrelevant" nederst, i stedet for a sta under sin vanlige
 * kategori. Treff uten AI-vurdering (AI avslatt, tidsbudsjett brukt opp,
 * feil) eller vurdert relevant vises som for, med AI-notatet (hvis noe)
 * lagt til under ingressen.
 *
 * @param {Object} treffPerKategori - {kategori: [treffobjekter]}. Hvert
 *   treff kan ha .aiRelevant (true/false/null) og .aiNotat (string) satt
 *   av vurderTreffMedAI() i 10_AIIntegrasjon.gs.
 * @param {number} antallOk - antall kilder hentet uten feil
 * @param {number} totaltAntallKilder
 * @param {number} antallFeilet
 * @param {Array<string>} feilendeKilderNavn
 * @param {Object} [aiStatistikk] - fra vurderTreffMedAI(), brukes kun for
 *   a vise om AI var aktiv og om den stoppet tidlig. Valgfri - utelates
 *   gir samme oppforsel som ren Fase 1.
 * @return {string} ferdig HTML-dokument
 */
function byggEpostHtml(treffPerKategori, antallOk, totaltAntallKilder, antallFeilet, feilendeKilderNavn, aiStatistikk) {
  // --- Del opp i "vanlig visning" (relevant eller ikke vurdert) og
  // "mulig irrelevant" (AI mener trolig ikke relevant) ---
  var relevantePerKategori = {};
  var irrelevanteTreff = [];
  var totaltAntallTreff = 0;

  var alleKategoriNavn = Object.keys(treffPerKategori).sort();
  for (var k0 = 0; k0 < alleKategoriNavn.length; k0++) {
    var kategoriNavn = alleKategoriNavn[k0];
    var originalListe = treffPerKategori[kategoriNavn];
    for (var t0 = 0; t0 < originalListe.length; t0++) {
      var enkeltTreff = originalListe[t0];
      totaltAntallTreff++;
      if (enkeltTreff.aiRelevant === false) {
        irrelevanteTreff.push(enkeltTreff);
      } else {
        if (!relevantePerKategori[kategoriNavn]) relevantePerKategori[kategoriNavn] = [];
        relevantePerKategori[kategoriNavn].push(enkeltTreff);
      }
    }
  }
  var kategorier = Object.keys(relevantePerKategori).sort();

  var aiVarAktiv = !!(aiStatistikk && aiStatistikk.antallKall > 0);

  var html = '<html><body style="font-family: Arial, sans-serif; color: #222; font-size: 14px;">';
  html += '<h2 style="margin-bottom:4px;">Medieovervåking ' + escapeHtml(PROSJEKTNAVN) + ' (test)</h2>';
  html += '<p style="font-size:13px; color:#555; margin-top:0;">' +
    Utilities.formatDate(new Date(), TIDSSONE, 'EEEE d. MMMM yyyy') + '</p>';

  // --- Statusoppsummering: hovedhensikten med Fase 1 ---
  html += '<div style="background:#f2f2f2; border-left:4px solid #666; padding:10px 14px; margin-bottom:18px;">';
  html += '<strong>Kildestatus:</strong> ' + antallOk + ' av ' + totaltAntallKilder + ' kilder hentet OK.';
  if (antallFeilet > 0) {
    html += '<br><span style="color:#b00020;">' + antallFeilet + ' kilde(r) feilet: ' +
      feilendeKilderNavn.map(escapeHtml).join(', ') +
      '. Se fanen "' + FANE_KJORINGSLOGG + '" i regnearket for feilmeldinger.</span>';
  }
  if (aiStatistikk && aiStatistikk.stoppetTidlig) {
    html += '<br><span style="color:#b00020;">AI-vurdering stoppet underveis: ' +
      escapeHtml(aiStatistikk.stoppArsak) + ' Resterende treff vises uten AI-notat.</span>';
  }
  html += '</div>';

  if (totaltAntallTreff === 0) {
    html += '<p>Ingen treff mot sokeordlisten i dag.</p>';
  } else {
    for (var k = 0; k < kategorier.length; k++) {
      var kategori = kategorier[k];
      var treffListe = relevantePerKategori[kategori];

      html += '<h3 style="border-bottom:1px solid #ccc; padding-bottom:4px;">' +
        escapeHtml(kategori) + ' (' + treffListe.length + ')</h3>';
      html += '<ul style="padding-left:18px;">';

      for (var t = 0; t < treffListe.length; t++) {
        html += byggTreffHtml(treffListe[t]);
      }

      html += '</ul>';
    }

    if (irrelevanteTreff.length > 0) {
      html += '<h3 style="border-bottom:1px solid #ccc; padding-bottom:4px; color:#888; margin-top:28px;">' +
        'Mulig irrelevant (' + irrelevanteTreff.length + ')</h3>';
      html += '<p style="font-size:12px; color:#888; margin-top:-6px;">Disse matchet et sokeord, men ' +
        'AI-vurderingen mener de trolig ikke er relevante for ' + escapeHtml(PROSJEKTNAVN) + '. Sjekk selv ved tvil.</p>';
      html += '<ul style="padding-left:18px;">';
      for (var ir = 0; ir < irrelevanteTreff.length; ir++) {
        html += byggTreffHtml(irrelevanteTreff[ir]);
      }
      html += '</ul>';
    }
  }

  html += '<hr style="margin-top:24px; border:none; border-top:1px solid #ddd;">';
  html += '<p style="font-size:11px; color:#999;">Automatisk generert av medieovervakingsskriptet' +
    (aiVarAktiv
      ? ' (Fase 2 - AI vurderer relevans og skriver notat for nye treff).'
      : ' (Fase 1 - ingen AI-behandling er brukt, treff hentes direkte fra RSS-ingress).') +
    '</p>';
  html += '</body></html>';

  return html;
}

/**
 * Bygger HTML for ett enkelt treff (brukes bade i vanlig kategori-visning
 * og i "Mulig irrelevant"-seksjonen).
 *
 * @param {Object} treff
 * @return {string}
 */
function byggTreffHtml(treff) {
  var html = '<li style="margin-bottom:14px;">';
  html += '<a href="' + escapeAttributt(treff.lenke) + '" style="font-weight:bold; text-decoration:none; color:#0b5394;">' +
    escapeHtml(treff.tittel) + '</a><br>';
  html += '<span style="font-size:12px; color:#666;">Kilde: ' + escapeHtml(treff.kilde) + '</span><br>';

  if (treff.ingress) {
    // Fase 1: ra RSS-ingress. Fase 2: AI-notatet under (hvis satt) kommer
    // i TILLEGG til ingressen, ikke i stedet for - se treff.aiNotat under.
    html += '<span>' + escapeHtml(treff.ingress) + '</span><br>';
  }

  if (treff.aiNotat) {
    html += '<span style="font-size:12px; color:#555; font-style:italic;">AI-notat: ' +
      escapeHtml(treff.aiNotat) + '</span><br>';
  }

  html += '<span style="font-size:12px; color:#888;">Treff pa sokeord: ' +
    escapeHtml(treff.matchendeOrd.join(', ')) + '</span>';
  html += '</li>';
  return html;
}

/**
 * Sender e-posten til alle mottakere via GmailApp.
 *
 * @param {Array<string>} mottakere
 * @param {string} html
 */
function sendEpost(mottakere, html) {
  if (mottakere.length === 0) {
    Logger.log('ADVARSEL: Ingen mottakere funnet i fanen "' + FANE_MOTTAKERE + '" - e-post ble IKKE sendt.');
    return;
  }

  var dagensDato = Utilities.formatDate(new Date(), TIDSSONE, 'dd.MM.yyyy');
  var emne = 'Medieovervåking ' + PROSJEKTNAVN + ' (test) - ' + dagensDato;

  GmailApp.sendEmail(mottakere.join(','), emne, 'Denne e-posten krever HTML-visning for a vises riktig.', {
    htmlBody: html
  });
}

/**
 * Enkel escaping av tekst som settes inn i HTML, for a unnga at spesialtegn
 * (< > & " ') odelegger oppsettet i e-posten.
 *
 * @param {string} tekst
 * @return {string}
 */
function escapeHtml(tekst) {
  if (tekst === null || tekst === undefined) return '';
  return String(tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escaping av en URL som settes inn i et href-attributt.
 *
 * @param {string} url
 * @return {string}
 */
function escapeAttributt(url) {
  if (!url) return '#';
  return String(url).replace(/"/g, '%22');
}
