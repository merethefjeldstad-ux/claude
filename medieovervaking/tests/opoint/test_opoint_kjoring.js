// Node-test av OpointKjoring.gs (uten Apps Script). Kjør: node tests/opoint/test_opoint_kjoring.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const logg = [];
const ctx = { Logger: { log: s => logg.push(String(s)) } }; vm.createContext(ctx);
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', 'OpointKjoring.gs'].forEach(f =>
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
assert.ok(!/newTrigger\(|MailApp\.|textrazor|readership|text:\s*1|getEffectiveUser|vurderTreffMedAI\(/.test(kode));
// Del 4: én utsending, og bare til Script Property TEST_EPOST
assert.strictEqual((kode.match(/GmailApp\.sendEmail/g) || []).length, 1);
assert.ok(/getProperty\('TEST_EPOST'\)/.test(kode) && /GmailApp\.sendEmail\(String\(til\)\.trim\(\)/.test(kode));
assert.ok(!/hentMottakere|FANE_MOTTAKERE/.test(kode));
assert.strictEqual((kode.match(/api\.anthropic\.com/g) || []).length, 2); // enkeltkall og fetchAll i opoint_kj_lagKiTjeneste
assert.ok(!/getSheetByName\((?:FANE_|'Sendte|'Artikkellogg|'Referansesett|'Kjøretidslogg|'Mottakere)/.test(kode));
// Ingen skriving til beskyttede faner: skrivFane kalles kun med egne fanekonstanter
(kode.match(/opoint_t3_skrivFane\(ss, ([A-Z0-9_]+)/g) || []).forEach(m =>
  assert.ok(/OPOINT_(DIAG_FANE|DIAG_FANE_DEKNING|KJOR_FANE|KJOR_FANE_SPORRINGER|KJ_TEST1_FANE|KJ_UKE_FANE|KJ_TEST2_FANE|KJ_TESTD_FANE|KJ_T2B_FANE|KJ_T2C_FANE|KJ_T2DE_FANE|KJOR_FANE_ALLE|KJ_SCAN_FANE|KJ_T420_FANE|KJ_TDEDUP_FANE|KJ_TRC_FANE|KJOR_FANE_SAMMENDRAG|KJOR_FANE_RAPPORT|KJ_RECALL_FANE)$/.test(m.split(', ')[1]), m));
assert.strictEqual(f.OPOINT_KJOR_SEND_EPOST, undefined); // e-post er fjernet helt

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
assert.ok(alle[alle.length - 1].searchterm.endsWith('AND site:338722,141703')); // konfigurerte domener: 64/19526/18139 i D1

// --- Mock-klient ---
function klient(svarFn, maks) {
  const kall = [];
  const kl = f.opoint_t3_lagKlient('HEMMELIG', maks, b => { kall.push(J(b)); return svarFn(b, kall.length); }, () => {});
  return { kl, kall };
}
const ok = (docs, c) => ({ status: 200, tekst: JSON.stringify({ searchresult: { documents: docs.length, range_count: 9, context: c || '', document: docs } }) });
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1763450000, header: { text: 'x' }, summary: { text: 's' }, language: { text: 'en' } }, o);

// --- Strøm D-verifisering ---
let res = { dokumenter: [doc({ id_site: 64 }), doc({ id_site: 19526 })], feil: '', merknad: '' };
f.opoint_kj_verifiserSites(res); assert.ok(res.merknad.includes('bekreftet'));
res = { dokumenter: [doc({ id_site: 64 }), doc({ id_site: 5 })], feil: '', merknad: '' };
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
const sk0 = f.opoint_kj_lagSaker(kand, null); // uten KI: hver ikke-ekskluderte artikkel er egen sak
assert.strictEqual(sk0.length, 2); assert.strictEqual(kand[1].sak, ''); assert.ok(kand[0].fastRelevant === true); // treff fra strøm A uten tier2

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
    f.OPOINT_T2_OVERSTYRING.Apollo, // steg 2d: overstyrt
    'GASS AND (artificial* OR kunstig* OR skip* OR vessel* OR "Maritime CleanTech") ANDNOT (StealthGas OR "Stealth Gas" OR NASDAQ)',
    f.OPOINT_T2_OVERSTYRING.AWESOME, // steg 2d: overstyrt
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
    ['D', '', 64, 'skipsrevyen.no'], ['D', '', 64, 'skipsrevyen.no'], ['D', '', 19526, 'www.maritimt.com'],
    ['D', '', 338722, 'logistikkinside.no'], ['D', '', 141703, 'energiogklima.no']];
  const sd = f.opoint_kj_siteDomenerFraRader(data);
  assert.deepStrictEqual(J(sd), { '64': 'skipsrevyen.no', '19526': 'maritimt.com', '338722': 'logistikkinside.no', '141703': 'energiogklima.no' });
  const tl = f.opoint_kj_tilordneD(sd);
  // 18139 ikke sett i forrige kjøring → konfigurert domene kystmagasinet.no → D1
  assert.deepStrictEqual(J(tl.map(t => t.id + t.gruppe)), ['64D1', '19526D1', '18139D1', '338722D2', '141703D2']);
  assert.ok(tl[2].kilde.includes('fast')); // steg 2: alle har fast gruppe
  // 64 er fast D1 også med annet domene
  const tlFast = f.opoint_kj_tilordneD({ '64': 'annet.no' });
  assert.strictEqual(tlFast[0].gruppe, 'D1'); assert.ok(tlFast[0].kilde.includes('fast'));
  assert.ok(tl[2].domene.includes('fra konfigurasjon'));

  // D-spørringer: maks 15 ord, riktig site-liste
  const D = f.opoint_kj_byggStromD(tl);
  const ord = s => s.replace(/site:\S+/, '').replace(/\b(AND|OR)\b|[()"]/g, ' ').trim().split(/\s+/).length;
  D.forEach(x => assert.ok(ord(x.searchterm) <= 15, x.searchterm));
  assert.ok(D.filter(x => x.navn.startsWith('D1')).every(x => x.searchterm.endsWith('AND site:64,19526,18139')));
  assert.ok(D.filter(x => x.navn.startsWith('D2')).every(x => x.searchterm.endsWith('AND site:338722,141703') &&
    x.searchterm.includes('AND (skip* OR fartøy* OR ferge* OR ferje* OR rederi* OR havn* OR maritim*)')));
  const alleTema = D.filter(x => x.navn.startsWith('D1')).map(x => x.searchterm).join(' ');
  f.OPOINT_KJOR_D_TEMAORD.forEach(t => assert.ok(alleTema.includes(t), t));
  assert.ok(alleTema.includes('"EU ETS"') && alleTema.includes('"Maritime CleanTech"'));
  // Ingen data fra forrige kjøring → konfigurerte domener avgjør
  assert.deepStrictEqual(J(f.opoint_kj_tilordneD({}).map(t => t.gruppe)), ['D1', 'D1', 'D1', 'D2', 'D2']);

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
    if (b.searchterm.startsWith('site:')) return ok([doc({ id_site: 64 }), doc({ id_site: 64, id_article: 2 })]);
    if (b.searchterm.includes('site:64')) return ok([doc({ id_site: 64 })]);
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
  // Steg 2 (rettet): bred kontekst er erstattet av gammel positiv kontekst + ANDNOT
  B.forEach(x => assert.ok(x.searchterm.includes(') ANDNOT (') && !/AND NOT/.test(x.searchterm) && !x.searchterm.includes('"e-bike*"'), x.navn));
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
  assert.strictEqual(ru[0].dokumenter.length, 1);
  assert.strictEqual(ru.length, 5); // FLAGSHIPS, TrAM, Apollo, AWESOME, zero-emission zone
  assert.ok(ru[2].feil.includes('Apollo') && ru[4].feil.includes('zero-emission zone'));
  assert.strictEqual(mu.kall.length, 2);
  assert.strictEqual(f.opoint_kj_byggRaderUke(ru, { oldest: 1, newest: 2 }, mu.kl, d).length, 8);
  assert.strictEqual(f.OPOINT_KJ_UKE_DAGER, 30);

  // Rettelse a: kontroll av D-id-er mot forrige kjøring
  const kd = f.opoint_kj_kontrollerDIder([['Vindu'], [''], [''], ['Strøm(mer)', 'Tittel', 'id_site', 'Domene'],
    ['C', 'Brann i ladetårn ved ferjekai', 64, 'skipsrevyen.no'], ['D', 'X', 19526, 'maritimt.com'],
    ['D', 'Y', 999, 'logistikkinside.no']]);
  assert.deepStrictEqual(J(kd.kilder.map(k => k.status)), ['OK', 'OK', 'ikke sett i forrige kjøring', 'AVVIK', 'ikke sett i forrige kjøring']);
  assert.strictEqual(kd.kontrolltittel[0].id_site, '64');
  // D1-kjøring i to vinduer, Skipsrevyen markeres
  const md = klient(b => ok([doc({ id_site: 64, url_common: 'skipsrevyen.no', header: { text: 'Ferje' } })]), 30);
  const tlD = f.opoint_kj_tilordneD({});
  const d1 = f.opoint_kj_byggStromD(tlD).filter(x => x.navn.startsWith('D1'));
  const kj = [];
  [{ navn: 'dag', v: { oldest: 1, newest: 2 } }, { navn: 'hist', v: { oldest: 3, newest: 4 } }].forEach(vi => d1.forEach(sp => {
    const r = f.opoint_kj_hentSporring(md.kl, sp, vi.v, 25, 4, true); f.opoint_kj_verifiserSites(r, sp.verifiserSites); r.vinduNavn = vi.navn; kj.push(r);
  }));
  const rd = f.opoint_kj_byggRaderTestD(kd, tlD, kj, [], md.kl, d);
  assert.ok(rd.some(r => r[2] === 'JA' && r[3] === 64));
  assert.strictEqual(md.kall.length, 2 * d1.length);
})();
console.log('Rettelse d + steg 2-tester OK');

// ===================== Steg 2 (rettet) =====================
(function () {
  // 2b: B med gammel positiv kontekst + ANDNOT
  const B = f.opoint_kj_byggStromB(false);
  assert.strictEqual(B[0].searchterm, 'header:ammonia AND (vessel* OR ship OR shipping) ANDNOT (smartphone* OR phone* OR laptop* OR gadget* OR "e-bike" OR "e-bikes" OR ebike* OR "free shipping" OR hair* OR comb OR combs OR "blood vessel" OR "blood vessels" OR CAGR OR "market size" OR "market share" OR mAh OR megapixel*)');
  assert.ok(!B.some(x => x.searchterm.includes('ships with')), '"ships with" er fjernet');
  assert.ok(!B[0].searchterm.includes('comb*'), 'comb* ville truffet combustion');
  assert.ok(B[6].searchterm.startsWith('(header:battery OR header:electric) AND (ferry OR vessel* OR ship) ANDNOT ('));
  const Bu = f.opoint_kj_byggStromB(false, ['phone*']);
  assert.ok(!Bu[0].searchterm.includes(' phone*') && Bu[0].searchterm.includes('smartphone*'));
  f.OPOINT_B_ANDNOT_FJERN.push('gadget*'); assert.ok(!f.opoint_kj_byggStromB(false)[0].searchterm.includes('gadget')); f.OPOINT_B_ANDNOT_FJERN.length = 0;
  assert.ok(B.every(x => !/AND NOT/.test(x.searchterm)));

  // 2a med simulerte svar: phone* finnes i Auramarine-teksten, "ships with" i Denmark
  const arts = f.OPOINT_KJ_T2B_ARTIKLER;
  const aura = doc({ id_article: 1, url_common: 'tradearabia.com', header: { text: arts[0].tittel } });
  const nor = doc({ id_article: 2, url_common: 'scandasia.com', header: { text: arts[1].tittel } });
  const den = doc({ id_article: 3, url_common: 'europesays.com', header: { text: arts[2].tittel } });
  const m = klient(b => {
    const st = b.searchterm;
    const hvem = st.includes('auramarine') ? aura : st.includes('norwegian') ? nor : st.includes('denmark') ? den : null;
    if (!hvem) return ok([]);
    if (!st.includes(' AND (')) return ok([hvem, doc({ id_article: 99, header: { text: 'Annet' } })]);
    if (hvem === aura && st.endsWith('(phone*)')) return ok([hvem]);
    if (hvem === den && st.endsWith('(gadget*)')) return ok([hvem]);
    return ok([]);
  }, 130);
  const a = f.opoint_kj_kjorSteg2A(m.kl, { oldest: 1, newest: 2 }, () => false);
  assert.deepStrictEqual(J(a.skyldige), ['phone*', 'gadget*']);
  assert.deepStrictEqual(J(a.artikler.map(r => r.treffOrd)), [['phone*'], [], ['gadget*']]);
  assert.strictEqual(m.kall.length, 3 + 3 * f.OPOINT_B_ANDNOT_ORD.length);
  assert.ok(a.artikler.every(r => r.funnet));
  const ra = f.opoint_kj_byggRaderSteg2A(a, { oldest: 1, newest: 2 }, m.kl, d);
  assert.strictEqual(ra[1][1], 'phone*, gadget*');

  // Uønskede titler
  const u = f.opoint_kj_byggRaderUonsket([{ navn: 'B x', gammel: { dokumenter: [doc({ header: { text: 'New smartphone ships with 5G' } })] },
    ny: { dokumenter: [doc({ header: { text: 'Ammonia vessel' } })] } }]);
  assert.strictEqual(u[1][1], 'før: 1'); assert.strictEqual(u[1][3], 'OK');

  // 2c: skipsregister
  assert.ok(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://www.maritimt.com/nyheter/orient-inspirer-2026-11' })).includes('maritimt.com'));
  assert.ok(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://maritimt.com/orient-inspirer-2026-11/' })));
  assert.strictEqual(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://maritimt.com/nyheter/ny-ferje-2026' })), '');
  assert.strictEqual(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://maritimt.com/2026-11/sak' })), '');
  assert.ok(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://batomtaler.kystmagasinet.no/x' })).includes('batomtaler'));
  assert.strictEqual(f.opoint_kj_skipsregisterGrunn(doc({ orig_url: 'https://www.kystmagasinet.no/x-2026-11' })), '');
  const kd = f.opoint_kj_dedup([{ strom: 'D', navn: 'D1', dokumenter: [doc({ id_article: 1, orig_url: 'https://maritimt.com/a-2026-11' }),
    doc({ id_article: 2, orig_url: 'https://maritimt.com/sak' })] }], []);
  assert.strictEqual(kd[0].ekskludert, true); assert.ok(kd[0].ekskluderGrunn.includes('Skipsregister'));
  assert.strictEqual(kd[1].ekskludert, false);
  const r2c = f.opoint_kj_byggRaderSteg2C([{ navn: 'D1', searchterm: 'x', statuser: [200], dokumenter: [doc({ id_article: 1, orig_url: 'https://maritimt.com/a-2026-11' }),
    doc({ id_article: 2, orig_url: 'https://maritimt.com/b' }), doc({ id_article: 2, orig_url: 'https://maritimt.com/b' })], contextTom: true, feil: '', merknad: '' }],
    { oldest: 1, newest: 2 }, klient(() => ok([]), 5).kl, d);
  assert.strictEqual(r2c[0][8], 2); assert.strictEqual(r2c[0][10], 1);
  // Alle D-kilder har fast gruppe
  assert.deepStrictEqual(J(f.opoint_kj_tilordneD({ '18139': 'batomtaler.kystmagasinet.no' }).map(t => t.gruppe)), ['D1', 'D1', 'D1', 'D2', 'D2']);

  // 2d: overstyring
  const t2 = f.opoint_kj_byggTier2([{ sokeord: 'Apollo', tier: 2, kontekstord: ['ammoniakk'] },
    { sokeord: 'AWESOME', tier: 2, kontekstord: [] }, { sokeord: 'TrAM', tier: 2, kontekstord: ['hurtigferge'] },
    { sokeord: 'GASS', tier: 2, kontekstord: ['kunstig'] }]);
  assert.strictEqual(t2.sporringer[0].searchterm, f.OPOINT_T2_OVERSTYRING.Apollo);
  assert.ok(t2.sporringer[0].searchterm.includes('((Equinor OR Wartsila OR Wärtsilä) AND (ammonia OR ammoniakk))'));
  assert.strictEqual(t2.sporringer[1].searchterm, f.OPOINT_T2_OVERSTYRING.AWESOME); // også uten kontekstord i arket
  assert.strictEqual(t2.sporringer[2].searchterm, 'TrAM AND (hurtigferge*)');
  assert.ok(t2.sporringer[3].searchterm.endsWith('ANDNOT (StealthGas OR "Stealth Gas" OR NASDAQ)'));
  assert.strictEqual(f.opoint_kj_finnOverstyring('apollo'), f.OPOINT_T2_OVERSTYRING.Apollo);

  // 2d + 2e rader
  const md = klient(b => ok([doc({ header: { text: 'Apollo ' + b.searchterm.slice(0, 10) } })]), 30);
  const dd = ['Apollo', 'AWESOME'].map(o => f.opoint_kj_hentSporring(md.kl, { navn: o, searchterm: f.opoint_kj_finnOverstyring(o) }, { oldest: 1, newest: 2 }, 25, 4, true));
  const ee = ['Apollo', 'Apollo AND ammonia*', f.OPOINT_T2_OVERSTYRING.Apollo].map((q, i) => f.opoint_kj_hentSporring(md.kl, { navn: 'v' + i, searchterm: q }, { oldest: 1, newest: 2 }, 25, 4, true));
  const rde = f.opoint_kj_byggRaderSteg2DE(dd, ee, { oldest: 1, newest: 2 }, { oldest: 1, newest: 2 }, md.kl, d);
  assert.ok(rde.some(r => r[0] === 'v1' && r[2] === '9' || r[0] === 'v1' && String(r[2]) === '9'));

  // 2f: Kildeprioritet – bare nye domener, normalisert, eksisterende urørt
  const data = [['Domene', 'Nivå (1–4)', 'Åpen', 'Merknad'], ['msn.com/en-us', 2, 'ja', ''], ['www.Mainichi.jp/english', 3, '', ''], ['tu.no', 1, 'ja', '']];
  const plan = f.opoint_kj_planNyeDomener(data, [{ domene: 'msn.com' }, { domene: 'mainichi.jp' }, { domene: 'splash247.com' },
    { domene: 'www.splash247.com' }, { domene: '' }, { domene: 'TU.no' }]);
  assert.deepStrictEqual(J(plan.nye), ['splash247.com']);
  assert.deepStrictEqual(J(plan.rader), [['splash247.com', '', '', 'Ny, ikke vurdert']]);
  assert.ok(f.opoint_kj_planNyeDomener([['Navn']], []).feil.includes('Domene'));
  assert.strictEqual(f.opoint_kj_normDomene('https://www.msn.com/en-us/news'), 'msn.com');
  // KI er på for den samlede kjøringen (steg 4–5)
  assert.strictEqual(f.OPOINT_KJOR_KI_AKTIV, true);
})();
console.log('Steg 2 (rettet)-tester OK');

// ===================== Rettelse a–c + steg 3–5 =====================
(function () {
  // c) domene alltid vert
  assert.strictEqual(f.opoint_kj_domene(doc({ url_common: 'https://uk.news.yahoo.com/x', orig_url: 'https://uk.news.yahoo.com/x' })), 'uk.news.yahoo.com');
  assert.strictEqual(f.opoint_kj_domene(doc({ url_common: 'https:', orig_url: 'https://www.msn.com/en-us/news/a' })), 'msn.com');
  assert.strictEqual(f.opoint_kj_domene(doc({ orig_url: 'https://mainichi.jp/english/articles/1' })), 'mainichi.jp');
  assert.strictEqual(f.opoint_kj_normDomene('mainichi.jp/english'), 'mainichi.jp');

  // a) Scandasia-varianter: full, uten hvert ord, uten *, og ordtester
  const v = f.opoint_kj_scandasiaVarianter();
  assert.ok(v.some(x => x.navn === 'Ny positiv med vessel (uten *), uten ANDNOT' && x.q.includes('(ferry OR vessel OR ship)')));
  assert.strictEqual(v.filter(x => x.navn.startsWith('Ny full uten ')).length, f.OPOINT_B_ANDNOT_ORD.length);
  assert.strictEqual(v.filter(x => x.ord).length, f.OPOINT_B_ANDNOT_ORD.length);
  const art = f.OPOINT_KJ_SCAN_ART;
  const scan = doc({ id_article: 7, url_common: 'scandasia.com', header: { text: art.tittel } });
  const fyll = Array.from({ length: 110 }, (_, i) => doc({ id_article: 100 + i, header: { text: 'Electric boat ' + i } }));
  const m = klient(b => {
    const st = b.searchterm;
    if (st.startsWith('header:norwegian') || st.startsWith('header:')) {
      if (!st.includes(' AND ') || st.split(' AND ').length <= 4) return ok([scan]);
      if (/AND \(phone\*\)$/.test(st)) return ok([scan]);
      if (st.includes('ANDNOT') && st.includes('phone*')) return ok([]);
      return ok([scan]);
    }
    // full spørring uten id: artikkelen ligger som nr. 105
    const alle = fyll.slice(0, 104).concat([scan]);
    const startI = b.params.context ? Number(b.params.context) : 0;
    const bit = alle.slice(startI, startI + 25);
    return ok(bit, startI + 25 < alle.length ? String(startI + 25) : '');
  }, 60);
  const ut = f.opoint_kj_kjorScandasia(m.kl, { oldest: 1, newest: 2 }, () => false);
  assert.ok(ut.funnet); assert.strictEqual(ut.posisjon, 105); assert.strictEqual(ut.batchFull, 5);
  const rs = f.opoint_kj_byggRaderScandasia(ut, { oldest: 1, newest: 2 }, m.kl, d);
  assert.ok(rs[1][1].includes('Ny spørring treffer ikke') && rs[1][1].includes('phone*'), rs[1][1]);

  // Steg 3: Kildeprioritet
  const prio = { kart: f.opoint_kj_prioritetFraRader([['Domene', 'Nivå (1–4)', 'Åpen (ja/nei/ukjent)', 'Merknad'],
    ['yahoo.com', 2, 'ja', ''], ['msn.com/en-us', 4, 'nei', ''], ['ny.no', '', '', 'Ny, ikke vurdert'], ['tu.no', '1', 'JA', '']]),
    kilder: { 'rss.kilde.no': true, 'kilde.no': true } };
  assert.deepStrictEqual(J(f.opoint_kj_nivaFor('uk.news.yahoo.com', prio)), { niva: 2, apen: 'ja', grunnlag: 'Kildeprioritet (yahoo.com)' });
  assert.strictEqual(f.opoint_kj_nivaFor('msn.com', prio).niva, 4);
  assert.strictEqual(f.opoint_kj_nivaFor('ny.no', prio).niva, 3);
  assert.strictEqual(f.opoint_kj_nivaFor('kilde.no', prio).niva, 1);
  assert.strictEqual(f.opoint_kj_nivaFor('ukjent.org', prio).niva, 3);
  assert.strictEqual(f.opoint_kj_nivaFor('tu.no', prio).apen, 'ja');
  const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'header:ammonia AND (x)', dokumenter: [
    doc({ id_article: 1, orig_url: 'https://www.msn.com/en-us/a' }), doc({ id_article: 2, orig_url: 'https://tu.no/a' })] }], []);
  f.opoint_kj_settNivaer(kk, prio);
  assert.strictEqual(kk[0].ekskludert, true); assert.strictEqual(kk[0].ekskluderGrunn, 'Kildeprioritet nivå 4');
  assert.strictEqual(kk[1].niva, 1);

  // Steg 4a: gruppering
  assert.deepStrictEqual(J(f.opoint_kj_tolkGrupper('{"grupper": [[1,2],[2,3],[4],[5,99,6]]}', 6)), [[1, 2], [5, 6]]);
  assert.strictEqual(f.opoint_kj_tolkGrupper('tull', 3), null);
  const lang = 'x'.repeat(200);
  const tekst = f.opoint_kj_sakTekst([{ doc: doc({ header: { text: lang }, language: { text: 'en' } }) }]);
  assert.strictEqual(tekst, '1 [en] ' + 'x'.repeat(120) + ' || s'); // 1c: ingress med
  const tLang = f.opoint_kj_sakTekst([{ doc: doc({ header: { text: 'T' }, summary: { text: 'y'.repeat(300) } }) }]);
  assert.strictEqual(tLang, '1 [en] T || ' + 'y'.repeat(200));
  assert.strictEqual(f.opoint_kj_sakTekst([{ doc: doc({ header: { text: 'T' }, summary: { text: '' }, language: undefined }) }]), '1 [?] T');

  // KI-tjeneste med mock: kalltak, buffer, kostnad, nøkkel aldri ut
  let anth = [];
  const props = { ANTHROPIC_API_KEY: 'sk-HEMMELIG', AI_MODEL: 'claude-haiku-5-5' };
  const buffer = {}; const cache = { get: k => buffer[k] || null, put: (k, v) => { buffer[k] = v; } };
  const svarFor = body => {
    const u = body.messages[0].content;
    if (body.system.includes('grupperer')) return '{"grupper": [[1, 2]]}';
    if (u.includes('Tull')) return 'ikke json';
    // Flere saker per kall: ett svar per «SAK n»
    const blokker = u.split(/SAK (\d+)\n/).slice(1);
    const saker = [];
    for (let i = 0; i < blokker.length; i += 2) {
      const nr = Number(blokker[i]), t = blokker[i + 1];
      saker.push({ nr, relevant: !t.includes('kaffe'), kategori: 'Energi og framdrift', nevner_oss: false, prioritet: 'middels', irrelevant_grunn: 'Kaffe', notat: '' });
    }
    return JSON.stringify({ saker });
  };
  const tj = () => f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache, hash: x => String(x.length) + x.slice(-40),
    fetch: body => { anth.push(body); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFor(body) }], usage: { input_tokens: 1000, output_tokens: 100 } }) }; } });
  const t1 = tj();
  const kand = f.opoint_kj_dedup([
    { strom: 'A', navn: 'A HyShip', searchterm: '(HyShip OR hyship OR HYSHIP)', tier2: false, dokumenter: [doc({ id_article: 1, orig_url: 'https://a.no/1', header: { text: 'HyShip leverer' }, summary: { text: '  Hydrogen  skip …  ' }, unix_timestamp: 5 })] },
    { strom: 'B', navn: 'B ammonia', searchterm: 'header:ammonia AND (vessel*)', dokumenter: [doc({ id_article: 2, orig_url: 'https://b.no/2', header: { text: 'HyShip delivers' }, summary: { text: 'Ammonia ship' }, unix_timestamp: 4 }),
      doc({ id_article: 3, orig_url: 'https://c.no/3', header: { text: 'Ammonia ferry kaffe' }, summary: { text: 'kaffe' }, unix_timestamp: 3 })] },
    { strom: 'A', navn: 'A T2 GASS', searchterm: 'GASS AND (x)', dokumenter: [doc({ id_article: 4, orig_url: 'https://d.no/4', header: { text: 'GASS prosjekt' }, summary: { text: 'GASS i ingressen' } })] }
  ].map(r => Object.assign({ tier2: r.navn.includes('T2') }, r)), []);
  kand.forEach(k => { k.niva = 3; k.apen = 'ukjent'; });
  kand[1].niva = 1; // b.no er nivå 1 → representant selv om a.no er A-treff
  const g = f.opoint_kj_grupperSaker(kand, t1);
  assert.deepStrictEqual(J(g.grupper), [[0, 1]]);
  const saker = f.opoint_kj_lagSaker(kand, g);
  assert.strictEqual(saker.length, 3); assert.strictEqual(saker[0].representant, kand[1]); assert.strictEqual(saker[0].fastRelevant, true);
  assert.strictEqual(saker[0].andreKilder, 'a.no (3)');
  const oppsett = { sokeord: [{ sokeord: 'HyShip', kategori: 'Prosjekter' }] };
  const ki = f.opoint_kj_vurderSaker(saker, oppsett, t1);
  assert.strictEqual(saker[0].kiResultat.relevant, true); assert.strictEqual(saker[0].kiResultat.nevnerOss, true);
  assert.strictEqual(saker[0].kiResultat.kategori, 'Prosjekter'); // fra Søkeord, ingen KI
  assert.strictEqual(saker[1].kiResultat.relevant, false); assert.strictEqual(saker[1].kiResultat.irrelevantGrunn, 'Kaffe');
  assert.strictEqual(saker[2].kiResultat.relevant, true); assert.strictEqual(saker[2].kiResultat.nevnerOss, false); // Tier 2: KI avgjør
  assert.strictEqual(anth.length, 2); // 1 gruppering + 1 relevanskall for begge sakene (HyShip-saken trengte ikke KI)
  assert.ok(anth.every(b => b.max_tokens >= 400));
  const rel = anth.filter(b => !b.system.includes('grupperer'));
  assert.ok(rel.every(b => !/sammendrag/.test(b.system) && /avkuttet/.test(b.system)));
  const blokk = f.opoint_kj_kiBrukerTekst(saker[1].representant);
  assert.strictEqual(saker[1].kiResultat.tegn, blokk.length); assert.ok(rel[0].messages[0].content.includes('SAK 2\n' + blokk)); // GASS (A) er SAK 1
  assert.ok(Math.abs(ki.kostnad - 2 * (1000 / 1e6 * 0.10 + 100 / 1e6 * 0.5)) < 1e-9);
  // Gjenopptak: samme kjøring på nytt bruker bufferen, ingen nye kall
  anth = [];
  const t2 = tj();
  const saker2 = f.opoint_kj_lagSaker(kand, f.opoint_kj_grupperSaker(kand, t2));
  f.opoint_kj_vurderSaker(saker2, oppsett, t2);
  assert.strictEqual(anth.length, 0); assert.strictEqual(t2.fraBuffer, 2);
  // Kalltak
  const t3 = f.opoint_kj_lagKiTjeneste(1, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
    fetch: body => ({ status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFor(body) }] }) }) });
  assert.ok(t3.spor('x', 's', 'a', 400).ok); assert.ok(!t3.spor('x', 's', 'b', 400).ok); assert.ok(t3.stoppet.includes('kalltaket'));
  // Parsefeil i gruppering → hver artikkel egen sak
  const t4 = f.opoint_kj_lagKiTjeneste(5, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
    fetch: () => ({ status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: 'beklager' }] }) }) });
  const g4 = f.opoint_kj_grupperSaker(kand, t4);
  assert.strictEqual(g4.grupper.length, 0); assert.ok(g4.melding.includes('kunne ikke tolke'));
  // Utgiftstak stopper
  const t5 = f.opoint_kj_lagKiTjeneste(5, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
    fetch: () => ({ status: 429, tekst: JSON.stringify({ error: { message: 'limit', error_code: 'enforced_spend_limit_reached' } }) }) });
  assert.ok(!t5.spor('x', 's', 'a', 400).ok); assert.ok(t5.stoppet.includes('Utgiftstak'));
  assert.ok(!JSON.stringify(anth).includes('HEMMELIG'));

  // Steg 5: ingress ordrett, søkeord i ingress
  assert.strictEqual(f.opoint_kj_ingress(kand[0].doc), 'Hydrogen skip …');
  assert.deepStrictEqual(J(f.opoint_kj_hovedledd('header:ammonia AND (vessel*) ANDNOT (phone*)')), ['ammonia']);
  assert.deepStrictEqual(J(f.opoint_kj_hovedledd('lang:no AND (header:hydrogen* OR header:ammoniakk*) AND (skip*)')), ['hydrogen*', 'ammoniakk*']);
  assert.deepStrictEqual(J(f.opoint_kj_hovedledd('(hydrogen* OR "EU ETS") AND site:64,19526')), ['hydrogen*', 'EU ETS']);
  assert.deepStrictEqual(J(f.opoint_kj_hovedledd('"zero-emission zone" AND (shipping*)')), ['zero-emission zone']);
  assert.strictEqual(f.opoint_kj_ingressHarSokeord(kand[3]), true);
  assert.strictEqual(f.opoint_kj_ingressHarSokeord(kand[1]), true);
  assert.strictEqual(f.opoint_kj_ingressHarSokeord(kand[2]), false);

  // Utdata
  const forb = { kandidater: kand, klient: klient(() => ok([]), 5).kl, oppsett: { merknader: [] }, resultater: [] };
  const rs1 = f.opoint_kj_byggRaderSaker(forb, saker, { oldest: 1, newest: 2 }, ki, d);
  assert.strictEqual(rs1[3][21], 'Min vurdering'); assert.strictEqual(rs1[3][10], 'Antall tilsvarende saker');
  assert.strictEqual(rs1.length, 4 + 3); assert.strictEqual(rs1[4][10], 1); assert.strictEqual(rs1[4][11], 'a.no (3)');
  assert.strictEqual(rs1[4][5], 'Ammonia ship…'); assert.strictEqual(rs1[4][18], ''); // visning: … lagt til
  const iEp = rs1[0].indexOf('I e-posten (høy+middels) per strøm'); assert.strictEqual(rs1[0][iEp + 1], 'A 2, B 1, C 0, D 0'); // HyShip (A+B, høy) og GASS (A, middels)
  const ra = f.opoint_kj_byggRaderAlle(forb, saker, { oldest: 1, newest: 2 }, d);
  assert.strictEqual(ra.length, 3 + 4); assert.strictEqual(ra.filter(r => r[1] === 'JA').length, 3);
  // Punkt 3: ekskluderte vises nederst med Ekskludert? = ja og grunn
  kand[2].ekskludert = true; kand[2].ekskluderGrunn = 'Kildeprioritet nivå 4';
  const ra2 = f.opoint_kj_byggRaderAlle(forb, saker, { oldest: 1, newest: 2 }, d);
  const iEk = ra2[2].indexOf('Ekskludert?'), iGr = ra2[2].indexOf('Ekskluderingsgrunn');
  assert.strictEqual(ra2[ra2.length - 1][iEk], 'ja'); assert.strictEqual(ra2[ra2.length - 1][iGr], 'Kildeprioritet nivå 4');
  assert.strictEqual(ra2[3][iEk], 'nei'); assert.strictEqual(ra2[0][5], 1);
  kand[2].ekskludert = false; kand[2].ekskluderGrunn = '';

  // Punkt 4: ingress-visning og tom ingress
  const vis = t => f.opoint_kj_visIngress(doc({ summary: { text: t } }));
  assert.strictEqual(vis('Ferdig setning.'), 'Ferdig setning.');
  assert.strictEqual(vis('Spørsmål?'), 'Spørsmål?'); assert.strictEqual(vis('Utrop!'), 'Utrop!');
  assert.strictEqual(vis('Avkuttet …'), 'Avkuttet …'); assert.strictEqual(vis('Avkuttet midt i'), 'Avkuttet midt i…');
  assert.strictEqual(vis('Han sa «ja.»'), 'Han sa «ja.»'); assert.strictEqual(vis('He said "yes."'), 'He said "yes."');
  assert.strictEqual(vis('  '), '');
  const tom = { doc: doc({ header: { text: 'Bare tittel' }, summary: { text: '' }, first_source: { sitename: 'Kilde' } }), domene: 'x.no' };
  assert.strictEqual(f.opoint_kj_kiBrukerTekst(tom), 'Overskrift: Bare tittel\nKilde: Kilde');
  const med = { doc: doc({ header: { text: 'T' }, summary: { text: 'Avkuttet midt i' } }), domene: 'x.no' };
  assert.ok(f.opoint_kj_kiBrukerTekst(med).includes('Ingress: Avkuttet midt i\n')); // KI får ordrett, uten tillagt …

  // Verifiseringskontroller
  const kt = f.opoint_kj_kontrollerSak({ type: 'samme', monstre: [{ ord: ['hyship'] }] }, kand);
  assert.strictEqual(kt.status, 'OK');
  const kt2 = f.opoint_kj_kontrollerSak({ type: 'adskilt', monstre: [{ ord: ['kaffe'] }], mot: [{ ord: ['hyship'] }] }, kand);
  assert.strictEqual(kt2.status, 'OK');
  assert.strictEqual(f.opoint_kj_kontrollerSak({ type: 'samme', monstre: [{ ord: ['finnes ikke'] }] }, kand).status, 'IKKE BEVIST');
})();
console.log('Rettelse a–c + steg 3–5-tester OK');
// Intern hjelpefunksjon kjørt alene gir forståelig feil
assert.throws(() => f.opoint_kj_kjorScandasia(undefined, { oldest: 1, newest: 2 }), /intern hjelpefunksjon/);
console.log('Vakt mot direkte kjøring OK');

// ===================== 420-test, tverrbolk-runde, nytt forsøk =====================
(function () {
  const props = { ANTHROPIC_API_KEY: 'sk-HEMMELIG', AI_MODEL: 'claude-haiku-5-5' };
  const lagTj = (svarFn, maks) => {
    const kall = [];
    const t = f.opoint_kj_lagKiTjeneste(maks || 80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
      fetch: body => { kall.push(body); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(body, kall.length) }], usage: { input_tokens: 10, output_tokens: 1 } }) }; } });
    t.kallListe = kall; return t;
  };
  // 320 artikler → 3 bolker; sak X ligger i bolk 1 (indeks 0) og bolk 3 (indeks 310)
  const mange = Array.from({ length: 320 }, (_, i) => ({ doc: doc({ id_article: i, header: { text: (i === 0 || i === 310) ? 'Sak X kunngjort' : 'Tittel ' + i } }),
    ekskludert: false, niva: 3, apen: 'ukjent', domene: 'd' + i + '.no', strommer: ['B'] }));
  const tj = lagTj(body => {
    const u = body.messages[0].content;
    const linjer = u.split('\n');
    const x = linjer.map((l, i) => l.includes('Sak X') ? i + 1 : 0).filter(n => n);
    return JSON.stringify({ grupper: x.length >= 2 ? [x] : [] });
  });
  const g = f.opoint_kj_grupperSaker(mange, tj);
  assert.deepStrictEqual(J(g.grupper.map(gr => gr.slice().sort((a, b) => a - b))), [[0, 310]]);
  assert.strictEqual(tj.kallListe.length, 3 + 3); // 3 bolker + 3 parvise tverrbolk-kall (320 representanter > 300)
  assert.ok(g.melding.includes('slo sammen 1 saker'), g.melding);
  const saker = f.opoint_kj_lagSaker(mange, g);
  assert.strictEqual(saker.length, 319); assert.strictEqual(mange[0].sak, mange[310].sak);
  // Under 150 artikler: ingen tverrbolk-runde
  const tj2 = lagTj(() => '{"grupper": []}');
  f.opoint_kj_grupperSaker(mange.slice(0, 50), tj2);
  assert.strictEqual(tj2.kallListe.length, 1);

  // Nytt forsøk ved parsefeil i gruppering: andre svar er gyldig → reddet
  const tj3 = lagTj((b, n) => n === 1 ? 'beklager' : '{"grupper": [[1, 2]]}');
  const g3 = f.opoint_kj_grupperSaker(mange.slice(0, 5), tj3);
  assert.strictEqual(g3.reddet, 1); assert.deepStrictEqual(J(g3.grupper), [[0, 1]]); assert.ok(g3.melding.includes('reddet'));
  const tj4 = lagTj(() => 'beklager');
  const g4 = f.opoint_kj_grupperSaker(mange.slice(0, 5), tj4);
  assert.strictEqual(tj4.kallListe.length, 6); assert.strictEqual(g4.grupper.length, 0); // 2 for bolken + 2×2 for halvdelene (del 1c)

  // Nytt forsøk ved parsefeil i relevans: reddet og tvil telles
  const kand = [0, 1].map(i => ({ doc: doc({ id_article: i, header: { text: 'Sak ' + i }, summary: { text: 'Ingress ' + i } }),
    ekskludert: false, niva: 3, apen: 'ukjent', domene: 'x' + i + '.no', strommer: ['B'], sporringer: [], soketerm: [], fastNavn: [] }));
  // Første kall (begge saker) kan ikke tolkes; nytt samlet forsøk svarer bare for «Sak 0» (SAK 1)
  const tj5 = lagTj((body, n) => n === 1 ? 'tull' :
    '{"saker": [{"nr": 1, "relevant": true, "kategori": "Annet", "nevner_oss": false, "prioritet": "middels", "irrelevant_grunn": "", "notat": ""}]}');
  const sk = f.opoint_kj_lagSaker(kand, null);
  const ki = f.opoint_kj_vurderSaker(sk, { sokeord: [] }, tj5);
  assert.strictEqual(ki.reddet, 1); assert.strictEqual(ki.tvil, 1);
  assert.strictEqual(sk[0].kiResultat.relevant, true); assert.strictEqual(sk[0].kiResultat.reddet, true);
  assert.strictEqual(f.opoint_kj_kiTekst(sk[1].kiResultat), 'tvil');
  assert.strictEqual(tj5.kallListe.length, 2); // ett samlet kall + ett samlet nytt forsøk
  assert.ok(ki.melding.includes('reddet ved nytt forsøk 1') && ki.melding.includes('tvil 1'));

  // 420-test: D1 treffer i batch 5 og full henting stoppet på kalltaket før D
  const art = f.OPOINT_KJ_T420_ART;
  const a420 = doc({ id_article: 420, id_site: 64, url_common: 'skipsrevyen.no', orig_url: 'https://www.skipsrevyen.no/a', header: { text: art.tittel }, unix_timestamp: 1762345380 });
  const fyll = Array.from({ length: 110 }, (_, i) => doc({ id_article: 1000 + i, id_site: 64, header: { text: 'Annen sak ' + i } }));
  const m = klient(b => {
    const st = b.searchterm;
    if (st.startsWith('header:')) return ok(st.includes('site:64') && st.includes('del 2') ? [] : [a420]);
    const alle = fyll.slice(0, 104).concat([a420]);
    const i0 = b.params.context ? Number(b.params.context) : 0;
    return ok(alle.slice(i0, i0 + 25), i0 + 25 < alle.length ? String(i0 + 25) : '');
  }, 30);
  const u = f.opoint_kj_kjor420Direkte(m.kl, { oldest: 1, newest: 2 }, () => false, { kart: {}, kilder: {} });
  assert.ok(u.id.funnet); assert.ok(u.d1Id.some(x => x.treff));
  assert.strictEqual(u.d1Full[0].posisjon, 105); assert.strictEqual(u.d1Full[0].batch, 5);
  assert.strictEqual(u.sjekk.register, ''); assert.strictEqual(u.sjekk.domene, 'skipsrevyen.no');
  const forb = { klient: { antall: () => 80, maksKall: 80, takNadd: () => true }, kandidater: [],
    resultater: [{ navn: 'D1 del 1/2', strom: 'D', statuser: [], dokumenter: [], contextTom: '', feil: 'Ikke kjørt: kalltaket (80) nådd.', merknad: '' }] };
  const r = f.opoint_kj_byggRader420(u, forb, { oldest: 1, newest: 2 }, m.kl, d);
  assert.ok(r[1][1].includes('batch 5'), r[1][1]);
  assert.ok(r[1][1].includes('ikke kjørt eller avbrutt'), r[1][1]);
  assert.ok(r[1][1].includes('IKKE med i full henting'));
  assert.ok(r.some(x => x[0] === 'Spørringer (status)') === false); // statusdelen heter "5) Full henting" her
})();
console.log('420-test, tverrbolk og nytt forsøk OK');
// Over 400 representanter: bolkene sammenlignes parvis
(function () {
  const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
  const kall = [];
  const tj = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
    fetch: body => { kall.push(body); const l = body.messages[0].content.split('\n'); const x = l.map((t, i) => t.includes('Sak Y') ? i + 1 : 0).filter(n => n);
      return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ grupper: x.length >= 2 ? [x] : [] }) }] }) }; } });
  const mange = Array.from({ length: 450 }, (_, i) => ({ doc: doc({ id_article: i, header: { text: (i === 5 || i === 440) ? 'Sak Y' : 'T ' + i } }),
    ekskludert: false, niva: 3, apen: 'ukjent', domene: 'd' + i + '.no', strommer: ['B'] }));
  const g = f.opoint_kj_grupperSaker(mange, tj);
  assert.deepStrictEqual(J(g.grupper.map(x => x.slice().sort((a, b) => a - b))), [[5, 440]]);
  assert.strictEqual(kall.length, 3 + 3); // 3 bolker + 3 bolkpar
  assert.ok(kall.slice(3).every(b => b.messages[0].content.split('\n').length <= 300));
})();
console.log('Parvis tverrbolk OK');

// ===================== Dedup etter Kildeprioritet, sporing, tak-advarsel =====================
(function () {
  const prio = { kart: f.opoint_kj_prioritetFraRader([['Domene', 'Nivå', 'Åpen'], ['skipsrevyen.no', 1, 'ja'], ['logistikkinside.no', 2, 'ja'],
    ['radioh.no', 3, 'nei'], ['spam.no', 4, '']]), kilder: {} };
  const sr = doc({ id_article: 1, id_site: 64, equalgroup: 777, orig_url: 'https://www.skipsrevyen.no/a', header: { text: '420 millioner til tolv batteridrevne skip og to ladeanlegg' }, unix_timestamp: 300 });
  const li = doc({ id_article: 2, id_site: 338722, equalgroup: 777, orig_url: 'https://logistikkinside.no/b', header: { text: '420 millioner kroner til batteribytte og elektriske bulkskip' }, unix_timestamp: 200 });
  const rh = doc({ id_article: 3, id_site: 9, equalgroup: 777, orig_url: 'https://radioh.no/c', header: { text: 'Hagland Shipping får 236 millioner til batteridrevne skip' }, unix_timestamp: 100 });
  const sp4 = doc({ id_article: 4, id_site: 8, equalgroup: 888, orig_url: 'https://spam.no/x', header: { text: 'Spam' } });
  const ok4 = doc({ id_article: 5, id_site: 7, equalgroup: 888, orig_url: 'https://ukjent.org/x', header: { text: 'Spam omskrevet' } });
  // C kommer før D: Radio H og Logistikk Inside hentes først, Skipsrevyen sist
  const res = [{ strom: 'C', navn: 'C tema-no', searchterm: 'c', dokumenter: [rh, sp4] },
    { strom: 'D', navn: 'D2 del 1/3', searchterm: 'd2', dokumenter: [li] },
    { strom: 'D', navn: 'D1 del 1/2', searchterm: 'd1', dokumenter: [sr, ok4] }];
  const gammel = f.opoint_kj_dedup(res, [], prio, true);
  assert.strictEqual(gammel.length, 2); assert.strictEqual(gammel[0].doc, rh); // første treff vant
  assert.deepStrictEqual(J(gammel.dedupFjernet), { equalgroup: 3, url: 0, identical: 0 });
  const ny = f.opoint_kj_dedup(res, [], prio);
  assert.strictEqual(ny[0].doc, sr); assert.strictEqual(ny[0].domene, 'skipsrevyen.no'); // nivå 1 vinner
  assert.deepStrictEqual(J(ny[0].strommer), ['C', 'D']);
  assert.strictEqual(ny[0].slattSammen.length, 2);
  assert.strictEqual(ny[1].doc, ok4); assert.strictEqual(ny[1].ekskludert, false); // nivå 4 taper mot ukjent (nivå 3)
  const spor = f.opoint_kj_sporDedup(ny, { tittel: 'Hagland Shipping får 236 millioner til batteridrevne skip' });
  assert.strictEqual(spor.status, 'slått sammen (equalgroup)'); assert.strictEqual(spor.k.doc, sr);
  assert.strictEqual(f.opoint_kj_sporDedup(gammel, { tittel: '420 millioner til tolv batteridrevne skip og to ladeanlegg' }).status, 'slått sammen (equalgroup)');
  // Samme nivå: Åpen ja før nei, så tidligst publisert
  const p2 = { kart: f.opoint_kj_prioritetFraRader([['Domene', 'Nivå', 'Åpen'], ['a.no', 2, 'nei'], ['b.no', 2, 'ja'], ['c.no', 2, 'ja']]), kilder: {} };
  const da = doc({ id_article: 1, equalgroup: 1, orig_url: 'https://a.no/1', unix_timestamp: 1 });
  const db = doc({ id_article: 2, equalgroup: 1, orig_url: 'https://b.no/1', unix_timestamp: 50 });
  const dc = doc({ id_article: 3, equalgroup: 1, orig_url: 'https://c.no/1', unix_timestamp: 10 });
  assert.strictEqual(f.opoint_kj_dedup([{ strom: 'B', navn: 'b', searchterm: 'x', dokumenter: [da, db, dc] }], [], p2)[0].doc, dc);
  // URL-dedup telles separat
  const u = f.opoint_kj_dedup([{ strom: 'B', navn: 'b', searchterm: 'x', dokumenter: [doc({ id_article: 1, orig_url: 'https://e.no/1' }), doc({ id_article: 2, orig_url: 'http://www.e.no/1/' })] }], []);
  assert.deepStrictEqual(J(u.dedupFjernet), { equalgroup: 0, url: 1, identical: 0 });

  // Tak-advarsel ved 100 dokumenter
  const m = klient(b => ok(Array.from({ length: 25 }, (_, i) => doc({ id_article: i + 25 * (Number(b.params.context) || 0) })), String((Number(b.params.context) || 0) + 1)), 10);
  const r = f.opoint_kj_hentAlle(m.kl, [{ strom: 'B', navn: 'B stor', searchterm: 'x' }], { oldest: 1, newest: 2 }, () => false);
  assert.strictEqual(r[0].takNadd, true); assert.ok(r[0].merknad.includes('ADVARSEL') && r[0].merknad.includes('100'));
  assert.ok(logg.some(l => l.includes('B stor') && l.includes('ADVARSEL')));
  const m2 = klient(() => ok([doc({})], ''), 10);
  assert.ok(!f.opoint_kj_hentAlle(m2.kl, [{ strom: 'B', navn: 'B liten', searchterm: 'x' }], { oldest: 1, newest: 2 }, () => false)[0].takNadd);

  // Rapportrader
  const forb = { kandidater: ny, resultater: res, klient: { antall: () => 3, takNadd: () => false }, oppsett: { merknader: ['m'] } };
  const rr = f.opoint_kj_byggRaderTestDedup(forb, gammel, { oldest: 1, newest: 2 }, d);
  const i2 = rr.findIndex(x => x[0] === '2) Etter dedup');
  assert.strictEqual(rr[i2 + 1][2], 'slått sammen (equalgroup)'); assert.ok(rr[i2 + 1][3].includes('radioh.no'));
  assert.strictEqual(rr[i2 + 1][4], 'beholdt');
  assert.ok(rr.some(x => x[1] === 'Skipsrevyen' && x[4] === 777 && x[5] === 64));
})();
console.log('Dedup etter Kildeprioritet OK');

// ===================== Del 1: identical_documents, range_count, kontroller =====================
(function () {
  const prio = { kart: f.opoint_kj_prioritetFraRader([['Domene', 'Nivå', 'Åpen'], ['kommunikasjon.ntb.no', 1, 'ja'], ['skipsrevyen.no', 1, 'ja']]), kilder: {} };
  const ntb = doc({ id_article: 9, id_site: 5, equalgroup: 8429116321, orig_url: 'https://kommunikasjon.ntb.no/pressemelding/420', header: { text: '420 millioner til 12 batteridrevne skip og to ladeanlegg' }, unix_timestamp: 100 });
  const sr = doc({ id_article: 1, id_site: 64, equalgroup: 8429116321, orig_url: 'https://www.skipsrevyen.no/a', header: { text: '420 millioner til tolv batteridrevne skip og to ladeanlegg' }, unix_timestamp: 300,
    identical_documents: { cnt: 1, document: [ntb] } });
  const res = [{ strom: 'D', navn: 'D1 del 1/2', searchterm: 'd1', dokumenter: [sr] }];
  // Før (uten utvidelse): NTB er usynlig, Skipsrevyen beholdes
  const for_ = f.opoint_kj_dedup(res, [], prio, false, true);
  assert.strictEqual(for_.length, 1); assert.strictEqual(for_[0].doc, sr); assert.strictEqual(for_.dedupFjernet.identical, 0);
  // Etter: NTB er med i valget og vinner (samme nivå og Åpen, tidligere publisert)
  const etter = f.opoint_kj_dedup(res, [], prio);
  assert.strictEqual(etter.length, 1); assert.strictEqual(etter[0].doc, ntb); assert.strictEqual(etter[0].domene, 'kommunikasjon.ntb.no');
  assert.strictEqual(etter.dedupFjernet.identical, 1); assert.strictEqual(etter.identiskeUtvidet, 1);
  assert.strictEqual(etter[0].slattSammen[0].doc, sr);
  // Identical uten equalgroup slås likevel inn i samme kandidat
  const x = doc({ id_article: 7, orig_url: 'https://z.no/1', header: { text: 'Kopi' } });
  const hoved = doc({ id_article: 6, orig_url: 'https://y.no/1', header: { text: 'Hoved' }, identical_documents: { cnt: 1, document: [x] } });
  const k2 = f.opoint_kj_dedup([{ strom: 'B', navn: 'b', searchterm: 'b', dokumenter: [hoved] }], []);
  assert.strictEqual(k2.length, 1); assert.strictEqual(k2[0].slattSammen.length, 1);
  // Sporing: NTB skilles fra Skipsrevyen på domene
  const artNtb = f.OPOINT_KJ_TDEDUP_ARTIKLER[1], artSr = f.OPOINT_KJ_TDEDUP_ARTIKLER[0];
  assert.strictEqual(f.opoint_kj_erArtikkel(ntb, artSr), false); assert.strictEqual(f.opoint_kj_erArtikkel(ntb, artNtb), true);
  assert.strictEqual(f.opoint_kj_sporDedup(for_, artNtb).status, 'ikke funnet');
  assert.strictEqual(f.opoint_kj_sporDedup(etter, artNtb).status, 'beholdt');
  assert.strictEqual(f.opoint_kj_sporDedup(etter, artSr).status, 'slått sammen (identical)');
  const forb = { kandidater: etter, resultater: res, klient: { antall: () => 1, takNadd: () => false }, oppsett: { merknader: [] } };
  const rr = f.opoint_kj_byggRaderTestDedup(forb, for_, { oldest: 1, newest: 2 }, d);
  assert.ok(rr.some(r => r[1] === 'NTB' && String(r[3]).startsWith('i identical_documents')));
  assert.ok(rr[0].includes('Før: fjernet av dedup') && rr[0].includes('Etter: identical_documents utvidet'));

  // 1b range_count
  const rc = f.opoint_kj_byggRaderRangeCount([
    { navn: 'B ammonia', rangeCount: [12], dokumenter: [doc({ identical_documents: { cnt: 2, document: [] } }), doc({ id_article: 2, identical_documents: { cnt: 0 } })], contextTom: true, batcher: 1, feil: '' },
    { navn: 'D1 del 1/2', rangeCount: [5], dokumenter: [doc({ identical_documents: { cnt: 3 } })], contextTom: true, batcher: 1, feil: '' },
    { navn: 'B battery/electric', rangeCount: [300, 300], dokumenter: Array.from({ length: 50 }, () => doc({})), contextTom: false, batcher: 2, feil: '' }
  ], { oldest: 1, newest: 2 }, klient(() => ok([]), 1).kl, d);
  assert.strictEqual(rc[4][6], 'NEI (differanse 8)'); assert.strictEqual(rc[4][5], 4);
  assert.strictEqual(rc[5][6], 'NEI (differanse 1)');
  assert.ok(rc[6][6].includes('ikke alle hentet'));

  // 1d kontroller: domenebegrensning og felles liste i begge vinduer
  const kand = [
    { doc: doc({ header: { text: 'SEA-LNG: EU ETS gives LNG an edge' } }), domene: 'safety4sea.com', sak: 'S1', ekskludert: false },
    { doc: doc({ header: { text: 'EU ETS and LNG – SEA-LNG view' } }), domene: 'www.cleanshippinginternational.com'.replace('www.', ''), sak: 'S1', ekskludert: false },
    { doc: doc({ header: { text: 'EU ETS update' } }), domene: 'annen.no', sak: 'S9', ekskludert: false }
  ];
  const kSea = f.OPOINT_KJ_SAKER_KONTROLLER.find(k => k.navn.startsWith('SEA-LNG'));
  assert.strictEqual(f.opoint_kj_kontrollerSak(kSea, kand, '17-18').status, 'OK'); // annen.no telles ikke
  assert.strictEqual(f.opoint_kj_kontrollerSak(kSea, kand, '3-10').status, 'utenfor vindu');
  assert.ok(f.OPOINT_KJ_SAKER1_KONTROLLER.every(k => k && k.navn && k.vindu && k.monstre.length));
})();
console.log('Del 1-tester OK');

// ===================== Tillegg 2–4 og del 2–4 =====================
(function () {
  const dd = Object.assign({}, d, { dagTekst: x => x.toISOString().slice(0, 10) });
  const props = { ANTHROPIC_API_KEY: 'sk-HEMMELIG', AI_MODEL: 'claude-haiku-5-5', TEST_EPOST: 'test@eksempel.no' };
  const lagTj = (svarFn, maks) => {
    const kall = [], runder = [];
    const t = f.opoint_kj_lagKiTjeneste(maks || 80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
      fetchMange: bodies => { runder.push(bodies.length); return bodies.map(b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }], usage: { input_tokens: 100, output_tokens: 10 } }) }; }); } });
    t.kallListe = kall; t.runder = runder; return t;
  };
  const prio = { kart: f.opoint_kj_prioritetFraRader([['Domene', 'Nivå', 'Åpen'], ['kommunikasjon.ntb.no', 1, 'ja'], ['skipsrevyen.no', 1, 'ja'], ['logistikkinside.no', 2, 'ja']]), kilder: {} };

  // Tillegg 2: andre kilder teller sammenslåtte (identical_documents) med nivå
  const sr = doc({ id_article: 1, equalgroup: 5, orig_url: 'https://www.skipsrevyen.no/a', header: { text: '420 millioner til tolv batteridrevne skip' }, unix_timestamp: 300, language: { text: 'no' } });
  const ntb = doc({ id_article: 2, equalgroup: 5, orig_url: 'https://kommunikasjon.ntb.no/p', header: { text: '420 millioner til 12 batteridrevne skip' }, unix_timestamp: 100, language: { text: 'no' } });
  sr.identical_documents = { cnt: 1, document: [ntb] };
  const li = doc({ id_article: 3, orig_url: 'https://logistikkinside.no/b', header: { text: '420 millioner kroner til batteribytte' }, unix_timestamp: 200, language: { text: 'no' } });
  const kand = f.opoint_kj_dedup([{ strom: 'D', navn: 'D1', searchterm: 'd', dokumenter: [sr, li] }], [], prio);
  f.opoint_kj_settNivaer(kand, prio);
  const saker = f.opoint_kj_lagSaker(kand, { grupper: [[0, 1]] });
  assert.strictEqual(saker.length, 1); assert.strictEqual(saker[0].representant.domene, 'kommunikasjon.ntb.no');
  assert.strictEqual(saker[0].antallTilsvarende, 2); // Skipsrevyen (slått inn) + Logistikk Inside (medlem)
  assert.strictEqual(saker[0].andreKilder, 'skipsrevyen.no (1), logistikkinside.no (2)');

  // Del 2: språk – saken får representant med tillatt språk; ellers ekskludert
  const de = doc({ id_article: 10, orig_url: 'https://a.de/1', header: { text: 'Deutsch' }, language: { text: 'de' }, unix_timestamp: 1 });
  const en = doc({ id_article: 11, orig_url: 'https://b.com/1', header: { text: 'English' }, language: { text: 'en' }, unix_timestamp: 9 });
  const ja = doc({ id_article: 12, orig_url: 'https://c.jp/1', header: { text: 'Japansk' }, language: { text: 'ja' } });
  const k2 = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [de, en, ja] }], []);
  const s2 = f.opoint_kj_lagSaker(k2, { grupper: [[0, 1]] });
  assert.strictEqual(s2[0].representant.doc, en); assert.strictEqual(s2[0].sprakEkskludert, '');
  assert.strictEqual(s2[1].sprakEkskludert, 'ja'); assert.strictEqual(k2[2].sprakEkskludert, 'ja');
  const tjS = lagTj(() => '{"relevant": true, "kategori": "Annet", "nevner_oss": false, "prioritet": "høy", "irrelevant_grunn": "", "notat": ""}');
  const kiS = f.opoint_kj_vurderSaker(s2, { sokeord: [] }, tjS, 1);
  assert.strictEqual(tjS.kallListe.length, 1); // ingen KI for den japanske saken
  assert.ok(s2[1].kiResultat.kilde.includes('Ekskludert: språk'));
  const forbS = { kandidater: k2, resultater: [], klient: { antall: () => 0, maksKall: 80, takNadd: () => false }, oppsett: { merknader: [] } };
  const rS = f.opoint_kj_byggRaderSaker(forbS, s2, { oldest: 1, newest: 2 }, kiS, d);
  assert.strictEqual(rS.length, 4 + 1); // språk-ekskludert sak vises ikke i saksfanen
  assert.strictEqual(rS[0][rS[0].indexOf('Ekskludert: språk (artikler per språk)') + 1], 'ja: 1');
  const aS = f.opoint_kj_byggRaderAlle(forbS, s2, { oldest: 1, newest: 2 }, d);
  const iGr = aS[2].indexOf('Ekskluderingsgrunn');
  assert.strictEqual(aS[aS.length - 1][iGr], 'Ekskludert: språk (ja)'); assert.strictEqual(aS[aS.length - 1][12], 'ja');

  // Del 3: prioritet tolkes; ugyldig → middels; parallelle kall i runder på 5; ett kall holdes av
  assert.strictEqual(f.opoint_kj_tolkRelevans('{"relevant": true, "kategori": "x", "prioritet": "Høy"}').prioritet, 'høy');
  assert.strictEqual(f.opoint_kj_tolkRelevans('{"relevant": true, "kategori": "x"}').prioritetUgyldig, true);
  assert.ok(f.opoint_kj_kiSystem().includes('"prioritet"') && f.opoint_kj_kiSystem().includes('minst 100 mill. USD'));
  const mange = Array.from({ length: 12 }, (_, i) => doc({ id_article: 100 + i, orig_url: 'https://m.no/' + i, header: { text: 'Sak ' + i }, language: { text: 'no' } }));
  const k3 = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: mange }], []);
  const s3 = f.opoint_kj_lagSaker(k3, null);
  const perSak = (b, f2) => { const bl = b.messages[0].content.split(/SAK (\d+)\n/).slice(1), sk = [];
    for (let i = 0; i < bl.length; i += 2) sk.push(f2(Number(bl[i]), bl[i + 1])); return JSON.stringify({ saker: sk }); };
  // Kalltak 2, 1 holdt av → ett kall med 8 saker; 4 saker igjen
  const tj3 = lagTj(b => perSak(b, (nr, t) => t.includes('Sak 3') ? { nr, relevant: true, kategori: 'Annet' } :
    { nr, relevant: true, kategori: 'Annet', prioritet: 'middels' }), 2);
  const ki3 = f.opoint_kj_vurderSaker(s3, { sokeord: [] }, tj3, 1);
  assert.deepStrictEqual(J(tj3.runder), [1]); assert.strictEqual(tj3.kallListe[0].messages[0].content.split('SAK ').length - 1, 8);
  assert.strictEqual(ki3.ikkeVurdert, 4); assert.strictEqual(ki3.ferdig, false);
  assert.ok(s3[3].kiResultat.kilde.includes('prioritet manglet → middels')); assert.strictEqual(s3[3].kiResultat.prioritet, 'middels');

  // Del 3: sammendrag – inndata bare middels, maks 5 setninger/120 ord, lenke per setning, nytt forsøk
  s3.forEach((s, i) => { s.kiResultat = { relevant: true, prioritet: i < 2 ? 'høy' : (i < 8 ? 'middels' : 'lav') }; });
  const inn = f.opoint_kj_sammendragInndata(s3);
  assert.strictEqual(inn.length, 6); assert.strictEqual(inn[0].nr, 1);
  const lang = Array.from({ length: 7 }, (_, i) => ({ tekst: 'Setning ' + i + ' ' + 'ord '.repeat(i === 4 ? 100 : 5).trim() + '.', sak: i + 1 }));
  const tolket = f.opoint_kj_tolkSammendrag(JSON.stringify({ setninger: lang.concat([{ tekst: 'Feil nr', sak: 99 }]) }), inn);
  assert.ok(tolket.length <= 5); assert.ok(tolket.reduce((a, x) => a + x.tekst.split(' ').length, 0) <= 120);
  assert.ok(tolket.every(x => x.url.startsWith('https://m.no/')));
  const tjSm = lagTj((b, n) => n === 1 ? 'beklager' : JSON.stringify({ setninger: [{ tekst: 'Noe skjedde.', sak: 2 }] }));
  const sm = f.opoint_kj_lagSammendrag(s3, tjSm);
  assert.strictEqual(sm.reddet, 1); assert.strictEqual(sm.setninger.length, 1); assert.ok(tjSm.kallListe.every(b => b.max_tokens === 600));
  assert.strictEqual(f.opoint_kj_lagSammendrag(s3.slice(0, 2), lagTj(() => '{}')).melding, 'Ingen middels-saker – ingen seksjon.');
  const rSm = f.opoint_kj_byggRaderSammendrag(sm);
  assert.ok(rSm.some(r => r[0] === 'Inndata') && rSm.some(r => r[3] === 'Noe skjedde.'));

  // Del 4: dagens e-post (samme dato som vinduets slutt)
  const vindu = { oldest: Date.UTC(2026, 10, 18, 6, 30) / 1000, newest: Date.UTC(2026, 10, 19, 6, 30) / 1000 };
  const apps = { rader: [{ kilde: 'Sendte artikler', tid: Date.UTC(2026, 10, 19, 6, 31), norm: 'm.no/0', tittel: 'x' },
    { kilde: 'Sendte artikler', tid: Date.UTC(2026, 10, 18, 6, 31), norm: 'm.no/1', tittel: 'y' }] };
  assert.strictEqual(f.opoint_kj_settDagensEpost(s3, apps, vindu, dd.dagTekst), 1);
  assert.strictEqual(s3[0].iDagensEpost, true); assert.strictEqual(s3[1].iDagensEpost, false);

  // Del 5: e-post med originalens byggEpostHtmlMerkevare (11_EpostMerkevare.gs lastes)
  ctx.Utilities = Object.assign({}, ctx.Utilities || {}, { formatDate: () => 'torsdag 19. november 2026' });
  ['01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs'].forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
  s3.forEach(s => { s.representant.fastNavn = s.representant.fastNavn || []; });
  s3[0].kiResultat.kategori = 'Energi og framdrift'; s3[0].representant.doc.summary = { text: 'Ingen punktum' };
  s3[0].representant.soketerm = ['header:ammonia AND (vessel*)'];
  s3[1].kiResultat.kategori = 'Annet'; s3[1].representant.doc.summary = { text: '' }; s3[1].fastRelevant = true; s3[1].kiResultat.nevnerOss = true;
  s3[0].andreKilderListe = Array.from({ length: 7 }, (_, i) => ({ domene: 'k' + i + '.no', niva: 1 }));
  s3[2].kiResultat = { relevant: false, prioritet: 'lav', kategori: 'Annet', irrelevantGrunn: 'Ikke maritimt' };
  s3[4].oppfolging = true; s3[4].kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Annet' };
  s3[5].omtaltTidligere = 'KI: «x»';
  const st = { ingenNorske: true };
  const ep = f.opoint_kj_byggEpost(s3, sm, vindu, String, true, st, [{ navn: 'q1', feil: '' }, { navn: 'q2', feil: 'x' }]);
  assert.ok(ep.html.includes('Dagens medietreff.') && ep.html.includes('cid:logo')); // originalens topp
  assert.ok(ep.html.includes('Les saken →') && ep.html.includes('Søkeord: ammonia')); // originalens kort
  assert.ok(ep.html.includes('Om oss') && ep.html.includes('Nevner oss')); // eget navn
  assert.ok(ep.html.includes('Ingen punktum…')); assert.ok(ep.html.includes('Andre kilder (7): k0.no, k1.no, k2.no, k3.no, k4.no +2'));
  assert.ok(ep.html.includes('Også i dagens e-post'));
  assert.ok(ep.html.includes('Ellers i bransjen') && ep.html.includes('<a href="https://m.no/3"'));
  assert.ok(ep.html.includes('Mulig irrelevant</div>') && ep.html.indexOf('Ellers i bransjen') < ep.html.indexOf('Mulig irrelevant</div>'));
  assert.ok(ep.html.includes('Ikke maritimt'));
  assert.ok(ep.html.includes('4 øvrige treff i arkfanen.')); assert.ok(ep.html.includes('Ingen nye norskspråklige treff.'));
  assert.ok(ep.html.includes('Denne e-posten sendes automatisk')); // originalens bunntekst
  assert.ok(ep.html.includes('1 av 2 kilder hentet OK'));
  assert.ok(!ep.html.includes('Sak 4')); // oppfølging er ikke med
  assert.strictEqual(ep.antallHoy, 2); assert.ok(!ep.html.includes('Sak 9')); // lav vises ikke
  assert.ok(ep.tekst.includes('== Ellers i bransjen ==') && ep.tekst.includes('4 øvrige treff i arkfanen.'));
  const ep2 = f.opoint_kj_byggEpost(s3.slice(0, 2), { setninger: [], inndata: [] }, vindu, String, false, { ingenNorske: false }, []);
  assert.ok(!ep2.html.includes('Ellers i bransjen') && !ep2.html.includes('øvrige treff') && !ep2.html.includes('norskspråklige'));

  // Del 4: lagring og sending bare til TEST_EPOST
  const sendt = [], filer = [];
  ctx.DriveApp = { createFile: (n, h) => { filer.push(n); return { getUrl: () => 'https://drive/fil' }; } };
  ctx.MimeType = { HTML: 'text/html' };
  ctx.GmailApp = { sendEmail: (til, emne) => sendt.push([til, emne]) };
  ctx.hentLogoBlob = () => ({ blob: null });
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: n => props[n] }) };
  const r1 = f.opoint_kj_lagreOgSend(ep, vindu, String);
  assert.strictEqual(r1.driveUrl, 'https://drive/fil'); assert.deepStrictEqual(sendt.map(x => x[0]), ['test@eksempel.no']);
  assert.ok(sendt[0][1].startsWith('[Opoint-test]'));
  delete props.TEST_EPOST;
  const r2 = f.opoint_kj_lagreOgSend(ep, vindu, String);
  assert.ok(r2.melding.includes('TEST_EPOST mangler')); assert.strictEqual(sendt.length, 1);
  props.TEST_EPOST = 'test@eksempel.no';

  // Tillegg 3: kontroller ser også sammenslåtte dokumenter; utenfor vindu
  const k420 = f.OPOINT_KJ_SAKER_KONTROLLER.find(k => k.navn.startsWith('420'));
  const rh = { doc: doc({ id_article: 4, header: { text: 'Hagland Shipping får 236 millioner til batteridrevne skip' } }), domene: 'radioh.no', sak: 'S1', ekskludert: false, slattSammen: [] };
  const kk = kand.concat([rh]);
  const r420 = f.opoint_kj_kontrollerSak(k420, kk, '3-10');
  assert.strictEqual(r420.status, 'OK'); assert.ok(r420.detalj.includes('skipsrevyen.no [S1, slått inn]'));
  assert.strictEqual(f.opoint_kj_kontrollerSak(k420, kk, '17-18').status, 'utenfor vindu');
  const kLaur = f.OPOINT_KJ_SAKER_KONTROLLER.find(k => k.navn.startsWith('Lauritzen'));
  const laur = [{ doc: doc({ header: { text: 'J. Lauritzen takes delivery of methanol dual-fuel bulker' } }), domene: 'a.com', sak: 'S5', ekskludert: false },
    { doc: doc({ header: { text: 'Brave Bulker named in Japan' } }), domene: 'b.com', sak: 'S6', ekskludert: false }];
  assert.strictEqual(f.opoint_kj_kontrollerSak(kLaur, laur, '17-18').status, 'FEIL');

  // Tillegg 4: valgte saker listes med alle medlemmer og sammenslåtte
  const forbV = { kandidater: kand, resultater: [], klient: { antall: () => 0 }, oppsett: { merknader: [] } };
  const rv = f.opoint_kj_byggRaderTestSaker(forbV, saker, { melding: 'ok' }, { kall: 1, fraBuffer: 0, kostnad: 0, modell: 'm' },
    [], { oldest: 1, newest: 2 }, d, '3-10', ['S1', 'S211']);
  assert.ok(rv.some(r => r[0] === 'S1' && String(r[8]).startsWith('slått inn (identical)')));
  assert.ok(rv.some(r => r[0] === 'S211' && r[1] === '(finnes ikke i denne kjøringen)'));
})();
console.log('Tillegg 2–4 og del 2–4 OK');

// ===================== DEL 1: KI-feil =====================
(function () {
  const props = { ANTHROPIC_API_KEY: 'sk-HEMMELIG', AI_MODEL: 'claude-haiku-5-5' };
  const lagTj = (svarFn, opts) => {
    const kall = [];
    const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: (opts && opts.cache) || null, hash: x => x,
      fetchMange: bodies => bodies.map(b => { kall.push(b); const r = svarFn(b, kall.length);
        return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: r.t }], stop_reason: r.s || 'end_turn', usage: { input_tokens: 111, output_tokens: 22 } }) }; }),
      fetch: b => { kall.push(b); const r = svarFn(b, kall.length);
        return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: r.t }], stop_reason: r.s || 'end_turn', usage: { input_tokens: 111, output_tokens: 22 } }) }; } });
    t.kallListe = kall; return t;
  };
  // 1b: robust tolking
  assert.strictEqual(f.opoint_kj_parseJson('{"relevant": false, "irrelevant_grunn": "Om "Viking" cruise"}').irrelevant_grunn, 'Om "Viking" cruise');
  assert.strictEqual(f.opoint_kj_parseJson('```json\n{"a": 1}\n```').a, 1);
  assert.strictEqual(f.opoint_kj_parseJson('Svar: {"a": "linje\nto"} takk').a, 'linje\nto');
  assert.strictEqual(f.opoint_kj_parseJson('{"grupper": [[1, 2], [3'), null);
  assert.ok(f.opoint_kj_kiSystem().includes('Bruk aldri doble anførselstegn'));

  // 1a: metadata og logging; relevans avkortet → nytt forsøk med dobbel max_tokens
  const docs = [0, 1].map(i => doc({ id_article: i, orig_url: 'https://n.no/' + i, header: { text: 'Sak ' + i }, language: { text: 'no' } }));
  const k = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: docs }], []);
  const saker = f.opoint_kj_lagSaker(k, null);
  // Begge sakene i ett kall (max_tokens 150·2 + 250 = 550); avkortet → nytt forsøk med dobbel grense (1100)
  const tj = lagTj((b, n) => {
    if (b.max_tokens === 550) return { t: '{"saker": [{"nr": 1, "relevant": true, "kategori": "Annet", "notat": "kuttet midt', s: 'max_tokens' };
    return { t: '{"saker": [{"nr": 1, "relevant": true, "kategori": "Annet", "prioritet": "middels", "notat": ""}, ' +
      '{"nr": 2, "relevant": true, "kategori": "Annet", "prioritet": "lav", "notat": ""}]}' };
  });
  const ki = f.opoint_kj_vurderSaker(saker, { sokeord: [] }, tj, 1);
  assert.strictEqual(ki.reddet, 2); assert.strictEqual(tj.kiFeil.length, 1);
  const fe = tj.kiFeil[0];
  assert.ok(fe.kall.startsWith('relevans/prioritet')); assert.strictEqual(fe.stopReason, 'max_tokens');
  assert.strictEqual(fe.inputTokens, 111); assert.strictEqual(fe.outputTokens, 22); assert.strictEqual(fe.maxTokens, 550);
  assert.ok(fe.raa.includes('kuttet midt'));
  assert.ok(tj.kallListe.some(b => b.max_tokens === 1100));
  const rader = f.opoint_kj_kiFeilRader([Object.assign({}, fe, { raa: 'x'.repeat(60000) })]);
  assert.ok(rader[0][8].length < 50000 && rader[0][8].includes('[kuttet, 60000 tegn]')); assert.strictEqual(rader[0].length, 9);

  // Gruppering: avkortet svar → ikke nytt likt forsøk, men oppdeling i to
  const mange = Array.from({ length: 6 }, (_, i) => ({ doc: doc({ id_article: i, header: { text: 'T' + i } }), ekskludert: false, niva: 3, apen: 'ukjent', domene: 'd' + i + '.no', strommer: ['B'] }));
  const tg = lagTj((b) => {
    const n = b.messages[0].content.split('\n').length;
    return n === 6 ? { t: '{"grupper": [[1, 2], [3', s: 'max_tokens' } : { t: '{"grupper": [[1, 2]]}' };
  });
  const g = f.opoint_kj_grupperSaker(mange, tg);
  assert.strictEqual(tg.kallListe.length, 3); // hel bolk (avkortet) + to halvdeler, ingen likt nytt forsøk
  assert.deepStrictEqual(J(g.grupper), [[0, 1], [3, 4]]);
  assert.ok(g.melding.includes('delt i to (2 av 2 deler gruppert)'));
  assert.strictEqual(tg.kiFeil.length, 1); assert.ok(tg.kiFeil[0].kall.startsWith('gruppering'));

  // Sammendrag: parsefeil to ganger → logget to ganger, e-post uten seksjonen
  const s3 = [0, 1].map(i => ({ id: 'S' + i, sprakEkskludert: '', kiResultat: { relevant: true, prioritet: 'middels' }, representant: { doc: doc({ id_article: i, orig_url: 'https://m.no/' + i }) } }));
  const ts = lagTj(() => ({ t: 'Beklager, jeg kan ikke.' }));
  const sm = f.opoint_kj_lagSammendrag(s3, ts);
  assert.strictEqual(sm.setninger.length, 0); assert.ok(sm.melding.includes('uten «Ellers i bransjen»'));
  assert.strictEqual(ts.kiFeil.length, 2); assert.strictEqual(ts.kiFeil[1].forsok, 2);

  // Buffer lagrer metadata; eldre buffer (ren tekst) tåles
  const buf = {}; const cache = { get: k2 => buf[k2] || null, put: (k2, v) => { buf[k2] = v; } };
  const tb = lagTj(() => ({ t: '{"ok": 1}', s: 'end_turn' }), { cache });
  tb.spor('x', 'sys', 'a', 400);
  const r2 = tb.spor('x', 'sys', 'a', 400);
  assert.strictEqual(r2.fraBuffer, true); assert.strictEqual(r2.stopReason, 'end_turn'); assert.strictEqual(r2.inputTokens, 111);
  buf['opk:y:claude-haiku-5-5:sys\nb'] = '{"ok": 2}';
  const r3 = tb.spor('y', 'sys', 'b', 400);
  assert.strictEqual(r3.tekst, '{"ok": 2}'); assert.strictEqual(r3.stopReason, '');
})();
console.log('DEL 1 KI-feil OK');

// ===================== DEL 3d–e, 4, rapport, recall =====================
(function () {
  const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
  const lagTj = (svarFn) => { const kall = []; const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
    fetch: b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; } }); t.kallListe = kall; return t; };
  const vindu = { oldest: 1000, newest: 2000 };
  // 3d Oppfølging: identical_documents med eldre publisering
  const gammel = doc({ id_article: 9, unix_timestamp: 500, orig_url: 'https://old.no/1' });
  const ny = doc({ id_article: 1, unix_timestamp: 1500, orig_url: 'https://a.no/1', language: { text: 'no' }, identical_documents: { cnt: 1, document: [gammel] } });
  const ny2 = doc({ id_article: 2, unix_timestamp: 1600, orig_url: 'https://b.no/1', language: { text: 'no' }, header: { text: 'NYK ammonia gas carrier ordered' } });
  const k = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [ny, ny2] }], []);
  const saker = f.opoint_kj_lagSaker(k, null);
  assert.strictEqual(f.opoint_kj_settOppfolging(saker, vindu), 1);
  assert.strictEqual(saker[0].oppfolging, true); assert.strictEqual(saker[0].tidligst, 500); assert.strictEqual(saker[1].oppfolging, false);
  // 3e Omtalt tidligere: URL først, så KI
  const sendte = [{ tid: 900, norm: 'x.no/1', url: 'https://x.no/1', tittel: 'NYK bestiller ammoniakkgasstanker' }];
  const tj = lagTj(() => '{"treff": [{"ny": 1, "tidligere": "T1"}]}');
  const om = f.opoint_kj_settOmtaltTidligere(saker, sendte, tj);
  assert.strictEqual(om.ki, 1); assert.ok(saker[1].omtaltTidligere.startsWith('KI:')); assert.strictEqual(saker[0].omtaltTidligere, undefined);
  assert.ok(tj.kallListe[0].messages[0].content.includes('TIDLIGERE:\nT1 NYK bestiller'));
  const urlSendte = [{ tid: 900, norm: 'b.no/1', url: 'https://b.no/1', tittel: 'Samme URL' }];
  const tj2 = lagTj(() => '{"treff": []}');
  const om2 = f.opoint_kj_settOmtaltTidligere(saker, urlSendte, tj2);
  assert.strictEqual(om2.url, 1); assert.strictEqual(tj2.kallListe.length, 0); // ingen saker igjen for KI
  // Oppfølging-saker får ingen KI
  const tj3 = lagTj(b => JSON.stringify({ saker: [{ nr: 1, relevant: true, kategori: 'Annet', prioritet: 'høy', prioritet_grunn: 'Stor ordre' }] }));
  f.opoint_kj_vurderSaker(saker, { sokeord: [] }, tj3, 0, vindu);
  assert.strictEqual(tj3.kallListe.length, 1); assert.ok(!tj3.kallListe[0].messages[0].content.includes('SAK 2'));
  assert.ok(saker[0].kiResultat.kilde.startsWith('Oppfølging')); assert.strictEqual(saker[1].kiResultat.prioritetGrunn, 'Stor ordre');

  // DEL 4: NZF-regel til og med 4. des 2026
  const nov = { oldest: Date.UTC(2026, 10, 18) / 1000, newest: Date.UTC(2026, 10, 19) / 1000 };
  const des = { oldest: Date.UTC(2026, 11, 6) / 1000, newest: Date.UTC(2026, 11, 7) / 1000 };
  assert.ok(f.opoint_kj_kiSystem(nov).includes('MEPC 85') && !f.opoint_kj_kiSystem(des).includes('MEPC 85'));
  assert.ok(f.opoint_kj_kiSystem(nov).includes('"prioritet_grunn"'));
  assert.strictEqual(f.opoint_kj_tolkRelevansFlere('{"saker": [{"nr": 2, "relevant": false, "irrelevant_grunn": "x"}]}', 2)[2].prioritet, '');
  // Fast relevant: høy med begrunnelse
  const fa = { id: 'S1', medlemmer: [{ fastNavn: ['LOWNOISER'] }], fastRelevant: true, representant: { doc: doc({}), domene: 'a.no' }, strommer: ['A'] };
  f.opoint_kj_vurderSaker([fa], { sokeord: [{ sokeord: 'LOWNOISER', kategori: 'Prosjekter' }] }, lagTj(() => '{}'), 0, nov);
  assert.strictEqual(fa.kiResultat.prioritet, 'høy'); assert.ok(fa.kiResultat.prioritetGrunn.includes('LOWNOISER'));

  // DEL 2b: nye ANDNOT-ord
  ['CAGR', '"market size"', '"market share"', 'mAh', 'megapixel*'].forEach(o => assert.ok(f.OPOINT_B_ANDNOT_ORD.includes(o), o));

  // Rapport: strøm A-treff (også ekskluderte) og NZF-klyngen
  const ka = f.opoint_kj_dedup([{ strom: 'A', navn: 'A LOWNOISER', searchterm: 'LOWNOISER', dokumenter: [
    doc({ id_article: 1, orig_url: 'https://c.de/1', header: { text: 'LowNoiser Forschungsprojekt' }, language: { text: 'de' } }),
    doc({ id_article: 2, orig_url: 'https://e.com/1', header: { text: 'Advances in the EU LowNoiser project' }, language: { text: 'en' } })] },
    { strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 3, orig_url: 'https://n.com/1', header: { text: 'IMO Net-Zero Framework vote' }, language: { text: 'en' } })] }], []);
  const sa = f.opoint_kj_lagSaker(ka, null);
  sa[1].kiResultat = { relevant: true, prioritet: 'høy' }; sa[2].kiResultat = { relevant: true, prioritet: 'høy', prioritetGrunn: 'NZF' };
  const rr = f.opoint_kj_byggRaderRapport({ kandidater: ka }, sa, d);
  assert.ok(rr.some(r => r[1] === 'LowNoiser Forschungsprojekt' && r[4] === 'Ekskludert: språk (de)'));
  assert.ok(rr.some(r => r[1] === 'Advances in the EU LowNoiser project' && r[4] === 'I e-posten (høy)'));
  assert.ok(rr.some(r => r[0] === sa[2].id && r[1] === 'høy' && r[2] === 'NZF'));

  // DEL 7: recall – funnet, ikke funnet med årsak, og sammenslåing av vinduer
  const kr = f.opoint_kj_dedup([{ strom: 'D', navn: 'D1 del 1/2', searchterm: 'd', dokumenter: [
    doc({ id_article: 1, orig_url: 'https://www.radioh.no/a', url_common: 'radioh.no', header: { text: '15 ferjeladere på Haugalandet' }, language: { text: 'no' } })] }], []);
  const sr = f.opoint_kj_lagSaker(kr, null);
  sr[0].kiResultat = { relevant: true, prioritet: 'høy' };
  const forb = { kandidater: kr, resultater: [{ takNadd: false }], prio: { kart: {}, kilder: {} } };
  const fasit = f.OPOINT_KJ_RECALL_FASIT['17'].saker;
  const m = klient(b => b.searchterm.includes('cimac') ? ok([doc({ id_article: 7, orig_url: 'https://www.marinelink.com/x', header: { text: 'CIMAC calls for global IMO NZF' }, summary: { text: 'Market size grows' }, language: { text: 'en' } })]) : ok([]), 20);
  const rFerje = f.opoint_kj_recallEn(fasit[1], forb, sr, m.kl, { oldest: 1, newest: 2 }, () => false, '17');
  assert.strictEqual(rFerje[3], 'ja'); assert.strictEqual(rFerje[4], 'I e-posten (høy)'); assert.strictEqual(rFerje[5], 'D');
  const rCimac = f.opoint_kj_recallEn(fasit[6], forb, sr, m.kl, { oldest: 1, newest: 2 }, () => false, '17');
  assert.strictEqual(rCimac[3], 'nei'); assert.ok(rCimac[9].includes('ANDNOT') && rCimac[9].includes('market size'), rCimac[9]);
  const rAyk = f.opoint_kj_recallEn(fasit[0], forb, sr, m.kl, { oldest: 1, newest: 2 }, () => false, '17');
  assert.ok(rAyk[9].startsWith('ikke i Opoint-indeksen'));
  const gamle = [['18. nov', 'Routine', 'X', 'ja'], ['18. nov', 'Routine', 'Y', 'nei'], ['17. nov', 'Routine', 'gammel', 'ja']];
  const rad = f.opoint_kj_byggRaderRecall(gamle, [rFerje, rCimac, rAyk], '17', ['adv']);
  assert.strictEqual(rad.length, 3 + 5); // gamle 17-rader erstattes
  assert.ok(rad[0].includes('17. nov Routine') && rad[0].some(x => String(x).startsWith('33 % (1/3)')));
  assert.ok(rad[0].some(x => String(x).startsWith('50 % (1/2) – mangler: Y')));
})();
console.log('DEL 3d–e, 4, rapport og recall OK');
