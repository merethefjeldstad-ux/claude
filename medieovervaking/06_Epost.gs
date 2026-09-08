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
 * @param {Object} treffPerKategori - {kategori: [treffobjekter]}
 * @param {number} antallOk - antall kilder hentet uten feil
 * @param {number} totaltAntallKilder
 * @param {number} antallFeilet
 * @param {Array<string>} feilendeKilderNavn
 * @return {string} ferdig HTML-dokument
 */
function byggEpostHtml(treffPerKategori, antallOk, totaltAntallKilder, antallFeilet, feilendeKilderNavn) {
  var kategorier = Object.keys(treffPerKategori).sort();
  var totaltAntallTreff = 0;
  for (var i = 0; i < kategorier.length; i++) {
    totaltAntallTreff += treffPerKategori[kategorier[i]].length;
  }

  var html = '<html><body style="font-family: Arial, sans-serif; color: #222; font-size: 14px;">';
  html += '<h2 style="margin-bottom:4px;">Medieovervåking Maritime CleanTech (test)</h2>';
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
  html += '</div>';

  if (totaltAntallTreff === 0) {
    html += '<p>Ingen treff mot sokeordlisten i dag.</p>';
  } else {
    for (var k = 0; k < kategorier.length; k++) {
      var kategori = kategorier[k];
      var treffListe = treffPerKategori[kategori];

      html += '<h3 style="border-bottom:1px solid #ccc; padding-bottom:4px;">' +
        escapeHtml(kategori) + ' (' + treffListe.length + ')</h3>';
      html += '<ul style="padding-left:18px;">';

      for (var t = 0; t < treffListe.length; t++) {
        var treff = treffListe[t];
        html += '<li style="margin-bottom:14px;">';
        html += '<a href="' + escapeAttributt(treff.lenke) + '" style="font-weight:bold; text-decoration:none; color:#0b5394;">' +
          escapeHtml(treff.tittel) + '</a><br>';
        html += '<span style="font-size:12px; color:#666;">Kilde: ' + escapeHtml(treff.kilde) + '</span><br>';

        if (treff.ingress) {
          // Fase 1: rå RSS-ingress vises direkte, ingen AI-bearbeiding.
          // I Fase 2 vil et Claude-generert 1-2 setnings sammendrag (og en
          // RELEVANT JA/NEI-vurdering for Tier 2-treff) kunne vises her i
          // stedet, med fallback til nettopp denne ra ingressen dersom
          // AI-kallet feiler. Se README for planen for Fase 2.
          html += '<span>' + escapeHtml(treff.ingress) + '</span><br>';
        }

        html += '<span style="font-size:12px; color:#888;">Treff pa sokeord: ' +
          escapeHtml(treff.matchendeOrd.join(', ')) + '</span>';
        html += '</li>';
      }

      html += '</ul>';
    }
  }

  html += '<hr style="margin-top:24px; border:none; border-top:1px solid #ddd;">';
  html += '<p style="font-size:11px; color:#999;">Automatisk generert av medieovervakingsskriptet ' +
    '(Fase 1 - ingen AI-behandling er brukt, treff hentes direkte fra RSS-ingress).</p>';
  html += '</body></html>';

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
  var emne = 'Medieovervåking Maritime CleanTech (test) - ' + dagensDato;

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
