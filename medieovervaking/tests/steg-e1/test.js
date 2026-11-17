var fs = require('fs');
var path = require('path');

// renseHtml() (brukt av extractMainContent) bor til i 03_RSSHenting.gs -
// eval den forst, sa selve 14_Tekstgrunnlag.gs, samme globale scope som
// Apps Script gir pa tvers av filer (alfabetisk lastet: 03 for 14).
eval(fs.readFileSync('/home/user/claude/medieovervaking/03_RSSHenting.gs', 'utf8'));
eval(fs.readFileSync('/home/user/claude/medieovervaking/14_Tekstgrunnlag.gs', 'utf8'));

var feil = 0;
function assert(betingelse, beskrivelse) {
  console.log((betingelse ? 'OK  ' : 'FEIL') + ' - ' + beskrivelse);
  if (!betingelse) feil++;
}
function assertEqual(faktisk, forventet, beskrivelse) {
  var ok = JSON.stringify(faktisk) === JSON.stringify(forventet);
  console.log((ok ? 'OK  ' : 'FEIL') + ' - ' + beskrivelse);
  if (!ok) {
    console.log('     forventet: ' + JSON.stringify(forventet));
    console.log('     faktisk:   ' + JSON.stringify(faktisk));
    feil++;
  }
}

console.log('=== extractMainContent: fixture med promotert sak ===');
var htmlPromotert = fs.readFileSync(path.join(__dirname, 'fixture-promotert.html'), 'utf8');
var tekstPromotert = extractMainContent(htmlPromotert);

console.log('--- uttrukket tekst ---');
console.log(tekstPromotert);
console.log('--- slutt ---');

assert(tekstPromotert.indexOf('pilotprosjekt for hydrogendrevne hurtigbåter') !== -1,
  'Hovedartikkelens forste avsnitt er med');
assert(tekstPromotert.indexOf('80 millioner kroner') !== -1,
  'Hovedartikkelens andre avsnitt er med');
assert(tekstPromotert.indexOf('Kjøp billig strøm') === -1,
  'Den PROMOTERTE overskriften er IKKE med');
assert(tekstPromotert.indexOf('Promotert') === -1,
  'Ordet "Promotert" forekommer ikke i uttrekket');
assert(tekstPromotert.toLowerCase().indexOf('les også') === -1,
  '"Les også"-aside (relatert sak) er IKKE med');
assert(tekstPromotert.indexOf('Sognefjorden') === -1,
  'Den relaterte sakens innhold er IKKE med');
assert(tekstPromotert.toLowerCase().indexOf('nyhetsbrev') === -1,
  'Nyhetsbrev-blokken (i <footer>, uansett utenfor <article>) er IKKE med');
assert(tekstPromotert.indexOf('<') === -1 && tekstPromotert.indexOf('>') === -1,
  'Ingen HTML-tagger igjen i resultatet');

console.log('');
console.log('=== extractMainContent: betalingsmur-fixture ===');
var htmlBetalingsmur = fs.readFileSync(path.join(__dirname, 'fixture-betalingsmur.html'), 'utf8');
assertEqual(extractMainContent(htmlBetalingsmur), '', 'Betalingsmur gir TOM streng (ingen omgaelsesforsok)');

console.log('');
console.log('=== extractMainContent: ingen gjenkjent struktur ===');
var htmlUtenStruktur = '<html><body><div class="content"><p>Ingen article/main/articleBody her.</p></div></body></html>';
assertEqual(extractMainContent(htmlUtenStruktur), '', 'Uten article/articleBody/main gir TOM streng');
assertEqual(extractMainContent(''), '', 'Tom streng input gir tom streng');
assertEqual(extractMainContent(null), '', 'null input gir tom streng (ikke exception)');

console.log('');
console.log('=== extractMainContent: itemprop=articleBody pa <div> (nestet, balansert) ===');
var htmlItemprop = '<html><body><div itemprop="articleBody"><p>Forste avsnitt.</p><div class="inline-bilde"><p>Bildetekst</p></div><p>Siste avsnitt.</p></div></body></html>';
var tekstItemprop = extractMainContent(htmlItemprop);
assert(tekstItemprop.indexOf('Forste avsnitt') !== -1 && tekstItemprop.indexOf('Siste avsnitt') !== -1,
  'Nestet <div itemprop="articleBody"> med indre <div> fanges balansert (begge avsnitt med)');

console.log('');
console.log('=== extractMainContent: lengdekapping ===');
var langTekst = '<article><p>' + 'Ord '.repeat(3000) + '</p></article>';
var kappet = extractMainContent(langTekst);
assert(kappet.length === TEKSTGRUNNLAG_MAKS_TEGN, 'Kappes nøyaktig til TEKSTGRUNNLAG_MAKS_TEGN (' + TEKSTGRUNNLAG_MAKS_TEGN + ' tegn)');

console.log('');
console.log('=== extractKeywordContext ===');
var langArtikkel = 'Dette er innledningen. Hydrogen er fremtiden for maritim transport. '.repeat(1) +
  'Mer tekst her uten søkeordet i det hele tatt, bare fyll. '.repeat(5) +
  'Et nytt hydrogenanlegg bygges nå i Bergen med stor kapasitet. '.repeat(1) +
  'Enda mer fylltekst som ikke er relevant for søket i det hele tatt her. '.repeat(5) +
  'Avslutningsvis nevnes hydrogen som en nøkkelteknologi for fremtiden.';

var utdrag = extractKeywordContext(langArtikkel, 'hydrogen', 3, 60);
assertEqual(utdrag.length <= 3, true, 'Returnerer maks "ant" utdrag');
assert(utdrag.length === 3, 'Fant nøyaktig 3 utdrag (3 forekomster av "hydrogen" i fixture-teksten)');
utdrag.forEach(function (u, i) {
  assert(u.toLowerCase().indexOf('hydrogen') !== -1, 'Utdrag ' + (i + 1) + ' inneholder faktisk søkeordet');
});
assertEqual(extractKeywordContext('', 'hydrogen'), [], 'Tom tekst gir tom liste');
assertEqual(extractKeywordContext('noe tekst', ''), [], 'Tomt søkeord gir tom liste');
assertEqual(extractKeywordContext('ingen treff her', 'hydrogen'), [], 'Ingen treff gir tom liste');

console.log('');
console.log('=== validateSummary ===');

// 1) Norsk sammendrag av engelsk tekst - egennavn skal gjenkjennes pa tvers av sprak
var engelskTekst = 'Kongsberg Maritime has launched a new autonomous navigation system for the maritime industry.';
var norskSammendrag = 'Kongsberg Maritime lanserer et nytt system for autonom navigasjon.';
var resultat1 = validateSummary(norskSammendrag, engelskTekst);
assert(resultat1.gyldig === true, 'Norsk sammendrag av engelsk tekst: "Kongsberg Maritime" gjenkjennes, gyldig');

// 2) Genitiv-s
var genitivTekst = 'Kongsberg Maritime unveiled the new propulsion system at the conference in Oslo.';
var genitivSammendrag = 'Kongsberg Maritimes nye fremdriftssystem ble vist frem i Oslo.';
var resultat2 = validateSummary(genitivSammendrag, genitivTekst);
assert(resultat2.gyldig === true, 'Genitiv-s ("Maritimes") matcher "Maritime" i kildeteksten etter normalisering');

// 3) Tallformat 1,5 vs 1.5
var tallTekstKomma = 'Prosjektet har en investeringsramme på 1,5 milliarder kroner over fem år.';
var tallSammendragPunktum = 'Investeringsrammen er på 1.5 milliarder kroner.';
var resultat3 = validateSummary(tallSammendragPunktum, tallTekstKomma);
assert(resultat3.gyldig === true, 'Tall "1.5" (sammendrag) matcher "1,5" (kildetekst) pa tvers av desimaltegn');

var tallTekstPunktum = 'The project has a budget of 1.5 billion kroner.';
var tallSammendragKomma = 'Prosjektet har et budsjett på 1,5 milliarder kroner.';
var resultat3b = validateSummary(tallSammendragKomma, tallTekstPunktum);
assert(resultat3b.gyldig === true, 'Motsatt vei: tall "1,5" (sammendrag) matcher "1.5" (kildetekst)');

// 4) To eller flere reelle avvik -> ugyldig
var ekteTekst = 'Et konsortium av norske verft lanserer et pilotprosjekt for hydrogendrevne hurtigbåter.';
var oppdiktetSammendrag = 'Severin Johansen i Kystredriet annonserer at Nordvik Maritim investerer 500 millioner kroner i et nytt prosjekt.';
var resultat4 = validateSummary(oppdiktetSammendrag, ekteTekst);
assert(resultat4.antallAvvik >= 2, 'Flere oppdiktede egennavn/tall gir antallAvvik >= 2 (faktisk: ' + resultat4.antallAvvik + ')');
assert(resultat4.gyldig === false, 'To eller flere reelle avvik -> gyldig=false');

// 5) Ett enkelt avvik skal IKKE alene gjore sammendraget ugyldig (unngar falske "Tvil")
var enkeltAvvikTekst = 'Kongsberg Maritime lanserer et nytt system for maritim sikkerhet.';
var enkeltAvvikSammendrag = 'Kongsberg Maritime og samarbeidspartneren Blåskjell lanserer et nytt sikkerhetssystem.';
var resultat5 = validateSummary(enkeltAvvikSammendrag, enkeltAvvikTekst);
assert(resultat5.antallAvvik === 1, 'Nøyaktig ett avvik ("Blåskjell") i dette eksempelet (faktisk: ' + resultat5.antallAvvik + ')');
assert(resultat5.gyldig === true, 'Ett enkeltstaende avvik alene gir IKKE gyldig=false (terskel VALIDATE_SUMMARY_MIN_AVVIK=' + VALIDATE_SUMMARY_MIN_AVVIK + ')');

// 6) Tomt sammendrag
assertEqual(validateSummary('', 'noe tekst'), { gyldig: true, antallAvvik: 0, avvikendeOrd: [] },
  'Tomt sammendrag regnes som gyldig (ingenting a validere)');

console.log('');
console.log('=== byggBrukerTekstMedUtvidetTekstgrunnlag ===');
var brukerTekst = byggBrukerTekstMedUtvidetTekstgrunnlag('Min overskrift', 'Min Kilde', 'Artikkelinnhold her.');
assert(brukerTekst.indexOf('Min overskrift') !== -1, 'Overskrift er med');
assert(brukerTekst.indexOf('Min Kilde') !== -1, 'Kilde er med');
assert(brukerTekst.indexOf(AI_PROMPT_ARTIKKELTEKST_START) !== -1 && brukerTekst.indexOf(AI_PROMPT_ARTIKKELTEKST_SLUTT) !== -1,
  'Skilletegn rundt artikkelteksten er med');
assert(brukerTekst.indexOf('IKKE instruksjoner') !== -1, 'Advarsel om data-ikke-instruksjoner er med');
assert(brukerTekst.indexOf('Artikkelinnhold her.') > brukerTekst.indexOf(AI_PROMPT_ARTIKKELTEKST_START) &&
  brukerTekst.indexOf('Artikkelinnhold her.') < brukerTekst.indexOf(AI_PROMPT_ARTIKKELTEKST_SLUTT),
  'Selve artikkelteksten star MELLOM skilletegnene');

console.log('');
console.log(feil === 0 ? 'ALLE TESTER OK' : feil + ' TEST(ER) FEILET');
process.exit(feil === 0 ? 0 : 1);
