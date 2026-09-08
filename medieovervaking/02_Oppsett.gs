/**
 * 02_Oppsett.gs
 *
 * Forste-gangs-oppsett av regnearket. Kjor funksjonen "forsteGangsOppsett"
 * EN gang etter at du har limt inn all koden - da opprettes de fem fanene
 * skriptet trenger, med riktige kolonneoverskrifter, dersom de ikke
 * allerede finnes.
 *
 * Det er trygt a kjore denne flere ganger: faner som allerede finnes
 * blir ikke rort eller tomt (ingen data slettes).
 */

/**
 * Oppretter manglende faner med riktige kolonneoverskrifter.
 * Kjores manuelt fra Apps Script-editoren (velg funksjonen i nedtrekksmenyen
 * ovenst og trykk "Kjor"/"Run").
 */
function forsteGangsOppsett() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  opprettFaneHvisManglende(ss, FANE_KILDER,
    ['Navn', 'RSS-URL', 'Kategori', 'Status', 'Sist verifisert', 'Antall treff siste kjøring']);

  opprettFaneHvisManglende(ss, FANE_SOKEORD,
    ['Søkeord', 'Tier', 'Kontekstord']);

  opprettFaneHvisManglende(ss, FANE_MOTTAKERE,
    ['E-post']);

  opprettFaneHvisManglende(ss, FANE_SENDTE_ARTIKLER,
    ['URL', 'Dato lagt til', 'Overskrift']);

  opprettFaneHvisManglende(ss, FANE_KJORINGSLOGG,
    ['Tidspunkt', 'Kilde', 'Status', 'Feilmelding', 'Antall treff']);

  Logger.log('=== Forste gangs oppsett fullfort ===');
  Logger.log('Sjekk at disse fem fanene finnes nederst i regnearket:');
  Logger.log('1. ' + FANE_KILDER + '  (fyll inn kilder du vil overvake)');
  Logger.log('2. ' + FANE_SOKEORD + '  (fyll inn sokeord, se README for Tier 1/2)');
  Logger.log('3. ' + FANE_MOTTAKERE + '  (fyll inn e-postadresser som skal motta rapporten)');
  Logger.log('4. ' + FANE_SENDTE_ARTIKLER + '  (fylles automatisk av skriptet - ikke rediger)');
  Logger.log('5. ' + FANE_KJORINGSLOGG + '  (fylles automatisk av skriptet - ikke rediger)');
  Logger.log('Ga til "Utforelseslogg" ("Execution log") i menyen til venstre for a se denne teksten.');
}

/**
 * Oppretter en fane med gitte kolonneoverskrifter hvis den ikke finnes fra for.
 *
 * @param {Spreadsheet} ss
 * @param {string} faneNavn
 * @param {Array<string>} overskrifter
 */
function opprettFaneHvisManglende(ss, faneNavn, overskrifter) {
  var eksisterendeArk = ss.getSheetByName(faneNavn);
  if (eksisterendeArk) {
    Logger.log('Fanen "' + faneNavn + '" finnes allerede - rorer den ikke.');
    return;
  }

  var nyttArk = ss.insertSheet(faneNavn);
  nyttArk.getRange(1, 1, 1, overskrifter.length).setValues([overskrifter]);
  nyttArk.getRange(1, 1, 1, overskrifter.length).setFontWeight('bold');
  nyttArk.setFrozenRows(1);
  nyttArk.autoResizeColumns(1, overskrifter.length);

  Logger.log('Opprettet fane "' + faneNavn + '" med overskrifter: ' + overskrifter.join(' | '));
}
