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
assert.ok(!/newTrigger\(|MailApp\.|GmailApp\.|textrazor|readership|text:\s*1|getEffectiveUser|vurderTreffMedAI\(/.test(kode));
assert.strictEqual((kode.match(/api\.anthropic\.com/g) || []).length, 1); // bare i opoint_kj_lagKiTjeneste
assert.ok(!/getSheetByName\((?:FANE_|'Sendte|'Artikkellogg|'Referansesett|'Kjøretidslogg|'Mottakere)/.test(kode));
// Ingen skriving til beskyttede faner: skrivFane kalles kun med egne fanekonstanter
(kode.match(/opoint_t3_skrivFane\(ss, ([A-Z0-9_]+)/g) || []).forEach(m =>
  assert.ok(/OPOINT_(DIAG_FANE|DIAG_FANE_DEKNING|KJOR_FANE|KJOR_FANE_SPORRINGER|KJ_TEST1_FANE|KJ_UKE_FANE|KJ_TEST2_FANE|KJ_TESTD_FANE|KJ_T2B_FANE|KJ_T2C_FANE|KJ_T2DE_FANE|KJOR_FANE_ALLE|KJ_SCAN_FANE)$/.test(m.split(', ')[1]), m));
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
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1763450000, header: { text: 'x' }, summary: { text: 's' } }, o);

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
  assert.strictEqual(B[0].searchterm, 'header:ammonia AND (vessel* OR ship OR shipping) ANDNOT (smartphone* OR phone* OR laptop* OR gadget* OR "e-bike" OR "e-bikes" OR ebike* OR "free shipping" OR hair* OR comb OR combs OR "blood vessel" OR "blood vessels")');
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
  assert.strictEqual(tekst, '1 [en] ' + 'x'.repeat(120));

  // KI-tjeneste med mock: kalltak, buffer, kostnad, nøkkel aldri ut
  let anth = [];
  const props = { ANTHROPIC_API_KEY: 'sk-HEMMELIG', AI_MODEL: 'claude-haiku-5-5' };
  const buffer = {}; const cache = { get: k => buffer[k] || null, put: (k, v) => { buffer[k] = v; } };
  const svarFor = body => {
    const u = body.messages[0].content;
    if (body.system.includes('grupperer')) return '{"grupper": [[1, 2]]}';
    if (u.includes('Tull')) return 'ikke json';
    return '{"relevant": ' + (!u.includes('kaffe')) + ', "kategori": "Energi og framdrift", "nevner_oss": false, "irrelevant_grunn": "Kaffe", "notat": ""}';
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
  assert.strictEqual(saker[0].andreKilder, 'a.no');
  const oppsett = { sokeord: [{ sokeord: 'HyShip', kategori: 'Prosjekter' }] };
  const ki = f.opoint_kj_vurderSaker(saker, oppsett, t1);
  assert.strictEqual(saker[0].kiResultat.relevant, true); assert.strictEqual(saker[0].kiResultat.nevnerOss, true);
  assert.strictEqual(saker[0].kiResultat.kategori, 'Prosjekter'); // fra Søkeord, ingen KI
  assert.strictEqual(saker[1].kiResultat.relevant, false); assert.strictEqual(saker[1].kiResultat.irrelevantGrunn, 'Kaffe');
  assert.strictEqual(saker[2].kiResultat.relevant, true); assert.strictEqual(saker[2].kiResultat.nevnerOss, false); // Tier 2: KI avgjør
  assert.strictEqual(anth.length, 3); // 1 gruppering + 2 relevans (HyShip-saken trengte ikke KI)
  assert.ok(anth.every(b => b.max_tokens >= 400));
  const rel = anth.filter(b => !b.system.includes('grupperer'));
  assert.ok(rel.every(b => !/sammendrag/.test(b.system) && /avkuttet/.test(b.system)));
  assert.strictEqual(saker[1].kiResultat.tegn, rel[1].messages[0].content.length); // rel[0] er GASS (strøm A vurderes først)
  assert.ok(Math.abs(ki.kostnad - 3 * (1000 / 1e6 * 0.10 + 100 / 1e6 * 0.5)) < 1e-9);
  // Gjenopptak: samme kjøring på nytt bruker bufferen, ingen nye kall
  anth = [];
  const t2 = tj();
  const saker2 = f.opoint_kj_lagSaker(kand, f.opoint_kj_grupperSaker(kand, t2));
  f.opoint_kj_vurderSaker(saker2, oppsett, t2);
  assert.strictEqual(anth.length, 0); assert.strictEqual(t2.fraBuffer, 3);
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
  assert.strictEqual(rs1.length, 4 + 3); assert.strictEqual(rs1[4][10], 1); assert.strictEqual(rs1[4][11], 'a.no');
  assert.strictEqual(rs1[4][5], 'Ammonia ship…'); assert.strictEqual(rs1[4][18], ''); // visning: … lagt til
  const iEp = rs1[0].indexOf('E-post A'); assert.strictEqual(rs1[0][iEp + 1], 2); // HyShip-saken (A+B) og GASS-saken (A)
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
  const kt = f.opoint_kj_kontrollerSak({ type: 'samme', re: [/hyship/i] }, kand);
  assert.strictEqual(kt.status, 'OK');
  const kt2 = f.opoint_kj_kontrollerSak({ type: 'adskilt', re: [/kaffe/i], mot: [/hyship/i] }, kand);
  assert.strictEqual(kt2.status, 'OK');
  assert.strictEqual(f.opoint_kj_kontrollerSak({ type: 'samme', re: [/finnes ikke/] }, kand).status, 'IKKE BEVIST');
})();
console.log('Rettelse a–c + steg 3–5-tester OK');
// Intern hjelpefunksjon kjørt alene gir forståelig feil
assert.throws(() => f.opoint_kj_kjorScandasia(undefined, { oldest: 1, newest: 2 }), /intern hjelpefunksjon/);
console.log('Vakt mot direkte kjøring OK');
