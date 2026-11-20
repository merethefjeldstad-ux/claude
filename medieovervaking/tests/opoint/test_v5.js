// Node-test av rettelsene etter backfill A og v4/v5 (DEL 1–3, 5). Kjør: node tests/opoint/test_v5.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const ctx = { Logger: { log: () => {} } }; vm.createContext(ctx);
ctx.Utilities = { formatDate: (t, tz, f) => f === 'yyyy-MM-dd' ? new Date(t.getTime() + 3600e3).toISOString().slice(0, 10) :
  f === 'EEEE d. MMMM yyyy' ? 'DATO ' + new Date(t.getTime() + 3600e3).toISOString().slice(0, 10) : 'x', parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1795500000, header: { text: 'x' }, summary: { text: 'Teksten er en hel setning som er lang nok til å telle som god ingress i testen her.' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const lagTj = (svarFn) => { const kall = []; const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
  fetch: b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; },
  fetchMange: bs => bs.map(b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; }) }); t.kallListe = kall; return t; };
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const vindu = { oldest: Date.parse('2026-11-19T07:30:00+01:00') / 1000, newest: Date.parse('2026-11-20T07:30:00+01:00') / 1000 };
const prio = { kart: {}, kilder: {} };

// ---- DEL 1.1: HTML-bruddet (Om oss + «Også omtalt på tysk» + «Ellers i bransjen») ----
const asT = [{ tittel: 'Havila Capella Undergoes Modifications', lenke: 'https://breakingtravelnews.com/h', ingress: '', kilde: 'MC', matchendeOrd: ['LOWNOISER'], aiRelevant: true, aiNevnerOss: true, aiNotat: '', aiSammendrag: 'Havila Capella bygges om for å redusere støy.' },
  { tittel: 'Postschiff nimmt künftig in jedem Hafen Autos an Bord', lenke: 'https://www.nordisch.info/p', ingress: '', kilde: 'LOWNOISER', matchendeOrd: ['LOWNOISER'], aiRelevant: true, aiNevnerOss: true }];
const opD = [doc({ id_article: 5, orig_url: 'https://hellenicshippingnews.com/tmc', header: { text: "TMC's compressors picked for 23 methanol-ready bulk carriers" } }),
  doc({ id_article: 6, orig_url: 'https://h.com/etanol', header: { text: 'US ethanol study' } })];
const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: opD }], [], prio);
f.opoint_ft_kobleAS(kk, asT);
const sk = f.opoint_kj_lagSaker(kk, null); f.opoint_ft_merkSaker(sk);
sk[0].kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Skip, verft og havn', notat: 'TMC Compressors leverer trykkluftsystem til 23 skip.' };
sk[1].kiResultat = { relevant: true, prioritet: 'middels', kategori: 'Annet' };
const op = { ok: true, forb: { kandidater: kk, resultater: [{}], klient: {}, oppsett: { merknader: [] } }, saker: sk, ki: { kall: 0 },
  sm: { setninger: [{ tekst: 'Etanol er billigere (sak 2).', sak: sk[1].id, url: 'https://h.com/etanol', kilde: 'HSN' }], inndata: [] } };
op.sm.setninger[0].tekst = f.opoint_kj_fjernSaksref(op.sm.setninger[0].tekst);
f.opoint_kj_vurderSaker(sk.filter(s => s.asTreff), { sokeord: [] }, lagTj(() => '{"saker": []}'), 0, vindu);
const as = { treff: asT, kategori: {}, ok: 0, totalt: 0, feilet: [], kildeAS: 'sendt' };
const e1 = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, []);
op.fremmed = f.opoint_ft_fordelFremmedspraak(op, e1.kort, null, asT);
const e2 = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, []);
assert.deepStrictEqual(J(f.opoint_kj_validerHtml(e2.html)), []);
assert.ok(e2.html.indexOf('Ellers i bransjen') > e2.html.indexOf('TMC Compressors leverer')); // ikke midt i kortet
assert.ok(e2.html.indexOf('Også omtalt på tysk') < e2.html.indexOf('Skip, verft og havn'));
assert.ok(!/<div style=<tr>/.test(e2.html));
assert.ok(e2.html.includes('Etanol er billigere (<a') && !/sak 2/.test(e2.html));
assert.ok(e2.html.includes('Apps Script: 2 treff fra logg')); // DEL 1.3
assert.ok(e2.html.includes('DATO 2026-11-20') || !e2.html.includes('DATO')); // dato = vindusslutt (mock formatDate)
// Validering fanger bruddet slik det så ut 20. nov
assert.ok(f.opoint_kj_validerHtml('<table><tr><td><div style=<tr><td>Ellers</td></tr>"font-size:14px;">x</div></td></tr></table>').length >= 1);
console.log('DEL 1.1–1.3 OK');

// ---- DEL 1.4: hvert domene én gang ----
const hd = [doc({ id_article: 10, orig_url: 'https://breakingtravelnews.com/h2', header: { text: 'Havila' } }), doc({ id_article: 11, orig_url: 'https://www.zevener-zeitung.de/z', header: { text: 'Havila Voyages: Neue Antriebstechnik', }, language: { text: 'de' } }),
  doc({ id_article: 12, orig_url: 'https://inkl.com/h', header: { text: 'Havila' } })];
const kh = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: hd }], [], prio);
const sh = f.opoint_kj_lagSaker(kh, { grupper: [[0, 1, 2]] }); sh[0].kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Annet' };
const eh = f.opoint_kj_byggEpost(sh, null, vindu, fmt, false, {}, [], { fremmed: { perKort: { K1: [{ navn: 'zevener-zeitung.de (de)', url: 'https://www.zevener-zeitung.de/z' }] }, omOss: [] } });
assert.ok(eh.kort[0].notat.includes('Også omtalt: zevener-zeitung.de (de)'));
assert.ok(!/Andre kilder[^·]*zevener-zeitung\.de/.test(eh.kort[0].notat)); assert.ok(!/Andre kilder[^·]*breakingtravelnews/.test(eh.kort[0].notat));
// ---- DEL 1.5: IMO-kilde ----
const imo = [doc({ id_article: 20, orig_url: 'https://a.org/1', header: { text: 'NGOs urge IMO net-zero framework' } })];
const si = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: imo }], [], prio), null);
si[0].kiResultat = { relevant: true, prioritet: 'høy' };
si[0].imoGruppe = { id: 'IMO1', prioritet: 'høy', overskrift: 'NGO-er', oppsummering: 'O.', aktorer: [], saker: [si[0]] };
const ei = f.opoint_kj_byggEpost(si, null, vindu, fmt, false, {}, [], {});
assert.ok(ei.html.includes('Kilde: IMO Net-Zero Framework ·') && !ei.html.includes('1 saker'));
console.log('DEL 1.4–1.5 OK');

// ---- DEL 2.1/2.3: etterkontroll ----
const nyk = doc({ id_article: 30, orig_url: 'https://fullavantenews.com/izanami', header: { text: "World's First Ship With Ammonia-Fueled Engines Is Named Izanami By NYK" } });
const ayk = doc({ id_article: 31, orig_url: 'https://fuelcellsworks.com/ayk', header: { text: 'AYK Energy wins biggest marine battery contract' } });
const ny = doc({ id_article: 32, orig_url: 'https://x.com/ny', header: { text: 'Kvinnherad: brann i ferjekai – nå er årsaken klar' } });
const se = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [nyk, ayk, ny] }], [], prio), null);
se.forEach(s => { s.kiResultat = { relevant: true, prioritet: 'høy' }; });
const sendte = [{ tid: Date.parse('2026-11-18T07:30:00+01:00'), tittel: 'NYK names ammonia-fuelled gas carrier', ingress: 'NYK held a naming ceremony.', norm: 'seatrade.com/nyk' },
  { tid: Date.parse('2026-11-17T07:30:00+01:00'), tittel: 'AYK to supply 165 MWh for Molslinjen', ingress: '165 MWh.', norm: 'motorship.com/ayk' },
  { tid: Date.parse('2026-11-19T07:30:00+01:00'), tittel: 'Brann i ferjekai i Kvinnherad', ingress: 'Brann.', norm: 'h.no/b' }];
const tjE = lagTj(b => /sjekker om nyhetssaker allerede er sendt/.test(b.system) ? '{"treff": [{"ny": 1, "tidligere": "T1"}, {"ny": 2, "tidligere": "T2"}, {"ny": 3, "tidligere": "T3"}]}' :
  /Kvinnherad/.test(b.messages[0].content) ? '{"samme_sak": true, "vesentlig": true, "begrunnelse": "Ny årsak.", "nytt": "Politiet oppgir at brannen startet i et ladeskap."}' : '{"samme_sak": true, "vesentlig": false, "begrunnelse": "Bare detaljer.", "nytt": ""}');
const ek = f.opoint_kj_etterkontrollOppfolging(se, sendte, tjE);
assert.strictEqual(ek.hendelse, 3); assert.strictEqual(ek.undertrykt, 2); assert.strictEqual(ek.oppdatering, 1);
assert.ok(se[0].oppfolging && /Sendt før 18\.11 \(ikke vesentlig nytt/.test(se[0].oppfolgingGrunn));
assert.ok(!se[2].oppfolging && se[2].oppdatering.nytt.startsWith('Politiet'));
const ee = f.opoint_kj_byggEpost(se, null, vindu, fmt, false, {}, [], {});
assert.strictEqual(ee.kort.length, 0); assert.ok(ee.html.includes('>Oppdateringer</div>') && ee.html.includes('Nytt: Politiet oppgir')); assert.strictEqual(ee.oppdateringer.length, 1);
assert.ok(tjE.kallListe.some(b => /TIDLIGERE \(sendt 18\.11\): NYK names/.test(b.messages[0].content)));
console.log('DEL 2 OK');

// ---- DEL 3: variant B ----
const vd = ['Boreal søker de første skipperne til Candela-båtene', 'Kort kystrutekontrakt setter arbeidsplassene i fare', 'Ny dypvannskai åpnet i Mo i Rana', 'Econowind turns ten',
  'Norled bestiller hydrogenferge', 'Fjord1 elektrifiserer', 'Batteriferge A', 'Batteriferge B', 'Batteriferge C', 'Batteriferge D', 'Batteriferge E', 'Batteriferge F', 'Batteriferge G']
  .map((t, i) => doc({ id_article: 100 + i, orig_url: 'https://v.no/' + i, header: { text: t } }));
const sv = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: vd }], [], prio), null);
sv.forEach((s, i) => { s.kiResultat = { relevant: true, prioritet: 'høy', tema: i >= 4, norsk: i < 6 }; });
sv[12].fastRelevant = true; sv[12].kiResultat.tema = false;   // eget prosjekt: alltid høy, teller ikke mot taket
const vb = f.opoint_kj_brukVariant(sv, true, 8);
assert.deepStrictEqual(J(vb.tema.map(s => s.id)), ['S1', 'S2', 'S3', 'S4']);   // Boreal, kystrute, dypvannskai, Econowind → middels
assert.strictEqual(vb.tak.length, 0); // 8 igjen (S5–S12) = taket
assert.strictEqual(sv[12].kiResultat.prioritet, 'høy');
sv.forEach(s => { s.kiResultat.prioritet = 'høy'; delete s.kiResultat.prioritetA; delete s.kiResultat.nedgradert; });
const vt = f.opoint_kj_brukVariant(sv, false, 8);
assert.strictEqual(vt.tak.length, 4); // 12 (uten eget) − 8
assert.ok(vt.tak.every(s => !(s.kiResultat.norsk && s.kiResultat.tema))); // norsk + tema beholdes først
assert.strictEqual(sv[0].kiResultat.prioritetA, 'høy');
console.log('DEL 3 OK');

// ---- DEL 5: recall-fasit 19 og alternativer ----
assert.ok(f.OPOINT_KJ_RECALL_FASIT['19'] && f.OPOINT_KJ_RECALL_FASIT['19'].saker.length === 5);
const kr = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 200, orig_url: 'https://me.com/x', header: { text: 'IMO Must Provide Global Net-Zero Framework, Say Industry Trade Groups' } })] }], [], prio);
const sr = f.opoint_kj_lagSaker(kr, null); sr[0].kiResultat = { relevant: true, prioritet: 'middels' };
const rad = f.opoint_kj_recallEn(f.OPOINT_KJ_RECALL_FASIT['19'].saker[0], { kandidater: kr, prio: prio, resultater: [] }, sr, null, vindu, () => false, '19');
assert.strictEqual(rad[3], 'ja'); assert.strictEqual(rad[11], 'S1');
console.log('DEL 5 OK');
console.log('Alle v5-tester OK');
