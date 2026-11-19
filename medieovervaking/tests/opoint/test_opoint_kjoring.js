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
(kode.match(/opoint_t3_skrivFane\(ss, ([A-Z0-9_]+)/g) || []).forEach(m =>
  assert.ok(/OPOINT_(DIAG_FANE|DIAG_FANE_DEKNING|KJOR_FANE|KJOR_FANE_SPORRINGER|KJ_TEST1_FANE|KJ_UKE_FANE|KJ_TEST2_FANE)$/.test(m.split(', ')[1]), m));
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
// Steg 1: GASS søkes ikke lenger alene i strøm A (bare som Tier 2 med kontekst)
assert.strictEqual(A.find(x => x.navn === 'A GASS'), undefined);
assert.strictEqual(A.length, 1 + 12);
assert.ok(A.every(x => !x.searchterm.includes('header:')));
const alle = f.opoint_kj_byggAlleSporringer(f.OPOINT_T2_SPORRINGER);
const antD = f.opoint_kj_byggStromD().length;
assert.strictEqual(alle.length, 13 + 10 + 1 + antD);
assert.ok(alle[alle.length - 1].searchterm.endsWith('AND site:19526,18139,338722,141703')); // ukjente → D2, 288 fast D1

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
f.opoint_kj_verifiserSites(res); assert.strictEqual(res.feil, ''); assert.ok(res.merknad.includes('0 dokumenter')); // steg 1: ikke feil

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

// ===================== Steg 1 =====================
(function () {
  // Søkeord slik hentSokeord() returnerer dem (kontekstord splittet på komma)
  const sokeord = [
    { sokeord: 'Maritime CleanTech', tier: 1, kontekstord: [], kategori: 'X' },
    { sokeord: 'FLAGSHIPS', tier: 2, kontekstord: ['hydrogen'] },
    { sokeord: 'TrAM', tier: 2, kontekstord: ['elektrisk ferge', 'hurtigferge', 'fast ferry', 'Maritime CleanTech', 'Medstraum'] },
    { sokeord: 'Apollo', tier: 2, kontekstord: ['ammoniakk', 'ammonia', 'viking energy', 'Eidesvik', 'Maritime CleanTech'] },
    { sokeord: 'GASS', tier: 2, kontekstord: ['artificial', 'kunstig', 'skip*', 'vessel*', 'Maritime CleanTech'] },
    { sokeord: 'AWESOME', tier: 2, kontekstord: ['Kongsberg maritime', 'Odfjell', 'wind assisted', 'vind-assistert', 'vind-drevet', 'shipping', 'propulsion', 'Maritime CleanTech'] },
    { sokeord: 'zero-emission zone', tier: 2, kontekstord: ['shipping', 'vessel*', 'maritime'] },
    { sokeord: 'Tom', tier: 2, kontekstord: [] },
    { sokeord: 'Feil', tier: 2, kontekstord: ['Eidesvik Maritime CleanTech'] }
  ];
  const t2 = f.opoint_kj_byggTier2(sokeord);
  const q = J(t2.sporringer.map(x => x.searchterm));
  // Rettelse a (GASS ANDNOT) og b (* på enkeltord i kontekst, ikke på fraser)
  assert.deepStrictEqual(q.slice(0, 6), [
    'FLAGSHIPS AND (hydrogen*)',
    'TrAM AND ("elektrisk ferge" OR hurtigferge* OR "fast ferry" OR "Maritime CleanTech" OR Medstraum*)',
    'Apollo AND (ammoniakk* OR ammonia* OR "viking energy" OR Eidesvik* OR "Maritime CleanTech")',
    'GASS AND (artificial* OR kunstig* OR skip* OR vessel* OR "Maritime CleanTech") ANDNOT (StealthGas OR "Stealth Gas" OR NASDAQ)',
    'AWESOME AND ("Kongsberg maritime" OR Odfjell* OR "wind assisted" OR "vind-assistert" OR "vind-drevet" OR shipping* OR propulsion* OR "Maritime CleanTech")',
    '"zero-emission zone" AND (shipping* OR vessel* OR maritime*)'
  ]);
  assert.strictEqual(t2.sporringer[3].utenUnntak, 'GASS AND (artificial* OR kunstig* OR skip* OR vessel* OR "Maritime CleanTech")');
  assert.strictEqual(f.opoint_kj_kontekstLedd('ab'), 'ab'); // under 3 tegn: ingen *
  assert.ok(t2.merknader.some(m => m.includes('"Tom" har ingen kontekstord')));
  assert.ok(t2.merknader.some(m => m.includes('Mulig manglende komma') && m.includes('Eidesvik Maritime CleanTech')));
  assert.ok(t2.merknader.some(m => m.includes('"skip*"')));
  assert.ok(!q.some(s => /\bgass\b/.test(s)), 'ingen små-bokstav-varianter');
  assert.strictEqual(f.opoint_kj_formaterLedd('ab*'), '"ab*"'); // < 3 tegn før * → frase
  assert.strictEqual(f.opoint_kj_formaterLedd('Ship"aH2oy'), 'ShipaH2oy');

  // Strøm A: GASS bare som Tier 2, ikke som eget navn
  const A = f.opoint_kj_byggStromA(f.OPOINT_T2_SPORRINGER, t2);
  assert.ok(!A.some(x => x.searchterm === 'GASS'));
  assert.strictEqual(A.filter(x => x.tier2).length, 7);
  assert.strictEqual(A.length, 1 + 12 + 7);

  // D-tilordning fra forrige kjøring
  const data = [['Vindu', 'x'], ['KI'], [''], ['Strøm(mer)', 'Dato', 'id_site', 'Domene'],
    ['D', '', 288, 'skipsrevyen.no'], ['D', '', 288, 'skipsrevyen.no'], ['D', '', 19526, 'www.maritimt.com'],
    ['D', '', 338722, 'logistikkinside.no'], ['D', '', 141703, 'energiogklima.no']];
  const sd = f.opoint_kj_siteDomenerFraRader(data);
  assert.deepStrictEqual(J(sd), { '288': 'skipsrevyen.no', '19526': 'maritimt.com', '338722': 'logistikkinside.no', '141703': 'energiogklima.no' });
  const tl = f.opoint_kj_tilordneD(sd);
  assert.deepStrictEqual(J(tl.map(t => t.id + t.gruppe)), ['288D1', '19526D1', '18139D2', '338722D2', '141703D2']);
  // Rettelse c: 288 er D1 også med annet/ukjent domene
  const tlFast = f.opoint_kj_tilordneD({ '288': 'annet.no' });
  assert.strictEqual(tlFast[0].gruppe, 'D1'); assert.ok(tlFast[0].kilde.includes('fast'));
  assert.ok(tl[2].domene.includes('ukjent'));

  // D-spørringer: maks 15 ord, riktig site-liste
  const D = f.opoint_kj_byggStromD(tl);
  const ord = s => s.replace(/site:\S+/, '').replace(/\b(AND|OR)\b|[()"]/g, ' ').trim().split(/\s+/).length;
  D.forEach(x => assert.ok(ord(x.searchterm) <= 15, x.searchterm));
  assert.ok(D.filter(x => x.navn.startsWith('D1')).every(x => x.searchterm.endsWith('AND site:288,19526')));
  assert.ok(D.filter(x => x.navn.startsWith('D2')).every(x => x.searchterm.endsWith('AND site:18139,338722,141703') &&
    x.searchterm.includes('AND (skip* OR fartøy* OR ferge* OR ferje* OR rederi* OR havn* OR maritim*)')));
  const alleTema = D.filter(x => x.navn.startsWith('D1')).map(x => x.searchterm).join(' ');
  f.OPOINT_KJOR_D_TEMAORD.forEach(t => assert.ok(alleTema.includes(t), t));
  assert.ok(alleTema.includes('"EU ETS"') && alleTema.includes('"Maritime CleanTech"'));
  // Ukjent domene → D2 (unntatt fast D1 for 288)
  assert.deepStrictEqual(J(f.opoint_kj_tilordneD({}).map(t => t.gruppe)), ['D1', 'D2', 'D2', 'D2', 'D2']);

  // Verifisering per gruppe, 0 dokumenter er ikke feil
  let rv = { dokumenter: [doc({ id_site: 288 })], feil: '', merknad: '' };
  f.opoint_kj_verifiserSites(rv, [288, 19526]); assert.ok(rv.merknad.includes('bekreftet'));
  rv = { dokumenter: [doc({ id_site: 18139 })], feil: '', merknad: '' };
  f.opoint_kj_verifiserSites(rv, [288, 19526]); assert.ok(rv.feil.includes('ikke bekreftet'));
  rv = { dokumenter: [], feil: '', merknad: '' };
  f.opoint_kj_verifiserSites(rv, [288]); assert.strictEqual(rv.feil, '');

  // Testfunksjonens logikk med simulerte svar
  const vindu = { oldest: 1, newest: 2 }, vinduH = { oldest: 3, newest: 4 };
  const m = klient(b => {
    if (b.searchterm === 'GASS') return ok([doc({ header: { text: 'MODENA komfyr på gass' } }), doc({ id_article: 2, header: { text: 'Sykkelritt' } })]);
    if (b.searchterm.startsWith('GASS AND') && b.params.oldest === 3 && !b.searchterm.includes('ANDNOT'))
      return ok([doc({ header: { text: 'GASS completes final Business Plan ahead of project conclusion' } }), doc({ id_article: 9, header: { text: 'StealthGas Q3 results (NASDAQ: GASS)' } })]);
    if (b.searchterm.startsWith('GASS AND') && b.params.oldest === 3) return ok([doc({ header: { text: 'GASS completes final Business Plan ahead of project conclusion' } })]);
    if (b.searchterm.startsWith('GASS AND')) return ok([]);
    if (b.searchterm.startsWith('site:')) return ok([doc({ id_site: 288 }), doc({ id_site: 288, id_article: 2 })]);
    if (b.searchterm.includes('site:288')) return ok([doc({ id_site: 288 })]);
    return ok([]);
  }, 60);
  const oppsett = { tier2: t2, tilordningD: tl, merknader: [] };
  const res = f.opoint_kj_kjorTestSteg1(m.kl, oppsett, vindu, vinduH, () => false);
  const rader = f.opoint_kj_byggRaderTestSteg1(res, oppsett, vindu, vinduH, m.kl, d);
  assert.strictEqual(rader[3][1], 'OK'); assert.ok(rader[3][2].includes('Før: 2'));
  assert.strictEqual(rader[4][0], 'GASS: StealthGas/NASDAQ borte i 3.–9. nov'); assert.strictEqual(rader[4][1], 'OK');
  assert.ok(rader[4][2].startsWith('Uten unntak: 1'));
  assert.strictEqual(rader[5][1], 'OK');
  assert.ok(rader[6][1].startsWith('Før: 2'));
  assert.ok(m.kall.every(c => !('text' in c.params.main)));
  assert.ok(m.kall.length <= 60);
})();
console.log('Steg 1-tester OK');

// ===================== Rettelse d + steg 2 =====================
(function () {
  // Strøm B: ny kontekst i alle, tabell kan overstyre
  const B = f.opoint_kj_byggStromB(false), G = f.opoint_kj_byggStromB(true);
  assert.strictEqual(B.length, 10);
  B.forEach(x => assert.ok(x.searchterm.endsWith(' AND ' + f.OPOINT_B_KONTEKST), x.navn));
  assert.ok(f.OPOINT_B_KONTEKST.includes(') ANDNOT (') && !/AND NOT/.test(f.OPOINT_B_KONTEKST));
  assert.ok(!f.OPOINT_B_KONTEKST.includes('"e-bike*"'));
  assert.strictEqual(G[6].searchterm, '(header:battery OR header:electric) AND (ferry OR vessel OR ship)');
  assert.strictEqual(G[0].searchterm, 'header:ammonia AND (vessel OR ship OR shipping)');
  f.OPOINT_KJOR_STROM_B_TABELL[1].kontekst = '(tanker*)';
  assert.strictEqual(f.opoint_kj_byggStromB(false)[1].searchterm, 'header:methanol AND (tanker*)');
  delete f.OPOINT_KJOR_STROM_B_TABELL[1].kontekst;
  const alle = f.opoint_kj_byggAlleSporringer(f.OPOINT_T2_SPORRINGER);
  assert.strictEqual(alle.filter(x => x.strom === 'B').length, 10);

  // Forrige KI fra "Opoint-kjøring"
  const fk = f.opoint_kj_forrigeKiFraRader([['Vindu'], ['KI'], [''], ['Strøm(mer)', 'Tittel', 'URL', 'KI relevant'],
    ['B', 'Phone ship', 'https://www.ex.com/a?x', 'ja'], ['B', 'Y', 'https://y.com/b', 'nei']]);
  assert.strictEqual(fk.antall, 2); assert.strictEqual(fk.kart['ex.com/a'], 'ja');

  // Steg 2-test med simulerte svar
  const m = klient(b => {
    const ny = b.searchterm.includes('ANDNOT');
    if (b.searchterm.startsWith('header:ammonia')) {
      return ok(ny ? [doc({ id_article: 1, orig_url: 'https://keep.no/1' }), doc({ id_article: 3, orig_url: 'https://new.no/3' })]
        : [doc({ id_article: 1, orig_url: 'https://keep.no/1' }), doc({ id_article: 2, orig_url: 'https://ex.com/a', url_common: 'ex.com', header: { text: 'Phone ship' } })]);
    }
    return ok([]);
  }, 90);
  const s2 = f.opoint_kj_kjorTestSteg2(m.kl, { oldest: 1, newest: 2 }, fk, () => false);
  assert.strictEqual(s2.length, 10); assert.strictEqual(s2[0].borte.length, 1); assert.strictEqual(s2[0].nyeDok, 1);
  assert.strictEqual(s2[0].borte[0].kiForrige, 'ja'); assert.strictEqual(s2[0].borte[0].domene, 'ex.com');
  const r2 = f.opoint_kj_byggRaderTestSteg2(s2, { oldest: 1, newest: 2 }, m.kl, fk, d);
  assert.strictEqual(r2[0][10], 1); assert.strictEqual(r2[0][12], 1);
  assert.ok(r2.some(r => r[6] === 'KI-RELEVANT FORSVANT'));
  assert.strictEqual(m.kall.length, 20);

  // Uketest
  const t2 = f.opoint_kj_byggTier2([{ sokeord: 'FLAGSHIPS', tier: 2, kontekstord: ['hydrogen'] },
    { sokeord: 'TrAM', tier: 2, kontekstord: ['hurtigferge'] }]);
  const mu = klient(() => ok([doc({})]), 20);
  const ru = f.opoint_kj_kjorUke(mu.kl, t2, { oldest: 1, newest: 2 }, () => false);
  assert.strictEqual(ru.length, 3); assert.strictEqual(ru[0].dokumenter.length, 1);
  assert.ok(ru[2].feil.includes('zero-emission zone'));
  assert.strictEqual(mu.kall.length, 2);
  assert.ok(f.opoint_kj_byggRaderUke(ru, { oldest: 1, newest: 2 }, mu.kl, d).length === 6);
})();
console.log('Rettelse d + steg 2-tester OK');
