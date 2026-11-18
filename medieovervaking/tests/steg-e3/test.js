var fs = require('fs');

// --- Mocker av Apps Script-globalene som 10_AIIntegrasjon.gs trenger. Satt
// FOR eval, og omskrevet per test-blokk der det trengs (f.eks. forskjellig
// UrlFetchApp-oppforsel for ulike tester). Indirekte eval, se tests/steg-e2
// for samme monster og hvorfor det er nodvendig (deklarasjoner ma overleve
// i globalt scope for senere testkode i denne fila).
var indirekteEval = eval;
var urlFetchAllKall = []; // logger alle fetchAll()-kall denne prosessen gjor, for assertions
global.UrlFetchApp = {
  fetchAll: function (foresporsler) {
    urlFetchAllKall.push(foresporsler);
    throw new Error('UrlFetchApp.fetchAll() skal IKKE kalles i dette scenarioet - testen satte ingen respons');
  }
};
global.PropertiesService = {
  getScriptProperties: function () {
    return {
      getProperty: function (navn) {
        return { AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-nokkel', AI_MODEL: 'claude-haiku-5-5' }[navn];
      }
    };
  }
};
global.Logger = { log: function () {} };

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
evalGs('10_AIIntegrasjon.gs');

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

console.log('=== Standardverdier (kritisk - ma vaere av/inert) ===');
assertEqual(TEKSTGRUNNLAG_MODUS, 'ingress', 'TEKSTGRUNNLAG_MODUS er "ingress" som standard');
assertEqual(SKYGGE_TEKSTGRUNNLAG, false, 'SKYGGE_TEKSTGRUNNLAG er false som standard');
assertEqual(KILDER_MED_HELSIDE, [], 'KILDER_MED_HELSIDE er tom som standard');

console.log('');
console.log('=== byggAiForesporsel (4. parameter) ===');
var treffForesp = { tittel: 'En tittel', ingress: 'En ingress', kilde: 'En kilde', lenke: 'https://example.com/a' };
var forespUendret = byggAiForesporsel(treffForesp, 'nokkel', 'claude-haiku-5-5');
var payloadUendret = JSON.parse(forespUendret.payload);
assertEqual(payloadUendret.messages[0].content, 'Overskrift: En tittel\nIngress: En ingress\nKilde: En kilde',
  'Uten 4. parameter: eksakt samme brukertekst som for Steg E3');

var forespUtvidet = byggAiForesporsel(treffForesp, 'nokkel', 'claude-haiku-5-5', 'Dette er hele artikkelteksten.');
var payloadUtvidet = JSON.parse(forespUtvidet.payload);
assert(payloadUtvidet.messages[0].content.indexOf('Dette er hele artikkelteksten.') !== -1,
  'Med 4. parameter: den utvidede teksten er med i brukerteksten');
assert(payloadUtvidet.messages[0].content.indexOf('En ingress') === -1,
  'Med 4. parameter: ra ingress er IKKE med (byggBrukerTekstMedUtvidetTekstgrunnlag brukt i stedet)');

console.log('');
console.log('=== anvendValideringAvUtvidetSammendrag ===');
var treffGyldig = { aiSammendrag: 'Kongsberg Maritime lanserer et nytt system.' };
anvendValideringAvUtvidetSammendrag(treffGyldig, 'Kongsberg Maritime has launched a new system for the maritime industry.');
assertEqual(treffGyldig.aiSammendrag, 'Kongsberg Maritime lanserer et nytt system.',
  'Gyldig sammendrag (verifiserbart mot teksten) endres IKKE');
assertEqual(treffGyldig.aiValideringsFeilet, undefined, 'Gyldig sammendrag: aiValideringsFeilet settes IKKE');

var treffUgyldig = { ingress: 'Den opprinnelige ingressen.', aiSammendrag: 'Severin Johansen i Kystredriet annonserer 500 millioner kroner.' };
anvendValideringAvUtvidetSammendrag(treffUgyldig, 'Et konsortium av norske verft lanserer et pilotprosjekt for hydrogendrevne hurtigbåter.');
assertEqual(treffUgyldig.aiSammendrag, '', 'Ugyldig sammendrag (flere oppdiktede navn/tall): aiSammendrag tommes (-> fallback til ingress i e-posten)');
assertEqual(treffUgyldig.aiValideringsFeilet, true, 'Ugyldig sammendrag: aiValideringsFeilet settes til true');

console.log('');
console.log('=== bestemKiVurdering (aiValideringsFeilet) ===');
assertEqual(bestemKiVurdering({ aiValideringsFeilet: true }), 'Tvil', 'aiValideringsFeilet gir "Tvil", som aiParseFeilet');
assertEqual(bestemKiVurdering({ aiParseFeilet: true }), 'Tvil', 'aiParseFeilet gir fortsatt "Tvil" (uendret oppforsel)');
assertEqual(bestemKiVurdering({ aiRelevant: true }), 'Relevant', 'Vanlig relevant-treff er uendret');

console.log('');
console.log('=== byggArtikkelloggRad (Skygge-*-kolonner) ===');
var tidspunktTest = new Date('2026-01-01T10:00:00Z');
var radUtenSkygge = byggArtikkelloggRad({ lenke: 'https://example.com/b', tittel: 'Tittel', aiRelevant: true }, tidspunktTest, 'claude-haiku-5-5');
assertEqual(radUtenSkygge.length, 18, 'Raden har na 18 kolonner');
assertEqual(radUtenSkygge.slice(13), ['', '', '', '', ''], 'Uten skygge-felt pa treffet: alle 5 Skygge-*-kolonner er tomme');

var treffMedSkygge = {
  lenke: 'https://example.com/c', tittel: 'Tittel', aiRelevant: true,
  aiSkyggeVurdering: 'Relevant', aiSkyggeTekstgrunnlag: 'hel side', aiSkyggeValidering: 'Gyldig',
  aiSkyggeTokensInn: 1200, aiSkyggeTokensUt: 80
};
var radMedSkygge = byggArtikkelloggRad(treffMedSkygge, tidspunktTest, 'claude-haiku-5-5');
assertEqual(radMedSkygge.slice(13), ['Relevant', 'hel side', 'Gyldig', 1200, 80], 'Med skygge-felt pa treffet: alle 5 kolonner fylles korrekt');

console.log('');
console.log('=== hentUtvidetTekstgrunnlagForTreff ===');

KILDER_MED_HELSIDE.length = 0; // sikre tom liste for forste scenario, uansett testrekkefolge
var treffListeIngenHelside = [{ lenke: 'https://ikke-i-listen.no/sak', tittel: 'A', ingress: 'Ingress A' }];
urlFetchAllKall = [];
var kartTomListe = hentUtvidetTekstgrunnlagForTreff(treffListeIngenHelside, 'hel side');
assertEqual(kartTomListe, {}, 'Tom KILDER_MED_HELSIDE: tomt kart');
assertEqual(urlFetchAllKall.length, 0, 'Tom KILDER_MED_HELSIDE: UrlFetchApp.fetchAll() kalles IKKE (ingen unodvendig nettverkstrafikk)');

KILDER_MED_HELSIDE.push('tu.no');
var htmlMedArtikkel = '<html><body><article><p>Forste avsnitt med hydrogen i teksten.</p><p>Andre avsnitt.</p></article></body></html>';
var htmlBetalingsmur = '<html><body><div class="paywall">Logg inn for a lese hele artikkelen</div></body></html>';

global.UrlFetchApp.fetchAll = function (foresporsler) {
  urlFetchAllKall.push(foresporsler);
  return foresporsler.map(function (f) {
    var kode = f.url.indexOf('betalingsmur') !== -1 ? 200 : 200;
    var tekst = f.url.indexOf('betalingsmur') !== -1 ? htmlBetalingsmur : htmlMedArtikkel;
    return { getResponseCode: function () { return kode; }, getContentText: function () { return tekst; } };
  });
};

var treffListeHelside = [
  { lenke: 'https://tu.no/sak-1', tittel: 'Sak 1', ingress: 'Ingress 1', matchendeOrd: ['hydrogen'] },
  { lenke: 'https://tu.no/betalingsmur-sak', tittel: 'Sak 2', ingress: 'Ingress 2', matchendeOrd: ['hydrogen'] },
  { lenke: 'https://ikke-i-listen.no/sak-3', tittel: 'Sak 3', ingress: 'Ingress 3' }
];

var kartHelSide = hentUtvidetTekstgrunnlagForTreff(treffListeHelside, 'hel side');
assert(kartHelSide['https://tu.no/sak-1'] !== undefined, 'tu.no-artikkel med gjenkjent struktur far en oppforing');
assert(kartHelSide['https://tu.no/sak-1'].indexOf('Forste avsnitt') !== -1, '"hel side": inneholder faktisk hovedinnhold (extractMainContent)');
assertEqual(kartHelSide['https://tu.no/betalingsmur-sak'], undefined, 'Betalingsmur (extractMainContent gir tomt): INGEN oppforing -> ingress brukes');
assertEqual(kartHelSide['https://ikke-i-listen.no/sak-3'], undefined, 'Kilde utenfor KILDER_MED_HELSIDE: INGEN oppforing (ingen sidehenting forsokt for den)');

var kartKontekst = hentUtvidetTekstgrunnlagForTreff([treffListeHelside[0]], 'kontekst');
assert(kartKontekst['https://tu.no/sak-1'].indexOf('Ingress 1') === 0, '"kontekst": starter med ra ingress');
assert(kartKontekst['https://tu.no/sak-1'].indexOf('hydrogen') !== -1, '"kontekst": inneholder sokeordkontekst-utdrag');

console.log('');
console.log('=== kjorSkyggemodusEkstrakall (skal IKKE gjore noe nar av/inert) ===');

var statistikkTest = { antallKall: 0, tokensInn: 0, tokensUt: 0, kostnad: 0, feil: [], stoppetTidlig: false, stoppArsak: '' };
var treffForSkygge = [{ lenke: 'https://tu.no/sak-1', tittel: 'Sak 1', ingress: 'Ingress 1' }];

global.UrlFetchApp.fetchAll = function () {
  throw new Error('fetchAll() skal IKKE kalles her - SKYGGE_TEKSTGRUNNLAG er av');
};
SKYGGE_TEKSTGRUNNLAG = false;
kjorSkyggemodusEkstrakall(treffForSkygge, 'nokkel', 'claude-haiku-5-5', new Date().getTime(), statistikkTest);
assertEqual(statistikkTest.antallKall, 0, 'SKYGGE_TEKSTGRUNNLAG=false: ingen ekstra kall gjores');

SKYGGE_TEKSTGRUNNLAG = true;
TEKSTGRUNNLAG_MODUS = 'ingress';
global.UrlFetchApp.fetchAll = function () {
  throw new Error('fetchAll() skal IKKE kalles her - TEKSTGRUNNLAG_MODUS er "ingress" (ingenting a sammenligne med)');
};
kjorSkyggemodusEkstrakall(treffForSkygge, 'nokkel', 'claude-haiku-5-5', new Date().getTime(), statistikkTest);
assertEqual(statistikkTest.antallKall, 0, 'SKYGGE_TEKSTGRUNNLAG=true men TEKSTGRUNNLAG_MODUS="ingress": fortsatt ingen ekstra kall');

TEKSTGRUNNLAG_MODUS = 'hel side';
var aiStartTidForLengeSiden = new Date().getTime() - (10 * 60 * 1000); // 10 min siden, over AI_TIDSBUDSJETT_MS
global.UrlFetchApp.fetchAll = function () {
  throw new Error('fetchAll() skal IKKE kalles her - tidsbudsjettet er allerede brukt opp');
};
kjorSkyggemodusEkstrakall(treffForSkygge, 'nokkel', 'claude-haiku-5-5', aiStartTidForLengeSiden, statistikkTest);
assertEqual(statistikkTest.antallKall, 0, 'Tidsbudsjett allerede brukt opp: ingen ekstra kall');

// Tilbakestill til standardverdiene igjen, slik at resten av testfila (og
// enhver senere eval av denne fila) ikke pavirkes av mutasjonene over.
TEKSTGRUNNLAG_MODUS = 'ingress';
SKYGGE_TEKSTGRUNNLAG = false;
KILDER_MED_HELSIDE.length = 0;

console.log('');
console.log('=== kjorSkyggemodusEkstrakall (faktisk kjort - full sti) ===');

KILDER_MED_HELSIDE.push('tu.no');
SKYGGE_TEKSTGRUNNLAG = true;
TEKSTGRUNNLAG_MODUS = 'hel side';

global.UrlFetchApp.fetchAll = function (foresporsler) {
  // Sidehenting (GET til selve artikkel-URL-en) vs. AI-kall (POST til Anthropic) - skill pa metode.
  return foresporsler.map(function (f) {
    if (f.method === 'get') {
      return { getResponseCode: function () { return 200; }, getContentText: function () { return htmlMedArtikkel; } };
    }
    var svar = {
      content: [{ type: 'text', text: JSON.stringify({
        relevant: true, kategori: 'Energi og framdrift', sammendrag: 'Et avsnitt om hydrogen.',
        nevner_oss: false, notat: '', irrelevant_grunn: ''
      }) }],
      usage: { input_tokens: 500, output_tokens: 60 }
    };
    return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(svar); } };
  });
};

var treffForSkyggeFull = [{ lenke: 'https://tu.no/sak-1', tittel: 'Sak 1', ingress: 'Ingress 1', matchendeOrd: ['hydrogen'] }];
var statistikkFull = { antallKall: 0, tokensInn: 0, tokensUt: 0, kostnad: 0, feil: [], stoppetTidlig: false, stoppArsak: '' };
kjorSkyggemodusEkstrakall(treffForSkyggeFull, 'nokkel', 'claude-haiku-5-5', new Date().getTime(), statistikkFull);

assertEqual(statistikkFull.antallKall, 1, 'Ett skygge-AI-kall ble gjort');
assertEqual(statistikkFull.tokensInn, 500, 'tokensInn telles med i den delte statistikken (reell kostnad)');
assertEqual(treffForSkyggeFull[0].aiSkyggeVurdering, 'Relevant', 'aiSkyggeVurdering satt riktig');
assertEqual(treffForSkyggeFull[0].aiSkyggeTekstgrunnlag, 'hel side', 'aiSkyggeTekstgrunnlag = TEKSTGRUNNLAG_MODUS-verdien (IKKE selve teksten)');
assertEqual(treffForSkyggeFull[0].aiSkyggeValidering, 'Gyldig', 'aiSkyggeValidering satt (sammendraget er verifiserbart mot hel-side-teksten)');
assertEqual(treffForSkyggeFull[0].aiRelevant, undefined, 'Skyggekallet rorer ALDRI treff.aiRelevant (produksjonsfeltet)');
assertEqual(treffForSkyggeFull[0].aiSammendrag, undefined, 'Skyggekallet rorer ALDRI treff.aiSammendrag (produksjonsfeltet)');

TEKSTGRUNNLAG_MODUS = 'ingress';
SKYGGE_TEKSTGRUNNLAG = false;
KILDER_MED_HELSIDE.length = 0;

console.log('');
console.log('=== vurderTreffMedAI (integrasjon - standardverdier skal gi UENDRET oppforsel) ===');

global.UrlFetchApp.fetchAll = function (foresporsler) {
  return foresporsler.map(function () {
    var svar = {
      content: [{ type: 'text', text: JSON.stringify({
        relevant: true, kategori: 'Energi og framdrift', sammendrag: 'Et kort KI-sammendrag.',
        nevner_oss: false, notat: 'Et notat', irrelevant_grunn: ''
      }) }],
      usage: { input_tokens: 300, output_tokens: 50 }
    };
    return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(svar); } };
  });
};

var treffForProduksjon = [{ lenke: 'https://dn.no/sak-x', tittel: 'En sak', ingress: 'En ingress', kilde: 'DN', matchendeOrd: ['hydrogen'] }];
var statistikkProduksjon = vurderTreffMedAI(treffForProduksjon);

assertEqual(statistikkProduksjon.antallKall, 1, 'Ett AI-kall gjort (standardoppforsel, TEKSTGRUNNLAG_MODUS="ingress")');
assertEqual(treffForProduksjon[0].tekstgrunnlag, 'ingress', 'treff.tekstgrunnlag satt til "ingress" (standard - matcher Steg A)');
assertEqual(treffForProduksjon[0].aiRelevant, true, 'treff.aiRelevant satt fra AI-svaret som vanlig');
assertEqual(treffForProduksjon[0].aiSammendrag, 'Et kort KI-sammendrag.', 'treff.aiSammendrag satt fra AI-svaret som vanlig (ingen validering nar tekstgrunnlag="ingress")');
assertEqual(treffForProduksjon[0].aiValideringsFeilet, undefined, 'aiValideringsFeilet IKKE satt nar tekstgrunnlag="ingress" (ingen utvidet-tekst-validering kjort)');

console.log('');
console.log('=== testTekstgrunnlagIProduksjon (kun parametersjekk - kaller IKKE vurderTreffMedAI uten lenke/tittel) ===');

global.UrlFetchApp.fetchAll = function () {
  throw new Error('fetchAll() skal IKKE kalles - "lenke"/"tittel" mangler, funksjonen skal returnere tidlig');
};
var loggetUnderfeiltest = [];
global.Logger = { log: function (tekst) { loggetUnderfeiltest.push(tekst); } };
testTekstgrunnlagIProduksjon('', 'En tittel');
assert(loggetUnderfeiltest.some(function (l) { return l.indexOf('FEIL') === 0; }), 'Mangler "lenke": logger en FEIL-linje og returnerer (ingen AI-kall)');

loggetUnderfeiltest = [];
testTekstgrunnlagIProduksjon('https://example.com/sak', '');
assert(loggetUnderfeiltest.some(function (l) { return l.indexOf('FEIL') === 0; }), 'Mangler "tittel": logger en FEIL-linje og returnerer (ingen AI-kall)');
global.Logger = { log: function () {} };

console.log('');
console.log('MERK: testTekstgrunnlagIProduksjon() sin faktiske AI-/sidehentings-sti (nar lenke+tittel ER gitt) ' +
  'gjor EKTE nettverks- og AI-kall og testes derfor IKKE her - kun i Apps Script-editoren, se leveringsteksten.');

console.log('');
console.log(feil === 0 ? 'ALLE TESTER OK' : feil + ' TEST(ER) FEILET');
process.exit(feil === 0 ? 0 : 1);
