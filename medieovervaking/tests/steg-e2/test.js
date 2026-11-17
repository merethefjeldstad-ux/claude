var fs = require('fs');

// Eval i alfabetisk fil-rekkefolge, samme globale scope som Apps Script gir.
// testArtikkellogg() krever SpreadsheetApp - fjernes for Node-eval her.
var indirekteEval = eval; // indirekte eval kjorer i GLOBALT scope, ikke i evalGs() sitt lokale scope
function evalGs(filnavn, fjernFunksjon) {
  var kode = fs.readFileSync('/home/user/claude/medieovervaking/' + filnavn, 'utf8');
  if (fjernFunksjon) {
    kode = kode.replace(new RegExp('function ' + fjernFunksjon + '\\b[\\s\\S]*$'), '');
  }
  indirekteEval(kode);
}

evalGs('03_RSSHenting.gs');
evalGs('09_AITest.gs');
evalGs('12_Artikkellogg.gs', 'testArtikkellogg');
evalGs('14_Tekstgrunnlag.gs');
evalGs('15_TekstgrunnlagTest.gs');

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

console.log('=== hentDomeneFraUrl / erDomeneIListe ===');

assertEqual(hentDomeneFraUrl('https://www.tu.no/artikler/en-sak/123456'), 'tu.no', 'www. fjernes fra domenet');
assertEqual(hentDomeneFraUrl('https://dn.no/sak'), 'dn.no', 'Domene uten www fungerer');
assertEqual(hentDomeneFraUrl('ikke en url'), '', 'Ugyldig URL gir tom streng');
assertEqual(hentDomeneFraUrl(''), '', 'Tom streng gir tom streng');

assert(erDomeneIListe('https://www.tu.no/sak', ['tu.no']) === true, 'www.tu.no matcher "tu.no" i listen');
assert(erDomeneIListe('https://tu.no/sak', ['tu.no']) === true, 'tu.no (uten www) matcher "tu.no"');
assert(erDomeneIListe('https://nyheter.tu.no/sak', ['tu.no']) === true, 'Underdomene (nyheter.tu.no) matcher "tu.no"');
assert(erDomeneIListe('https://dn.no/sak', ['tu.no']) === false, 'Ikke-listet domene gir false');
assert(erDomeneIListe('https://tu.no.evil.com/sak', ['tu.no']) === false,
  '"tu.no.evil.com" skal IKKE feilaktig matche "tu.no" (ikke et ekte underdomene)');
assert(erDomeneIListe('https://tu.no/sak', []) === false, 'Tom domeneliste gir alltid false (KILDER_MED_HELSIDE-standard)');

console.log('');
console.log('=== estimerEttKallKostnad / estimerTekstgrunnlagTestKostnad ===');

var prisEksempel = { inn: 2, ut: 10 };
var kostnadEtt = estimerEttKallKostnad(4000, 220, prisEksempel); // 1000 tokens inn
assert(Math.abs(kostnadEtt - ((1000 / 1000000) * 2 + (220 / 1000000) * 10)) < 1e-9,
  'estimerEttKallKostnad regner riktig for kjente tall');

var raderUtenHelside = [
  ['A1', 'TU', 'https://ikke-i-listen.no/sak', 'En overskrift', 'En kort ingress.']
];
var raderMedHelside = [
  ['A1', 'TU', 'https://tu.no/sak', 'En overskrift', 'En kort ingress.']
];

var kostnadUtenHelside = estimerTekstgrunnlagTestKostnad(raderUtenHelside, ['tu.no'], 'claude-haiku-5-5');
var kostnadMedHelside = estimerTekstgrunnlagTestKostnad(raderMedHelside, ['tu.no'], 'claude-haiku-5-5');

assert(kostnadUtenHelside > 0, 'Kostnad for kilde UTENFOR KILDER_MED_HELSIDE er > 0 (variant A alene)');
assert(kostnadMedHelside > kostnadUtenHelside,
  'Kostnad for kilde I KILDER_MED_HELSIDE er høyere (A+B+C) enn kun variant A');
assertEqual(estimerTekstgrunnlagTestKostnad([], ['tu.no'], 'claude-haiku-5-5'), 0, 'Tom radliste gir 0');
assertEqual(estimerTekstgrunnlagTestKostnad(raderMedHelside, ['tu.no'], 'ukjent-modell'), 0, 'Ukjent modell gir 0');

console.log('');
console.log('=== byggTekstgrunnlagTestForesporsel ===');

var foresp = byggTekstgrunnlagTestForesporsel('Min brukertekst', 'min-api-nokkel', 'claude-haiku-5-5');
assertEqual(foresp.url, 'https://api.anthropic.com/v1/messages', 'Riktig API-URL');
assertEqual(foresp.method, 'post', 'POST-metode');
assertEqual(foresp.headers['x-api-key'], 'min-api-nokkel', 'API-nokkel i header');
var payload = JSON.parse(foresp.payload);
assertEqual(payload.model, 'claude-haiku-5-5', 'Riktig modell i payload');
assertEqual(payload.max_tokens, 500, 'max_tokens er 500 (samme som produksjonen etter bumpen)');
assertEqual(payload.system, AI_SYSTEM_PROMPT, 'Samme AI_SYSTEM_PROMPT som produksjonen - uendret');
assertEqual(payload.messages[0].content, 'Min brukertekst', 'Brukerteksten sendes uendret som "content"');

console.log('');
console.log('=== byggTekstgrunnlagTestRad ===');

var tolketEksempel = {
  relevant: true, parseFeilet: false, kategori: 'Energi og framdrift', nevnerOss: true,
  notat: 'Et notat', sammendrag: 'Et sammendrag med Kongsberg i teksten.', irrelevantGrunn: ''
};
var tekstgrunnlagEksempel = 'Kongsberg lanserer et nytt system for maritim sikkerhet.';
var radResultat = byggTekstgrunnlagTestRad('kjoring-1', 'A1', 'B', tolketEksempel, tekstgrunnlagEksempel, 100, 50, 0.0012);

assertEqual(radResultat[0], 'kjoring-1', 'Kjøring-ID riktig');
assertEqual(radResultat[1], 'A1', 'Artikkel-ID riktig');
assertEqual(radResultat[2], 'B', 'Variant riktig');
assertEqual(radResultat[3], 'Relevant', 'Vurdering riktig (bestemKiVurdering gjenbrukt)');
assertEqual(radResultat[4], 'Energi og framdrift', 'Kategori riktig');
assertEqual(radResultat[5], 'Ja', 'Nevner oss riktig');
assertEqual(radResultat[6], 'Et notat', 'Notat riktig');
assertEqual(radResultat[7], 'Gyldig', 'Valideringsresultat: "Kongsberg" finnes i teksten -> Gyldig');
assertEqual(radResultat[8], tekstgrunnlagEksempel.length, 'Tekstlengde = lengden pa tekstgrunnlagBrukt');
assertEqual(radResultat[9], 100, 'Tokens inn riktig');
assertEqual(radResultat[10], 50, 'Tokens ut riktig');
assertEqual(radResultat[11], 0.0012, 'Kostnad riktig');
assertEqual(radResultat[12], '', '"Riktig?"-kolonnen er tom (fylles ut manuelt)');

// Ugyldig sammendrag (flere avvik) gir "Ugyldig"-tekst med avvikene listet
var tolketUgyldig = {
  relevant: true, parseFeilet: false, kategori: '', nevnerOss: false, notat: '',
  sammendrag: 'Severin Johansen i Nordvik annonserer 500 millioner kroner.', irrelevantGrunn: ''
};
var radUgyldig = byggTekstgrunnlagTestRad('kjoring-1', 'A2', 'A', tolketUgyldig, 'En helt annen tekst uten disse ordene.', 80, 40, 0.001);
assert(radUgyldig[7].indexOf('Ugyldig') === 0, 'Flere avvik gir "Ugyldig..."-tekst i valideringsresultat');

console.log('');
console.log('=== hentAlleredeBehandledeVarianter ===');
console.log('IKKE testet her - krever SpreadsheetApp (ss.getSheetByName/getRange).');

console.log('');
console.log(feil === 0 ? 'ALLE TESTER OK' : feil + ' TEST(ER) FEILET');
process.exit(feil === 0 ? 0 : 1);
