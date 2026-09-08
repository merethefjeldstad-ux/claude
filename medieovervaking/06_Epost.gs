/**
 * 06_Epost.gs
 *
 * Bygger og sender den daglige HTML-e-posten.
 *
 * Fase 1 bruker den ra RSS-ingressen direkte - ingen AI er involvert.
 * OVERST i e-posten vises alltid en statusoppsummering over hvor mange
 * kilder som ble hentet OK/FEILET - dette ER hovedhensikten med Fase 1,
 * sa brukeren kan se kildedekningen uten a apne regnearket.
 *
 * Visuell stil folger Maritime CleanTechs merkevareprofil (se
 * maritime-cleantech-brand-referansen: navy/hvit/mint/himmelbla/perlebla
 * fargepalett, avrundede kort, kort "kicker"-etiketter over overskrifter).
 */

// ---------------------------------------------------------------------
// Maritime CleanTech-fargepalett (hentet fra merkevareprofilen)
// ---------------------------------------------------------------------
var FARGE_NAVY = '#09152E';       // overskrifter
var FARGE_BODY = '#313F54';       // brodtekst
var FARGE_BG = '#FFFFFF';
var FARGE_BG_SOFT = '#F3F6FA';    // kortbakgrunn / ytre bakgrunn
var FARGE_RULE = '#DDE4EE';       // tynne skillelinjer
var FARGE_NOTE_BG = '#FBF7EC';    // statusboks-bakgrunn
var FARGE_NOTE_EDGE = '#E7D9A8';
var FARGE_NOTE_INK = '#5B4E24';
var FARGE_FEIL = '#B00020';       // feilstatus - egen semantisk farge, ikke merkevarefarge
var FARGE_PERI_A = '#9CB8F9';     // header-gradient (perlebla)
var FARGE_PERI_B = '#577DF6';
var FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Aksentfarger som gar pa rundgang per kategori (mint / himmelbla / perlebla)
var KATEGORI_AKSENTER = ['#9CF5D3', '#BAE6F9', '#577DF6'];

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

  var datoTekst = Utilities.formatDate(new Date(), TIDSSONE, 'EEEE d. MMMM yyyy');

  // --- Statusoppsummering: hovedhensikten med Fase 1 ---
  var statusHtml = '<div style="background:' + FARGE_NOTE_BG + '; border:1px solid ' + FARGE_NOTE_EDGE + '; ' +
    'border-radius:12px; padding:16px 18px; margin:0 0 28px;">';
  statusHtml += '<p style="font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; ' +
    'color:' + FARGE_NOTE_INK + '; margin:0 0 6px;">Kildestatus</p>';
  statusHtml += '<p style="font-size:13.5px; line-height:1.55; color:' + FARGE_NOTE_INK + '; margin:0;">' +
    antallOk + ' av ' + totaltAntallKilder + ' kilder hentet OK.';
  if (antallFeilet > 0) {
    statusHtml += '<br><span style="color:' + FARGE_FEIL + '; font-weight:600;">' + antallFeilet +
      ' kilde(r) feilet: ' + feilendeKilderNavn.map(escapeHtml).join(', ') +
      '.</span> Se fanen &laquo;' + FANE_KJORINGSLOGG + '&raquo; i regnearket for feilmeldinger.';
  }
  statusHtml += '</p></div>';

  // --- Nyhetsseksjoner, gruppert pa kategori ---
  var innholdHtml;
  if (totaltAntallTreff === 0) {
    innholdHtml = '<div style="background:' + FARGE_BG + '; border:1px dashed ' + FARGE_RULE + '; ' +
      'border-radius:12px; padding:16px 18px; margin:0 0 8px;">' +
      '<p style="font-size:13.5px; line-height:1.6; color:#6B7688; margin:0;">Ingen treff mot sokeordlisten i dag.</p>' +
      '</div>';
  } else {
    innholdHtml = '';
    for (var k = 0; k < kategorier.length; k++) {
      var kategori = kategorier[k];
      var treffListe = treffPerKategori[kategori];
      var aksent = KATEGORI_AKSENTER[k % KATEGORI_AKSENTER.length];

      innholdHtml += '<div style="margin:0 0 28px;">';
      innholdHtml += '<h2 style="font-size:15.5px; font-weight:700; color:' + FARGE_NAVY + '; margin:0 0 14px; ' +
        'letter-spacing:.01em;">' + escapeHtml(kategori) + ' (' + treffListe.length + ')</h2>';

      for (var t = 0; t < treffListe.length; t++) {
        var treff = treffListe[t];
        innholdHtml += '<div style="border-left:3px solid ' + aksent + '; background:' + FARGE_BG_SOFT + '; ' +
          'border-radius:0 10px 10px 0; padding:16px 18px; margin:0 0 12px;">';
        innholdHtml += '<h3 style="font-size:14.5px; font-weight:700; margin:0 0 6px; line-height:1.4;">' +
          '<a href="' + escapeAttributt(treff.lenke) + '" style="color:' + FARGE_NAVY + '; text-decoration:none;">' +
          escapeHtml(treff.tittel) + '</a></h3>';
        innholdHtml += '<p style="font-size:12.5px; color:#5C6980; margin:0 0 8px;">Kilde: ' + escapeHtml(treff.kilde) + '</p>';

        if (treff.ingress) {
          // Fase 1: rå RSS-ingress vises direkte, ingen AI-bearbeiding.
          // I Fase 2 vil et Claude-generert 1-2 setnings sammendrag (og en
          // RELEVANT JA/NEI-vurdering for Tier 2-treff) kunne vises her i
          // stedet, med fallback til nettopp denne ra ingressen dersom
          // AI-kallet feiler. Se README for planen for Fase 2.
          innholdHtml += '<p style="font-size:13.5px; line-height:1.62; color:' + FARGE_BODY + '; margin:0 0 8px;">' +
            escapeHtml(treff.ingress) + '</p>';
        }

        innholdHtml += '<p style="font-size:12.5px; color:#8C97AC; margin:0;">Treff pa sokeord: ' +
          escapeHtml(treff.matchendeOrd.join(', ')) + '</p>';
        innholdHtml += '</div>';
      }

      innholdHtml += '</div>';
    }
  }

  var html = '<div style="background:' + FARGE_BG_SOFT + '; margin:0; padding:24px 0; font-family:' + FONT_STACK + ';">' +
    '<div style="max-width:640px; margin:0 auto; background:' + FARGE_BG + '; border-radius:18px; overflow:hidden;">' +

    // Header: perlebla-gradient banner
    '<div style="background:linear-gradient(135deg, ' + FARGE_PERI_A + ' 0%, ' + FARGE_PERI_B + ' 100%); ' +
    'padding:32px 36px 28px;">' +
    '<p style="text-transform:uppercase; letter-spacing:.09em; font-size:11.5px; font-weight:700; ' +
    'color:rgba(9,21,46,0.72); margin:0 0 10px;">Daglig medieovervaking</p>' +
    '<p style="font-size:15px; font-weight:800; color:' + FARGE_NAVY + '; margin:0 0 4px; letter-spacing:.01em;">' +
    'Maritime CleanTech</p>' +
    '<h1 style="font-size:24px; line-height:1.25; font-weight:800; color:' + FARGE_NAVY + '; margin:0 0 6px;">' +
    'Medieovervaking (test)</h1>' +
    '<p style="font-size:13.5px; font-weight:500; color:rgba(9,21,46,0.75); margin:0;">' + datoTekst + '</p>' +
    '</div>' +

    // Body
    '<div style="padding:26px 36px 6px;">' + statusHtml + innholdHtml + '</div>' +

    // Footer
    '<div style="padding:22px 36px 30px; border-top:1px solid ' + FARGE_RULE + ';">' +
    '<p style="font-size:11px; line-height:1.6; color:#8C97AC; margin:0;">' +
    'Automatisk generert av medieovervakingsskriptet (Fase 1 - ingen AI-behandling er brukt, ' +
    'treff hentes direkte fra RSS-ingress).</p>' +
    '</div>' +

    '</div></div>';

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
