// Node-test av OpointTest3.gs (uten Apps Script). Kjør: node tests/opoint/test_opoint3.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const logg = [];
const ctx = { Logger: { log: s => logg.push(String(s)) } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../../Opoint.gs', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../../OpointTest3.gs', 'utf8'), ctx);
const f = ctx;
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const d = { fmtSek: s => 'T' + s, dagTekst: x => x.toISOString().slice(0, 10),
  tilSek: t => Math.floor(Date.parse(t.replace(' ', 'T') + ':00Z') / 1000) };

// Ingen navnekollisjon med Opoint.gs
const navn = src => (src.match(/^(?:function|var)\s+([A-Za-z0-9_]+)/gm) || []).map(x => x.split(/\s+/)[1]);
const a = navn(fs.readFileSync(__dirname + '/../../Opoint.gs', 'utf8'));
const b = navn(fs.readFileSync(__dirname + '/../../OpointTest3.gs', 'utf8'));
assert.deepStrictEqual(b.filter(x => a.includes(x)), []);
assert.ok(b.every(x => /^opoint_|^OPOINT_/.test(x)), 'alle nye navn har prefiks');
const kode = fs.readFileSync(__dirname + '/../../OpointTest3.gs', 'utf8');
assert.ok(!/GmailApp\.|MailApp\.|newTrigger\(|api\.anthropic\.com|textrazor|readership|text:\s*1/.test(kode));

// URL-normalisering
assert.strictEqual(f.opoint_t3_normUrl('HTTPS://www.Example.com/a/b/?x=1#y'), 'example.com/a/b');
assert.strictEqual(f.opoint_t3_normUrl('http://example.com/a'), f.opoint_t3_normUrl('https://www.example.com/a/'));
assert.strictEqual(f.opoint_t3_domene('https://www.tu.no/artikler/x'), 'tu.no');

// Tittellikhet
assert.strictEqual(f.opoint_t3_tittelLikhet('Ammonia ship sets sail!', 'ammonia ship sets sail'), 1);
assert.ok(f.opoint_t3_tittelLikhet('a b c d e', 'a b c x y') < 0.8);
assert.strictEqual(f.opoint_t3_tittelLikhet('a b c d e', 'a b c d x'), 0.8);
assert.ok(f.opoint_t3_tittelLikhet('a b c d e', 'a b c d e f') >= 0.8);

// Rensing og særegne ord
let r = f.opoint_t3_rensTittel('Ny "grønn" ferge (MF Test): klar?');
assert.strictEqual(r.tekst, 'ny grønn ferge mf test klar'); assert.strictEqual(r.endret, true);
assert.strictEqual(f.opoint_t3_rensTittel('Ammonia Ship').endret, false);
assert.deepStrictEqual(JSON.parse(JSON.stringify(f.opoint_t3_saeregneOrd('The first ammonia-fuelled vessel sails from Norway to Singapore'))),
  ['singapore', 'ammonia', 'fuelled', 'vessel', 'norway']);

// Kolonner
let k = f.opoint_t3_finnKolonner(['Artikkel-ID', 'Overskrift', 'Ingress', 'Forventet']);
assert.strictEqual(k.tittel, 1); assert.strictEqual(k.url, -1); assert.strictEqual(k.stopp, '');
assert.strictEqual(k.merknad.length, 2);
k = f.opoint_t3_finnKolonner(['ID', 'Tittel', 'URL', 'Publiseringsdato', 'Språk']);
assert.deepStrictEqual([k.tittel, k.url, k.dato, k.sprak], [1, 2, 3, 4]);
assert.ok(f.opoint_t3_finnKolonner(['Tittel', 'Overskrift']).stopp.includes('Flere'));
assert.ok(f.opoint_t3_finnKolonner(['A', 'B']).stopp.includes('Fant ingen tittelkolonne'));

// Dato
assert.strictEqual(f.opoint_t3_tolkDato('05.11.2026', d.dagTekst), '2026-11-05');
assert.strictEqual(f.opoint_t3_tolkDato('2026-11-05 10:00', d.dagTekst), '2026-11-05');
assert.strictEqual(f.opoint_t3_tolkDato(new Date(Date.UTC(2026, 10, 5)), d.dagTekst), '2026-11-05');
assert.strictEqual(f.opoint_t3_tolkDato('i går', d.dagTekst), '');
const v = f.opoint_t3_vinduRundtDato('2026-11-05', NOW, d.tilSek);
assert.strictEqual(v.newest - v.oldest, 7 * 86400 - 1);
assert.ok(f.opoint_t3_vinduRundtDato('2026-11-17', NOW, d.tilSek).newest <= NOW / 1000);

// Mock-klient
function klient(svarFn, maks) {
  const kall = [];
  const kl = f.opoint_t3_lagKlient('HEMMELIG', maks, body => { kall.push(JSON.parse(JSON.stringify(body))); return svarFn(body, kall.length); }, () => {});
  return { kl, kall };
}
const ok = (docs, ctxStr) => ({ status: 200, tekst: JSON.stringify({ searchresult: { documents: docs.length, range_count: 7, context: ctxStr || '', document: docs } }) });
const doc = (o) => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1, header: { text: 'x' }, summary: { text: 's' } }, o);

// Test 3-flyt
let m = klient(body => {
  const st = body.searchterm;
  if (st === 'header:"ammonia ship sets sail"') return ok([doc({ header: { text: 'Ammonia ship sets sail' }, orig_url: 'https://www.ex.com/a/?utm=1' })]);
  if (st.startsWith('header:"')) return ok([]);
  if (st.includes('header:bunkering')) return ok([doc({ header: { text: 'Norway starts ammonia bunkering pilot' } })]);
  if (st.includes('header:feiler')) return { status: 500, tekst: 'Internal error HEMMELIG' };
  return ok([doc({ header: { text: 'Helt annen sak' } })]);
}, 60);
const kol = f.opoint_t3_finnKolonner(['Tittel', 'URL', 'Dato']);
const res3 = f.opoint_t3_kjorReferansesett([
  ['Ammonia ship sets sail', 'http://ex.com/a', '2026-11-05'],
  ['Norway starts ammonia bunkering pilot', '', ''],
  ['Noe som feiler totalt', '', ''],
  ['Ukjent tittel her', '', ''],
  ['', '', '']
], kol, m.kl, NOW, d);
assert.strictEqual(res3.length, 4);
assert.strictEqual(res3[0].vurdering.type, 'URL-match'); assert.strictEqual(res3[0].sok2, 'ikke kjørt');
assert.strictEqual(res3[1].vurdering.type, 'tittel-match'); assert.strictEqual(res3[1].viaFallback, true);
assert.strictEqual(res3[1].sok1, 0); assert.strictEqual(res3[1].sok2, 1);
assert.ok(res3[2].feil.includes('Søk 2') && !res3[2].feil.includes('HEMMELIG'));
assert.strictEqual(res3[3].vurdering.type, 'ikke funnet');
assert.strictEqual(m.kall[0].params.requestedarticles, 10); assert.strictEqual(m.kall[0].params.context, '');
const rader3 = f.opoint_t3_byggRaderReferansesett(res3, kol, d, m.kl.antall(), NOW);
assert.deepStrictEqual(JSON.parse(JSON.stringify(rader3[0].slice(0, 16))), ['Antall artikler', 4, 'Funnet', 2, 'Andel funnet', '50 %', 'Via URL-match', 1,
  'Via tittel-match', 1, 'Via fallback-søk', 1, 'Ikke funnet', 1, 'Feil', 1]);

// Kalltak test 3
m = klient(() => ok([]), 3);
const res3b = f.opoint_t3_kjorReferansesett([['aaa bbb', '', ''], ['ccc ddd', '', '']], kol, m.kl, NOW, d);
assert.strictEqual(m.kall.length, 3); assert.ok(res3b[1].feil.includes('kalltak'));

// Test 4-spørringer fra OPOINT_T2_SPORRINGER
const sp4 = f.opoint_t4_byggSporringer(f.OPOINT_T2_SPORRINGER);
assert.strictEqual(sp4.length, 2);
assert.strictEqual(sp4[0].searchterm, '"Maritime CleanTech"');
assert.ok(!sp4[1].searchterm.includes('header:'));
assert.strictEqual(sp4[1].searchterm, f.OPOINT_T2_SPORRINGER[3].searchterm.replace(/header:/g, ''));
const faa = f.opoint_t4_byggSporringer([{ navn: 'd) x', searchterm: '(header:"A B" OR header:C)' }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(faa.map(x => x.searchterm))), ['"Maritime CleanTech"', '"A B"', 'C']);
assert.throws(() => f.opoint_t4_byggSporringer([{ navn: 'a)', searchterm: 'x' }]));

// Paging, feil går videre, duplikater
m = klient((body, n) => {
  if (body.searchterm === 'feil') return { status: 401, tekst: '{"detail":"Invalid token"}' };
  if (body.params.context === '') return ok([doc({ id_article: 1, equalgroup: 5 }), doc({ id_article: 2, equalgroup: 6 })], 'c1');
  return ok([doc({ id_article: 3, equalgroup: 5 }), doc({ id_article: 2, equalgroup: 6 }), doc({ id_article: 4 })], '');
}, 40);
const res4 = f.opoint_t3_kjorSporringer([{ navn: 'feil', searchterm: 'feil' }, { navn: 'ok', searchterm: 'ok' }],
  f.opoint_t3_vinduDager(30, NOW), 25, 4, m.kl);
assert.ok(res4[0].feil.includes('401'));
assert.strictEqual(res4[1].artikler.length, 5); assert.strictEqual(res4[1].batcher, 2); assert.strictEqual(res4[1].contextTom, true);
assert.strictEqual(m.kall[2].params.context, 'c1'); assert.strictEqual(m.kall[1].params.requestedarticles, 25);
const dup = f.opoint_t3_markerDuplikater(res4[1].artikler);
assert.deepStrictEqual(JSON.parse(JSON.stringify(dup.merker)), ['', '', 'Duplikat: equalgroup 5 (som rad 1)', 'Duplikat: samme artikkel som rad 2', '']);
assert.strictEqual(dup.unikeGrupper, 2); assert.strictEqual(dup.utenEqualgroup, 1);

// Maks batcher
m = klient(() => ok([doc({})], 'mer'), 40);
const res5 = f.opoint_t3_kjorSporringer([{ navn: 'q', searchterm: 'q' }], f.opoint_t3_vinduDager(7, NOW), 25, 2, m.kl);
assert.strictEqual(res5[0].batcher, 2); assert.strictEqual(res5[0].contextTom, false);

// Rader med kilde-domene
const rader5 = f.opoint_t3_byggRaderListe([{ navn: 'q', searchterm: 'q', statuser: [200], batcher: 1, contextTom: true,
  rangeCount: [1], feil: '', merknad: '', artikler: [{ doc: doc({ orig_url: 'https://www.nrk.no/a', language: { text: 'no' } }), batch: 1 }] }],
  f.opoint_t3_vinduDager(7, NOW), m.kl, NOW, d, true);
const hode = rader5[5]; const art = rader5[6];
assert.strictEqual(hode[hode.length - 1], 'Kilde-domene'); assert.strictEqual(art[art.length - 1], 'nrk.no');
assert.strictEqual(art[3], 'https://www.nrk.no/a'); assert.strictEqual(art[5], 'no');

// Test 5-spørringer
assert.strictEqual(f.OPOINT_T5_SPORRINGER.length, 5);
f.OPOINT_T5_SPORRINGER.forEach(s => { assert.ok(s.searchterm.endsWith('AND lang:no')); assert.ok(s.searchterm.includes('rederi*')); });
assert.ok(!logg.join('\n').includes('HEMMELIG'));
console.log('Alle OpointTest3-tester OK');
