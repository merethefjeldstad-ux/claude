// Node-test av OpointKjoring.gs (uten Apps Script). Kjør: node tests/opoint/test_opoint_kjoring.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const logg = [];
const ctx = { Logger: { log: s => logg.push(String(s)) } }; vm.createContext(ctx);
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', 'OpointKjoring.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(__dirname + '/../../' + f, 'utf8'), ctx));
const f = ctx;
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const d = { fmtSek: s => 'T' + s, dagTekst: x => x.toISOString().slice(0, 10),
  tilSek: t => Math.floor(Date.parse(t.replace(' ', 'T') + ':00Z') / 1000) };

// --- Navn: prefiks og ingen kollisjon med noen annen .gs-fil ---
const navn = src => (src.match(/^(?:function|var)\s+([A-Za-z0-9_]+)/gm) || []).map(x => x.split(/\s+/)[1]);
const ny = navn(fs.readFileSync(__dirname + '/../../OpointKjoring.gs', 'utf8'));
assert.ok(ny.every(x => /^opoint_|^OPOINT_/.test(x)), 'prefiks');
fs.readdirSync(__dirname + '/../..').filter(x => x.endsWith('.gs') && x !== 'OpointKjoring.gs').forEach(fil => {
  const andre = navn(fs.readFileSync(__dirname + '/../../' + fil, 'utf8'));
  assert.deepStrictEqual(ny.filter(x => andre.includes(x)), [], 'kollisjon med ' + fil);
});
const kode = fs.readFileSync(__dirname + '/../../OpointKjoring.gs', 'utf8');
assert.ok(!/newTrigger\(|MailApp\.|textrazor|readership|text:\s*1|api\.anthropic\.com/.test(kode));
assert.ok(!/getSheetByName\((?:FANE_|'Sendte|'Artikkellogg|'Referansesett|'Kjøretidslogg|'Mottakere)/.test(kode));
// Ingen skriving til beskyttede faner: skrivFane kalles kun med egne fanekonstanter
(kode.match(/opoint_t3_skrivFane\(ss, ([A-Z_]+)/g) || []).forEach(m =>
  assert.ok(/OPOINT_(DIAG_FANE|DIAG_FANE_DEKNING|KJOR_FANE|KJOR_FANE_SPORRINGER)$/.test(m.split(', ')[1]), m));
assert.strictEqual((kode.match(/GmailApp\.sendEmail/g) || []).length, 1);
assert.ok(/Session\.getEffectiveUser\(\)\.getEmail\(\)/.test(kode));
assert.strictEqual(f.OPOINT_KJOR_SEND_EPOST, false);

// --- Body ---
assert.deepStrictEqual(J(f.opoint_kj_byggBody('x', 1, 2, '', 50, false)),
  { searchterm: 'x', params: { requestedarticles: 50, context: '', oldest: 1, newest: 2, groupidentical: 0, main: { header: 1, summary: 1 } } });
assert.deepStrictEqual(J(f.opoint_kj_byggBody('x', 1, 2, 'c', 25, true)).params.identical, { inherit: true });

// --- URL og tittel ---
assert.strictEqual(f.opoint_kj_normUrl('https://www.google.com/url?rct=j&sa=t&url=https://www.tu.no/a/b/%3Fx%3D1&ct=ga&cd=1'), 'tu.no/a/b');
assert.strictEqual(f.opoint_kj_normUrl('https://www.ex.com/a&ct=ga&cd=CAE'), 'ex.com/a');
assert.strictEqual(f.opoint_kj_fjernKildesuffiks('Ammonia ship sets sail - Splash247'), 'Ammonia ship sets sail');
assert.strictEqual(f.opoint_kj_fjernKildesuffiks('Big news | The Maritime Executive'), 'Big news');
assert.strictEqual(f.opoint_kj_fjernKildesuffiks('A - this suffix has too many words in it'), 'A - this suffix has too many words in it');
assert.strictEqual(f.opoint_kj_fjernKildesuffiks('Ferge | ny | rute'), 'Ferge ny');
assert.strictEqual(f.opoint_kj_erEkskludert('headtopics.com', ['headtopics.com']), true);
assert.strictEqual(f.opoint_kj_erEkskludert('no.headtopics.com', ['headtopics.com']), true);
assert.strictEqual(f.opoint_kj_erEkskludert('notheadtopics.com', ['headtopics.com']), false);

// --- Kolonner ---
let k = f.opoint_kj_finnKolonner(['URL', 'Dato lagt til', 'Overskrift', 'AI Relevant', 'AI Notat'], f.OPOINT_DIAG_KOLONNENAVN_SENDTE, ['tittel', 'url']);
assert.deepStrictEqual([k.tittel, k.url, k.dato, k.stopp], [2, 0, 1, '']);
assert.ok(f.opoint_kj_finnKolonner(['URL', 'Lenke', 'Overskrift'], f.OPOINT_DIAG_KOLONNENAVN_SENDTE, ['tittel', 'url']).stopp.includes('Flere'));
assert.ok(f.opoint_kj_finnKolonner(['A', 'B'], f.OPOINT_DIAG_KOLONNENAVN_SENDTE, ['tittel', 'url']).stopp.includes('Fant ikke'));

// --- Strøm A ---
const A = f.opoint_kj_byggStromA(f.OPOINT_T2_SPORRINGER);
assert.strictEqual(A[0].searchterm, '"Maritime CleanTech"');
const lown = A.find(x => x.navn === 'A LOWNOISER');
assert.strictEqual(lown.searchterm, '(LOWNOISER OR lownoiser)');
assert.strictEqual(A.find(x => x.navn === 'A HyShip').searchterm, '(HyShip OR hyship OR HYSHIP)');
assert.strictEqual(A.find(x => x.navn === 'A Ocean Charger').searchterm, '("Ocean Charger" OR "ocean charger" OR "OCEAN CHARGER")');
assert.strictEqual(A.find(x => x.navn === 'A GASS').searchterm, 'GASS');
assert.strictEqual(A.length, 1 + 12 + 1);
assert.ok(A.every(x => !x.searchterm.includes('header:')));
const alle = f.opoint_kj_byggAlleSporringer(f.OPOINT_T2_SPORRINGER);
assert.strictEqual(alle.length, 14 + 10 + 1 + 1);
assert.strictEqual(alle[alle.length - 1].searchterm, 'site:288,19526,18139,338722,141703');

// --- Mock-klient ---
function klient(svarFn, maks) {
  const kall = [];
  const kl = f.opoint_t3_lagKlient('HEMMELIG', maks, b => { kall.push(J(b)); return svarFn(b, kall.length); }, () => {});
  return { kl, kall };
}
const ok = (docs, c) => ({ status: 200, tekst: JSON.stringify({ searchresult: { documents: docs.length, range_count: 9, context: c || '', document: docs } }) });
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1763450000, header: { text: 'x' }, summary: { text: 's' } }, o);

// --- Strøm D-verifisering ---
let res = { dokumenter: [doc({ id_site: 288 }), doc({ id_site: 19526 })], feil: '', merknad: '' };
f.opoint_kj_verifiserSites(res); assert.ok(res.merknad.includes('bekreftet'));
res = { dokumenter: [doc({ id_site: 288 }), doc({ id_site: 5 })], feil: '', merknad: '' };
f.opoint_kj_verifiserSites(res); assert.ok(res.feil.includes('ikke bekreftet')); assert.strictEqual(res.dokumenter.length, 0);
res = { dokumenter: [], feil: '', merknad: '' };
f.opoint_kj_verifiserSites(res); assert.ok(res.feil.includes('Ikke verifiserbart'));

// --- Henting: feil fortsetter, paging, kalltak ---
let m = klient((b, n) => b.searchterm === 'bad' ? { status: 400, tekst: '{"detail":"x"}' } :
  (b.params.context === '' ? ok([doc({ id_article: 1 })], 'c') : ok([doc({ id_article: 2 })], '')), 80);
const r = f.opoint_kj_hentAlle(m.kl, [{ strom: 'A', navn: 'bad', searchterm: 'bad' }, { strom: 'B', navn: 'ok', searchterm: 'ok' }],
  { oldest: 1, newest: 2 }, () => false);
assert.ok(r[0].feil.includes('400')); assert.strictEqual(r[1].dokumenter.length, 2); assert.strictEqual(r[1].contextTom, true);
assert.strictEqual(m.kall[1].params.groupidentical, 1); assert.strictEqual(m.kall[1].params.requestedarticles, 25);
m = klient(() => ok([doc({})], 'mer'), 80);
assert.strictEqual(f.opoint_kj_hentSporring(m.kl, { navn: 'q', searchterm: 'q' }, { oldest: 1, newest: 2 }, 25, 4, true).batcher, 4);
m = klient(() => ok([doc({})], 'mer'), 3);
const rr = f.opoint_kj_hentAlle(m.kl, [{ navn: 'a', searchterm: 'a' }, { navn: 'b', searchterm: 'b' }], { oldest: 1, newest: 2 }, () => false);
assert.strictEqual(m.kall.length, 3); assert.ok(rr[1].feil.includes('kalltaket'));

// --- Dedup, ekskludering, saker ---
const resultater = [
  { strom: 'A', navn: 'qa', dokumenter: [doc({ id_article: 1, equalgroup: 7, orig_url: 'https://www.ex.com/a?x=1', header: { text: 'Ammonia ferry launched in Norway' } })] },
  { strom: 'B', navn: 'qb', dokumenter: [doc({ id_article: 2, equalgroup: 7, orig_url: 'https://other.com/b', header: { text: 'Ammonia ferry launched in Norway' } }),
    doc({ id_article: 3, orig_url: 'http://ex.com/a/', header: { text: 'Samme URL' } }),
    doc({ id_article: 4, orig_url: 'https://headtopics.com/x', url_common: 'headtopics.com', header: { text: 'Ammonia ferry launched in Norway today' } }),
    doc({ id_article: 5, orig_url: 'https://z.no/c', header: { text: 'Helt annen sak om batteri' } })] }
];
const kand = f.opoint_kj_dedup(resultater, ['headtopics.com']);
assert.strictEqual(kand.raaDokumenter, 5); assert.strictEqual(kand.length, 3);
assert.deepStrictEqual(J(kand[0].strommer), ['A', 'B']); assert.strictEqual(kand[0].antallTreff, 3);
assert.strictEqual(kand[1].ekskludert, true);
f.opoint_kj_saksgrupper(kand, 0.6);
assert.strictEqual(kand[0].sak, kand[1].sak); assert.strictEqual(kand[0].antallKilderISak, 2); assert.notStrictEqual(kand[2].sak, kand[0].sak);
assert.deepStrictEqual(J(f.opoint_kj_kiKo(kand).map(x => x.doc.id_article)), [1, 5]);

// --- Apps Script-status ---
const apps = { rader: [
  { kilde: 'Sendte artikler', norm: 'ex.com/a', tittel: 'x', relevant: 'ja', arsak: '' },
  { kilde: 'Artikkellogg', norm: 'z.no/c', tittel: 'Helt annen sak om batteri', relevant: 'nei', arsak: 'Ikke maritimt' },
  { kilde: 'Sendte artikler', norm: 'q.no/q', tittel: 'Norsk rederi bestiller hydrogenferge', relevant: 'ja', arsak: '' }] };
const s = x => { f.opoint_kj_settAppsStatus(x, apps); return x; };
assert.strictEqual(s(kand[0]).appsStatus, 'sendt av Apps Script');
const k5 = s(kand[2]); assert.strictEqual(k5.appsStatus, 'vurdert, ikke sendt'); assert.strictEqual(k5.appsArsak, 'Ikke maritimt');
assert.strictEqual(s({ normUrl: 'annen.no/x', doc: doc({ header: { text: 'Norsk rederi bestiller hydrogenferge' } }) }).appsStatus, 'samme sak sannsynlig (annen URL)');
assert.strictEqual(s({ normUrl: 'ny.no/x', doc: doc({ header: { text: 'Noe helt nytt' } }) }).appsStatus, 'ikke sett av Apps Script');

// --- KI med mock vurderTreffMedAI ---
let props = { AI_ENABLED: 'true', AI_MODEL: 'modell-x' };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: n => props[n] }) };
ctx.PROMPT_VERSION = 1; ctx.TEKSTGRUNNLAG_MODUS = 'ingress'; ctx.SKYGGE_TEKSTGRUNNLAG = false;
let kiKall = [];
ctx.vurderTreffMedAI = liste => { kiKall.push(liste.length); liste.forEach((t, i) => { t.aiRelevant = i % 2 === 0; t.aiKategori = 'Hydrogen'; }); return { antallKall: liste.length, kostnad: 0.01, feil: [], stoppetTidlig: false }; };
const mange = Array.from({ length: 45 }, (_, i) => ({ doc: doc({ id_article: i, summary: { text: 'sum' + i }, first_source: { sitename: 'Site' } }), strommer: [i < 5 ? 'C' : 'A'], ekskludert: false, domene: 'd.no' }));
let ki = f.opoint_kj_kiVurder(mange, Date.now());
assert.deepStrictEqual(kiKall, [20, 20, 5]); assert.strictEqual(ki.vurdert, 45); assert.strictEqual(ki.modell, 'modell-x');
assert.strictEqual(mange[0].treff.ingress, 'sum0'); assert.strictEqual(mange[0].treff.kilde, 'Site');
assert.strictEqual(mange[5].treff.matchendeOrd[0], 'A');
// prioritering: A før C
const ko = f.opoint_kj_kiKo(mange); assert.strictEqual(ko[0].strommer[0], 'A'); assert.strictEqual(ko[44].strommer[0], 'C');
// tak 200 + tid
kiKall = [];
const tre = Array.from({ length: 205 }, (_, i) => ({ doc: doc({ id_article: i }), strommer: ['B'], ekskludert: false }));
ki = f.opoint_kj_kiVurder(tre, Date.now()); assert.strictEqual(ki.utenforTak, 5); assert.strictEqual(kiKall.reduce((a, b) => a + b, 0), 200);
kiKall = []; ki = f.opoint_kj_kiVurder(tre.map(x => Object.assign({}, x, { treff: null })), Date.now() - 10 * 60 * 1000);
assert.deepStrictEqual(kiKall, []); assert.ok(ki.melding.includes('tidsbudsjett'));
props.AI_ENABLED = 'false'; kiKall = [];
ki = f.opoint_kj_kiVurder(mange, Date.now()); assert.strictEqual(ki.kjort, false); assert.deepStrictEqual(kiKall, []);
props.AI_ENABLED = 'true'; ctx.TEKSTGRUNNLAG_MODUS = 'helside';
ki = f.opoint_kj_kiVurder(mange, Date.now()); assert.strictEqual(ki.kjort, false); ctx.TEKSTGRUNNLAG_MODUS = 'ingress';

// --- Rader kjøring ---
const kl = klient(() => ok([]), 80).kl;
const raderK = f.opoint_kj_byggRaderKjoring(kand, { oldest: 1, newest: 2 }, kl, { melding: 'm', modell: 'mx', promptversjon: 1, vurdert: 0, stat: { feil: [] } }, { merknad: [] }, d);
assert.strictEqual(raderK[3][16], 'Min vurdering'); assert.strictEqual(raderK[4][16], '');
assert.strictEqual(raderK[4][0], 'A, B');

// --- Diagnose b: dag for dag + groupidentical 0 ---
m = klient(b => b.params.groupidentical === 0 ? ok([doc({}), doc({ id_article: 2 })], '') : ok([doc({ equalgroup: b.params.oldest })], ''), 70);
const diag = f.opoint_kj_diagAvkorting(m.kl, NOW, d, () => false, f.OPOINT_T5_SPORRINGER);
assert.strictEqual(diag.length, 2); assert.strictEqual(diag[0].dager.length, 7); assert.strictEqual(diag[0].sumUnikeEqualgroup, 7);
assert.strictEqual(diag[0].helt.telling.antall, 2); assert.strictEqual(diag[0].forrige, 10); assert.strictEqual(diag[1].forrige, 21);
assert.strictEqual(m.kall[0].searchterm, f.OPOINT_T5_SPORRINGER[0].searchterm);
assert.strictEqual(m.kall[7].params.requestedarticles, 50); assert.strictEqual(m.kall[7].params.groupidentical, 0);
assert.strictEqual(m.kall[1].params.oldest - m.kall[0].params.oldest, 86400);

// --- Diagnose a ---
m = klient(b => ok([doc({ header: { text: 'T ' + b.searchterm } })]), 70);
const a = f.opoint_kj_diagSkrivemate(m.kl, NOW, () => false);
assert.deepStrictEqual(J(m.kall.map(x => x.searchterm)), ['LowNoiser', 'LOWNOISER', 'lownoiser']);
assert.ok(f.opoint_kj_byggRaderDiagnose(a, diag, m.kl, NOW, d).length > 10);

// --- Diagnose c ---
const sendteRader = [
  ['https://www.google.com/url?url=https://ex.com/a&ct=ga', new Date(Date.UTC(2026, 10, 11)), 'Ammonia ship sets sail - Splash247', 'ja', ''],
  ['https://ex.com/a', new Date(Date.UTC(2026, 10, 10)), 'Duplikat', 'ja', ''],
  ['https://nf.no/x', new Date(Date.UTC(2026, 10, 12)), 'Ukjent sak her | NF', 'nei', '']
];
const kolS = f.opoint_kj_finnKolonner(['URL', 'Dato lagt til', 'Overskrift', 'AI Relevant', 'AI Notat'], f.OPOINT_DIAG_KOLONNENAVN_SENDTE, ['tittel', 'url']);
const utv = f.opoint_kj_velgSendteRader(sendteRader, kolS, 60, d);
assert.strictEqual(utv.artikler.length, 2); assert.strictEqual(utv.duplikater, 1); assert.strictEqual(utv.artikler[0].tittel, 'Ukjent sak her | NF');
m = klient(b => {
  if (b.searchterm === 'header:"ammonia ship sets sail"') return ok([doc({ header: { text: 'Other' } }), doc({ orig_url: 'http://www.ex.com/a/', header: { text: 'Ammonia ship sets sail' } })]);
  return ok([]);
}, 130);
const dek = f.opoint_kj_kjorDekning(utv.artikler, m.kl, NOW, d, () => false);
assert.strictEqual(dek[1].vurdering.type, 'URL-match'); assert.strictEqual(dek[1].rensetTittel, 'ammonia ship sets sail');
assert.strictEqual(dek[0].vurdering.type, 'ikke funnet'); assert.strictEqual(dek[0].sok2Tekst, 'header:ukjent AND header:sak AND header:her');
assert.strictEqual(m.kall[0].params.groupidentical, 0); assert.strictEqual(m.kall[0].params.requestedarticles, 10);
const radD = f.opoint_kj_byggRaderDekning(dek, utv, kolS, ['URL', 'Dato lagt til', 'Overskrift', 'AI Relevant', 'AI Notat'], 3, m.kl, NOW, d);
assert.ok(String(radD[0][15]).includes('nf.no (1)'));
assert.strictEqual(radD[3][17], 'Renset tittel'); assert.strictEqual(radD[3][18], 'Kilde-domene');
assert.strictEqual(radD[5][8], 'http://www.ex.com/a/');

assert.ok(!logg.join('\n').includes('HEMMELIG'));
console.log('Alle OpointKjoring-tester OK');
