// Node-test av runde D. Kjør: node tests/opoint/test_d.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const ctx = { Logger: { log: () => {} } }; vm.createContext(ctx);
ctx.Utilities = { formatDate: (t, tz, f) => f === 'yyyy-MM-dd' ? new Date(t.getTime() + 3600e3).toISOString().slice(0, 10) : 'x', parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1795500000, header: { text: 'x' }, summary: { text: 'Teksten er en hel setning som er lang nok til å telle som god ingress i testen her.' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const lagTj = (svarFn) => { const kall = []; const svar = b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b) }] }) }; };
  const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x, fetch: svar, fetchMange: bs => bs.map(svar) }); t.kallListe = kall; return t; };
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const vindu = { oldest: Date.parse('2026-11-17T07:30:00+01:00') / 1000, newest: Date.parse('2026-11-18T07:30:00+01:00') / 1000 };
const prio = { kart: {}, kilder: {} };

// ---- D 3: NYK – andre titler til KI og verdensførste-regel ----
const nykT = ['Nippon Yusen Unveils Ammonia-Powered Ship', 'NYK unveils first vessel with ammonia fuelled main and auxiliary engines', "NYK Unveils World's First Ammonia-Fueled Gas Carrier Izanami",
  'NYK Names Ammonia-Fuelled Gas Carrier in Japan', 'Japan\'s ammonia-powered carrier unveiled', 'NYK names Izanami', 'Izanami christened'];
const nd = nykT.map((t, i) => doc({ id_article: 10 + i, orig_url: 'https://n' + i + '.com/x', header: { text: t } }));
const sn = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: nd }], [], prio), { grupper: [[0, 1, 2, 3, 4, 5, 6]] });
assert.strictEqual(sn.length, 1); assert.ok(sn[0].antallTilsvarende >= 6);
const kt = f.opoint_kj_kiBrukerTekst(sn[0].representant, sn[0]);
assert.ok(/Andre kilder \(\d+\), titler: .*World's First/.test(kt));
sn[0].kiResultat = { relevant: true, prioritet: 'middels', stor: false, tema: true, norsk: false, prioritetGrunn: 'ikke angitt som verdensførste' };
const fr = f.opoint_kj_brukFasteRegler(sn);
assert.strictEqual(fr.verdensforste.length, 1); assert.strictEqual(sn[0].kiResultat.prioritet, 'høy'); assert.strictEqual(sn[0].kiResultat.stor, true);
f.opoint_kj_brukVariant(sn, true, 8); assert.strictEqual(sn[0].kiResultat.prioritet, 'høy');
// Under 5 kilder: ingen regel
const s2 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 40, orig_url: 'https://a.com/1', header: { text: "World's first ammonia tug delivered" } })] }], [], prio), null);
s2[0].kiResultat = { relevant: true, prioritet: 'middels' }; f.opoint_kj_brukFasteRegler(s2); assert.strictEqual(s2[0].kiResultat.prioritet, 'middels');
console.log('D 3 OK');

// ---- D 1: norsk + tema aldri lav ----
const s3 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 50, orig_url: 'https://radioh.no/15', header: { text: '15 ferjeladere på Haugalandet og i Sunnhordland' }, language: { text: 'no' } })] }], [], prio), null);
s3[0].kiResultat = { relevant: true, prioritet: 'lav', norsk: true, tema: true };
f.opoint_kj_brukFasteRegler(s3); assert.strictEqual(s3[0].kiResultat.prioritet, 'middels');
console.log('D 1 OK');

// ---- D 2: sammendrag – opptil 8 setninger når > 5 middels, [NORSK] først ----
const md = [0, 1, 2, 3, 4, 5, 6].map(i => doc({ id_article: 60 + i, orig_url: 'https://m.com/' + i, header: { text: 'Middels sak ' + i } }));
const sm = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: md }], [], prio), null);
sm.forEach((s, i) => { s.kiResultat = { relevant: true, prioritet: 'middels', norsk: i === 6, tema: i === 6 || i === 3 }; });
const inn = f.opoint_kj_sammendragInndata(sm);
assert.strictEqual(inn[0].sak, 'S7'); assert.ok(inn[0].norsk);
const tjS = lagTj(() => JSON.stringify({ setninger: [1, 2, 3, 4, 5, 6, 7].map(n => ({ tekst: 'Setning ' + n + ' om saken.', sak: n })) }));
const res = f.opoint_kj_lagSammendrag(sm, tjS);
assert.strictEqual(res.setninger.length, 7); assert.strictEqual(tjS.kallListe[0].max_tokens, 900);
assert.ok(tjS.kallListe[0].system.includes('maks 8 setninger og maks 180 ord') && tjS.kallListe[0].messages[0].content.startsWith('1. [NORSK] '));
const sm5 = sm.slice(0, 4); const g5 = f.opoint_kj_sammendragGrenser(4); assert.deepStrictEqual([g5.setninger, g5.ord], [5, 120]);
console.log('D 2 OK');

// ---- D 4: Apps Script-kort fjernes aldri av kontroll-lesingen ----
const asT = [{ tittel: 'LNG-tankskip skal ha sunket utenfor Bulgaria – mannskapet berget', lenke: 'https://www.aftenposten.no/lng', ingress: '', kilde: 'Aftenposten', matchendeOrd: ['GASS'], aiRelevant: false, aiIrrelevantGrunn: 'Forlis', aiNevnerOss: false }];
const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [] }], [], prio);
f.opoint_ft_kobleAS(kk, asT); const sk = f.opoint_kj_lagSaker(kk, null); f.opoint_ft_merkSaker(sk);
f.opoint_kj_vurderSaker(sk, { sokeord: [] }, lagTj(() => '{"saker": []}'), 0, vindu);
const op = { ok: true, forb: { kandidater: kk, resultater: [], klient: {}, oppsett: { merknader: [] } }, saker: sk, ki: { kall: 0 }, sm: null };
const as = { treff: asT, kategori: {}, ok: 0, totalt: 0, feilet: [], kildeAS: 'sendt' };
const ep = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, []);
const tjK = lagTj(() => '{"funn": [{"id": "K1", "problem": "Ingen kobling til grønn teknologi", "alvorlighet": "kritisk", "forslag": "fjern_kort"}]}');
const kl = f.opoint_ft_kontrollLes({ epost: ep, saker: sk, sm: null, tjeneste: tjK, vindu, d: { fmtSek: fmt } });
assert.deepStrictEqual(J(kl.overstyr.fjern), {}); assert.ok(kl.logg.some(x => /Apps Script-treff vises alltid/.test(x.handling)));
const ep2 = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, [], kl.overstyr);
assert.ok(ep2.html.includes('Mulig irrelevant</div>') && ep2.html.includes('LNG-tankskip'));
console.log('D 4 OK');

// ---- D 5/6: konfigurasjon ----
assert.strictEqual(f.DEKNING_SAKER.length, 8); assert.ok(f.DEKNING_SAKER.some(x => x.tittel === 'Another methanol-ready offshore energy support vessel launches in China'));
assert.ok(f.OPOINT_KJ_RECALL_FASIT['20'].saker.some(x => x.navn === 'Lauritzen Brave Bulker'));
assert.strictEqual(f.FELLES_VARIANT, 'D'); assert.strictEqual(f.HOY_KREVER_TEMA, true); assert.strictEqual(f.MAKS_KORT, 8);
console.log('Alle D-tester OK');
