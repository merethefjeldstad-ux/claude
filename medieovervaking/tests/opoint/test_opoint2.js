// Node-test av opoint_test2-logikken (uten Apps Script). Kjør: node tests/opoint/test_opoint2.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../../Opoint.gs', 'utf8'), ctx);
const f = ctx;
const parse = s => new Date(s.replace(' ', 'T') + ':00Z'); // testparser (UTC), bare for logikk
const NOW = 1763460000000;

// --- Vindu ---
let v = f.opoint_beregnVindu('', '', undefined, NOW, parse);
assert.strictEqual(v.newest - v.oldest, 86400);
v = f.opoint_beregnVindu('', '', 7, NOW, parse);
assert.strictEqual(v.newest - v.oldest, 7 * 86400);
v = f.opoint_beregnVindu('2026-11-01 00:00', '2026-11-02 00:00', 7, NOW, parse); // dagerTilbake overstyrer
assert.strictEqual(v.kilde, 'dagerTilbake=7');
v = f.opoint_beregnVindu('2026-11-01 00:00', '2026-11-02 00:00', undefined, NOW, parse);
assert.strictEqual(v.newest - v.oldest, 86400);
assert.throws(() => f.opoint_beregnVindu('2026-11-01 00:00', '', undefined, NOW, parse), /både/);
assert.throws(() => f.opoint_beregnVindu('2026-11-01', '2026-11-02', undefined, NOW, parse), /format/);
assert.throws(() => f.opoint_beregnVindu('2026-11-02 00:00', '2026-11-01 00:00', undefined, NOW, parse), /før/);

// --- Body ---
const b = JSON.parse(JSON.stringify(f.opoint_byggBody('x', 1, 2, 'c', 25)));
assert.deepStrictEqual(b, {searchterm:'x',params:{requestedarticles:25,context:'c',oldest:1,newest:2,groupidentical:1,identical:{inherit:true},main:{header:1,summary:1}}});

// --- Spørringsliste ---
assert.strictEqual(f.OPOINT_T2_SPORRINGER.length, 6);
assert.ok(!/header:\(/.test(f.OPOINT_T2_SPORRINGER[3].searchterm), 'd) må ikke bruke header:( )');
assert.strictEqual((f.OPOINT_T2_SPORRINGER[3].searchterm.match(/header:/g) || []).length, 12);

// --- Mock-kjøring ---
function lagDeps(svarFn) {
  const kall = [], logg = [];
  return { kall, logg, deps: {
    fetch: body => { kall.push(JSON.parse(JSON.stringify(body))); return svarFn(body, kall.length); },
    sleep: () => {}, now: () => 0, log: s => logg.push(s), masker: s => s,
    vindu: sp => f.opoint_beregnVindu('', '', sp.dagerTilbake, NOW, parse)
  }};
}
const doc = i => ({ id_site: 1, id_article: i, unix_timestamp: 1763450000, header:{text:'T'+i}, summary:{text:'S'},
  language:{encoding:'iso-639', text:'en'}, identical_documents:{cnt:2, document:[{},{}]},
  first_source:{id:9, name:'Forside', sitename:'BBC'}, site_rank:{rank_global:5, rank_country:2},
  mediatype:{text:'Web'}, word_count:321, url:'u' });
const ok = (n, ctxStr, extra) => ({ status: 200, tekst: JSON.stringify({ searchresult: Object.assign(
  { documents: n, count: n + 1, range_count: 99, context: ctxStr, document: Array.from({length:n}, (_, i) => doc(i)) }, extra || {}) }) });

// 1) 25 godtas, paging stopper på tom context
let m = lagDeps((body, nr) => nr === 1 ? ok(25, 'p2') : ok(3, ''));
let r = f.opoint_kjorAlle([{ navn: 'q', searchterm: 's' }], m.deps);
assert.strictEqual(r.kall, 2); assert.strictEqual(r.requested, 25);
assert.strictEqual(r.resultater[0].artikler.length, 28);
assert.strictEqual(r.resultater[0].contextTom, true);
assert.strictEqual(m.kall[1].params.context, 'p2');
assert.strictEqual(r.resultater[0].count.join(','), '26,4');
assert.strictEqual(r.resultater[0].documents.join(','), '25,3');

// 2) 25 avvises (HTTP 400), 10 godtas og brukes videre
m = lagDeps((body) => body.params.requestedarticles === 25 ? { status: 400, tekst: '{"detail":"too many"}' } : ok(10, ''));
r = f.opoint_kjorAlle([{ navn: 'a', searchterm: 's' }, { navn: 'b', searchterm: 's' }], m.deps);
assert.strictEqual(r.requested, 10); assert.ok(r.fallbackLogg.includes('avvist'));
assert.strictEqual(r.kall, 3); // 25(feil) + 10 + 10
assert.strictEqual(m.kall[2].params.requestedarticles, 10);
assert.strictEqual(r.resultater[0].statuser.join(','), '400,200(10)');

// 3) Spørringsfeil (errors med både 25 og 10) -> logg og gå videre
m = lagDeps((body) => body.searchterm === 'bad' ? ok(0, '', { errors: 'Solr could not handle the query' }) : ok(2, ''));
r = f.opoint_kjorAlle([{ navn: 'bad', searchterm: 'bad' }, { navn: 'good', searchterm: 'good' }], m.deps);
assert.ok(r.resultater[0].feil.includes('Solr'));
assert.strictEqual(r.resultater[1].artikler.length, 2);
assert.strictEqual(r.requested, 25);

// 4) Maks 6 batcher per spørring
m = lagDeps(() => ok(25, 'mer'));
r = f.opoint_kjorAlle([{ navn: 'q', searchterm: 's' }], m.deps);
assert.strictEqual(r.resultater[0].batcher, 6); assert.strictEqual(r.resultater[0].contextTom, false);

// 5) Kalltak 40 totalt
m = lagDeps(() => ok(25, 'mer'));
const mange = Array.from({length: 8}, (_, i) => ({ navn: 'q' + i, searchterm: 's' }));
r = f.opoint_kjorAlle(mange, m.deps);
assert.strictEqual(r.kall, 40); assert.strictEqual(m.kall.length, 40); assert.strictEqual(r.kalltakNadd, true);
assert.strictEqual(r.resultater[6].batcher, 4); assert.ok(r.resultater[6].merknad.includes('Kalltaket'));
assert.ok(r.resultater[7].feil.includes('Ikke kjørt'));

// 6) debug fanges, merknad ved færre enn bedt om men context ikke tom
m = lagDeps((b, nr) => nr === 1 ? ok(12, 'mer', { debug: { count: 1, lines: [{ state: 1, query: 'x' }] } }) : ok(0, ''));
r = f.opoint_kjorAlle([{ navn: 'q', searchterm: 's' }], m.deps);
assert.ok(r.resultater[0].debug.includes('"state":1'));
assert.ok(r.resultater[0].merknad.includes('12 av 25'));

// 7) Artikkelrad
const rad = f.opoint_artikkelRad('q', Object.assign(doc(7), { similarweb: { domain: 'x'.repeat(300) } }), s => 'D' + s);
assert.strictEqual(rad.length, 17);
assert.strictEqual(rad[1], 'D1763450000'); assert.strictEqual(rad[5], 'en'); assert.strictEqual(rad[9], 2);
assert.strictEqual(rad[10], ''); assert.strictEqual(rad[11], 'BBC / Forside (9)');
assert.strictEqual(rad[12], 'global=5; land=2'); assert.strictEqual(rad[13], 'Web');
assert.strictEqual(rad[14].length, 201); assert.strictEqual(rad[15], 321);

// 8) Rader til ark
const rader = f.opoint_byggRader(r, { oldest: 1, newest: 2 }, NOW, s => String(s));
assert.strictEqual(rader[2][0], 'Spørring'); assert.strictEqual(rader[3][0], 'q');
assert.strictEqual(rader[5][1].startsWith('Dato'), true);

// 9) Ingen forbudte tjenester i ny kode
const kode = fs.readFileSync(__dirname + '/../../Opoint.gs', 'utf8');
assert.ok(!/GmailApp\.|MailApp\.|newTrigger\(|api\.anthropic\.com/.test(kode));
console.log('Alle opoint_test2-tester OK');
