// Node-test av DEL A (A1, A3, A5, A6) og FellesTest.gs (DEL B–F). Kjør: node tests/opoint/test_felles.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const logg = [];
const ctx = { Logger: { log: s => logg.push(String(s)) } }; vm.createContext(ctx);
ctx.Utilities = { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? new Date(d.getTime() + 3600e3).toISOString().slice(0, 10) : 'torsdag 19. november 2026',
  parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1763450000, header: { text: 'x' }, summary: { text: 's.' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5', TEST_EPOST: 'test@eksempel.no' };
const lagTj = (svarFn) => { const kall = []; const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
  fetch: b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; } }); t.kallListe = kall; return t; };
const fmt = s => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16);

// --- Sikkerhet i kildekoden ---
const kodeF = fs.readFileSync(__dirname + '/../../FellesTest.gs', 'utf8');
const kodeO = fs.readFileSync(__dirname + '/../../OpointKjoring.gs', 'utf8');
assert.strictEqual((kodeF.match(/newTrigger\(/g) || []).length, 1); assert.ok(/newTrigger\(FELLES_TRIGGER_FUNKSJON\)\.timeBased\(\)\.at\(tid\)/.test(kodeF));
assert.ok(!/newTrigger\(/.test(kodeO)); assert.ok(!/GmailApp|MailApp|hentMottakere|FANE_MOTTAKERE/.test(kodeF));
assert.ok(!/oppdaterKildeStatus\(|\bloggKjoring\(/.test(kodeF)); // skriver ikke til Kilder/Kjøringslogg

// --- A6: STORE BOKSTAVER ---
assert.strictEqual(f.opoint_kj_erVersaler('NYK INTRODUCES FIRST AMMONIA-FUELLED GAS CARRIER'), true);
assert.strictEqual(f.opoint_kj_erVersaler('NYK introduces first ammonia-fuelled gas carrier'), false);
const prio = { kart: {}, kilder: {} };
const store = doc({ id_article: 1, orig_url: 'https://a.com/1', header: { text: 'NYK INTRODUCES FIRST AMMONIA-FUELLED GAS CARRIER' }, unix_timestamp: 100 });
const normal = doc({ id_article: 2, orig_url: 'https://b.com/1', header: { text: 'NYK introduces first ammonia-fuelled gas carrier' }, unix_timestamp: 200 });
let k = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [store, normal] }], [], prio);
let s = f.opoint_kj_lagSaker(k, { grupper: [[0, 1]] });
assert.strictEqual(s[0].representant.doc, normal); assert.strictEqual(s[0].casingByttet, 'medlem');
const store2 = doc({ id_article: 3, equalgroup: 9, orig_url: 'https://a.com/2', header: { text: 'NYK INTRODUCES FIRST AMMONIA-FUELLED GAS CARRIER' }, unix_timestamp: 100,
  identical_documents: { cnt: 1, document: [doc({ id_article: 4, orig_url: 'https://c.com/2', header: { text: 'NYK introduces first ammonia-fuelled carrier' }, unix_timestamp: 300 })] } });
k = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [store2] }], [], prio);
s = f.opoint_kj_lagSaker(k, null);
assert.strictEqual(k[0].doc, store2); // dedup-regelen uendret (tidligst publisert vant)
assert.strictEqual(f.opoint_kj_visDoc(s[0]).header.text, 'NYK introduces first ammonia-fuelled carrier');

// --- A5: IMO-vinkling ---
const imoDocs = [
  ['Shipping coalition urges net-zero framework adoption', 'wpo.org', ''],
  ['BIMCO and ICS call on IMO to adopt NZF at MEPC 85', 'bimco.org', 'Uttalelse'],
  ['Explained: what is the IMO Net-Zero Framework?', 'explainer.com', 'Bakgrunn'],
  ['EU position ahead of MEPC 85', 'eu.com', 'EU vil'],
  ['Ammonia ferry delivered', 'ferry.no', 'Ferje']
].map((x, i) => doc({ id_article: 10 + i, orig_url: 'https://' + x[1] + '/' + i, header: { text: x[0] }, summary: { text: x[2] }, language: { text: 'en' } }));
const ki0 = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: imoDocs }], [], prio);
const si = f.opoint_kj_lagSaker(ki0, null);
si.forEach(x => { x.kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Politikk og regulering' }; });
si[4].kiResultat.kategori = 'Energi og framdrift';
assert.strictEqual(f.opoint_kj_imoSaker(si).length, 4);
const tjI = lagTj(() => JSON.stringify({ grupper: [
  { vinkling: 'Opprop', overskrift: 'Bransjen ber IMO vedta rammeverket', oppsummering: 'Organisasjoner ber om vedtak.', aktorer: ['BIMCO', 'ICS'], prioritet: 'høy', begrunnelse: 'Uttalelser før MEPC 85', saker: [1, 2] },
  { vinkling: 'Analyse', overskrift: 'Bakgrunn om NZF', oppsummering: 'Forklaring.', aktorer: [], prioritet: 'middels', begrunnelse: 'Evergreen', saker: [3] },
  { vinkling: 'Politikk', overskrift: 'EU før MEPC 85', oppsummering: 'EU-posisjon.', aktorer: ['EU'], prioritet: 'høy', begrunnelse: 'Posisjon', saker: [4] }] }));
const vi = f.opoint_kj_imoVinkling(si, tjI, { oldest: Date.UTC(2026, 10, 18) / 1000, newest: Date.UTC(2026, 10, 19) / 1000 });
assert.strictEqual(vi.grupper.length, 3); assert.strictEqual(si[0].imoGruppe.id, 'IMO1'); assert.strictEqual(si[2].imoGruppe.prioritet, 'middels');
assert.ok(tjI.kallListe[0].messages[0].content.includes('|| Kilde:'));
assert.strictEqual(f.opoint_kj_imoVinkling(si, tjI, { oldest: Date.UTC(2026, 11, 6) / 1000, newest: Date.UTC(2026, 11, 7) / 1000 }).grupper.length, 0); // etter 4. des
const inn = f.opoint_kj_sammendragInndata(si.map(x => Object.assign(x, { kiResultat: Object.assign({}, x.kiResultat) })));
assert.ok(inn.some(x => x.sak === 'IMO2' && x.tittel === 'Bakgrunn om NZF')); // middels-gruppe → ett punkt
const ep = f.opoint_kj_byggEpost(si, { setninger: [], inndata: [] }, { oldest: 1, newest: 2 }, fmt, false, { dokumenter: 5, grupper: 5 }, [{}, {}], { visOpprinnelse: true });
assert.ok(ep.html.includes('Bransjen ber IMO vedta rammeverket') && ep.html.includes('Aktører: BIMCO, ICS.'));
assert.ok(/<a href="https:\/\/wpo\.org\/0"[^>]*>wpo\.org \(\d{4}-\d{2}-\d{2}\)<\/a> · <a href="https:\/\/bimco\.org\/1"/.test(ep.html)); // lenker «Kilde (dato)»
assert.ok(!ep.html.includes('§§LENKER')); assert.strictEqual(ep.kort.filter(x => x.imo).length, 2); // to høy-grupper, ingen enkeltkort for IMO-sakene
assert.ok(!ep.html.includes('Explained: what is'));
assert.ok(ep.html.includes('Ammonia ferry delivered') && ep.html.includes('ferry.no [OP]')); // opprinnelse
f.OPOINT_IMO_SAMLING = 'ingen';
assert.strictEqual(f.opoint_kj_imoVinkling(si, tjI, { oldest: 1, newest: 2 }).grupper.length, 0);
f.OPOINT_IMO_SAMLING = 'vinkling';

// --- A1 + A3: header og telling ---
assert.ok(ep.html.includes('Apps Script: ikke kjørt · Opoint: OK (2 søk, 5 artikler, 5 saker)'));

// --- DEL B: vindu ---
const parse = s2 => new Date(Date.parse(s2.replace(' ', 'T') + ':00+01:00'));
const v1 = f.opoint_ft_vindu('', '', Date.parse('2026-11-19T21:30:00+01:00'), parse);
assert.strictEqual(fmt(v1.newest + 3600), '2026-11-19 07:30'); assert.strictEqual(v1.newest - v1.oldest, 86400);
const v2 = f.opoint_ft_vindu('', '', Date.parse('2026-11-20T07:38:00+01:00'), parse);
assert.strictEqual(fmt(v2.newest + 3600), '2026-11-20 07:30');
const v3 = f.opoint_ft_vindu('', '', Date.parse('2026-11-20T07:10:00+01:00'), parse); // 20 min før 07:30 → i dag 07:30
assert.strictEqual(fmt(v3.newest + 3600), '2026-11-20 07:30');
const v4 = f.opoint_ft_vindu('', '', Date.parse('2026-11-20T06:00:00+01:00'), parse);
assert.strictEqual(fmt(v4.newest + 3600), '2026-11-19 07:30');

// --- DEL B: kobling AS ↔ OP ---
const opDocs = [doc({ id_article: 1, orig_url: 'https://www.tu.no/artikler/hydrogenferge/1', header: { text: 'Hydrogenferge bestilt' }, language: { text: 'no' } }),
  doc({ id_article: 2, orig_url: 'https://skipsrevyen.no/x', header: { text: 'Batterifartøy levert' }, language: { text: 'no' },
    identical_documents: { cnt: 1, document: [doc({ id_article: 3, orig_url: 'https://e24.no/batteri', header: { text: 'Batterifartøy levert' } })] } })];
const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: opDocs }], [], prio);
const asTreff = [
  { tittel: 'Hydrogenferge bestilt', lenke: 'https://www.google.com/url?url=https://www.tu.no/artikler/hydrogenferge/1&ct=ga', ingress: 'TU', kilde: 'Google Alerts', matchendeOrd: ['hydrogen'], aiRelevant: true, aiKategori: 'Energi', aiNevnerOss: false, aiNotat: '' },
  { tittel: 'Batterifartøy levert', lenke: 'https://e24.no/batteri', ingress: 'E24', kilde: 'E24', matchendeOrd: ['batteri'], aiRelevant: true, aiNevnerOss: false, aiNotat: '' },
  { tittel: 'Maritime CleanTech lanserer', lenke: 'https://mc.no/1', ingress: 'MC', kilde: 'MC', matchendeOrd: ['Maritime CleanTech'], aiRelevant: true, aiNevnerOss: true, aiNotat: '', dato: new Date() },
  { tittel: 'Gass til oppvarming', lenke: 'https://x.no/gass', ingress: 'Varme', kilde: 'X', matchendeOrd: ['GASS'], aiRelevant: false, aiIrrelevantGrunn: 'Ikke prosjektet GASS', aiNotat: '' }
];
f.opoint_ft_kobleAS(kk, asTreff);
assert.strictEqual(kk.length, 4); assert.strictEqual(kk[0].asTreffListe[0], asTreff[0]); assert.strictEqual(kk[1].asTreffListe[0], asTreff[1]); // URL og identical_documents
assert.ok(kk[2].erAS && kk[3].erAS);
const sk = f.opoint_kj_lagSaker(kk, null);
f.opoint_ft_merkSaker(sk);
assert.ok(sk[0].asTreff && sk[0].harOp); assert.ok(sk[2].asTreff && !sk[2].harOp);
const tjR = lagTj(() => '{"saker": []}');
f.opoint_kj_vurderSaker(sk, { sokeord: [] }, tjR, 0, { oldest: 1, newest: 2 });
assert.strictEqual(tjR.kallListe.length, 0); // AS-saker vurderes ikke på nytt
assert.strictEqual(sk[3].kiResultat.relevant, false);

// --- DEL B: felles e-post ---
const as = { treff: asTreff, kategori: { [asTreff[0].lenke]: 'Hydrogen', [asTreff[1].lenke]: 'Batteri', [asTreff[2].lenke]: 'Om MC', [asTreff[3].lenke]: 'Prosjekter' },
  ok: 48, totalt: 50, feilet: ['Kilde A', 'Kilde B'], hoppet: 0 };
const op = { ok: true, forb: { kandidater: kk, resultater: [{}, {}, {}], klient: { antall: () => 3 }, oppsett: { merknader: [] } }, saker: sk, ki: { kall: 0 }, sm: null };
const fe = f.opoint_ft_byggFellesEpost(as, op, { oldest: 1, newest: 2 }, { fmtSek: fmt }, ['Sammendrag utelatt (tid)']);
assert.ok(fe.html.includes('Apps Script: 48 av 50 kilder hentet OK. 2 feilet: Kilde A, Kilde B · Opoint: OK (3 søk'));
assert.ok(fe.html.includes('Google Alerts [AS+OP]') && fe.html.includes('E24 [AS+OP]') && fe.html.includes('MC [AS]'));
assert.ok(fe.html.includes('Om oss')); // Nevner oss → Om oss
assert.ok(fe.html.includes('Mulig irrelevant</div>') && fe.html.includes('Ikke prosjektet GASS')); // A1: AS-irrelevant vises
assert.ok(fe.html.includes('Sammendrag utelatt (tid)'));
assert.ok(fe.html.includes('hvorav <strong') && fe.html.includes('>1</strong> under «Mulig irrelevant»')); // tellingen stemmer
assert.deepStrictEqual(J(fe.kort.map(x => x.opphav).sort()), ['AS', 'AS', 'AS+OP', 'AS+OP']);
// Opoint feilet: Apps Script alene
const fe2 = f.opoint_ft_byggFellesEpost(as, { ok: false, feil: 'OPOINT_API_KEY mangler', saker: [], ki: { kall: 0 } }, { oldest: 1, newest: 2 }, { fmtSek: fmt }, []);
assert.ok(fe2.html.includes('Opoint feilet: OPOINT_API_KEY mangler')); assert.strictEqual(fe2.kort.length, 4);

// --- DEL B6/C: fanen ---
const rad = f.opoint_ft_byggRader(Object.assign({ aiStat: { antallKall: 2, kostnad: 0.001 } }, as), op, fe, { melding: 'Sendt til TEST_EPOST.', driveUrl: 'u' },
  { oldest: 1, newest: 2 }, { fmtSek: fmt }, { 'Apps Script-henting': 61000, 'Opoint-henting': 95000 }, 240000, ['m'], true);
assert.ok(rad[0].includes('Total kjøretid (s)') && rad[0].includes(240)); assert.ok(rad[1].includes('Apps Script-henting') && rad[1].includes(61));
assert.ok(rad.some(r => r[0] === 'ja' && r[1] === 'AS+OP'));

// --- DEL D: sendte saker og Omtalt tidligere ---
const sr = f.opoint_ft_sendteRader(fe, sk, new Date(Date.UTC(2026, 10, 19, 6, 30)), 'simulert');
assert.ok(sr.length >= 3 && sr.every(r => r.length === 8 && r[7] === 'simulert'));
const data = [f.OPOINT_SENDTE_SAKER_KOLONNER].concat(sr);
const lest = f.opoint_kj_sendteSakerFraRader(data, Date.UTC(2026, 10, 18), Date.UTC(2026, 10, 20));
assert.strictEqual(lest.length, sr.length); assert.ok(lest.some(x => x.normer.includes('e24.no/batteri')));
// Omtalt tidligere via alle URL-er i en tidligere gruppe
const nySak = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ orig_url: 'https://e24.no/batteri', language: { text: 'no' } })] }], []), null);
const om = f.opoint_kj_settOmtaltTidligere(nySak, lest, lagTj(() => '{"treff": []}'));
assert.strictEqual(om.url, 1);

// --- DEL F: utløser ---
const utl = [];
ctx.ScriptApp = { getProjectTriggers: () => utl.slice(), deleteTrigger: t => utl.splice(utl.indexOf(t), 1),
  newTrigger: h => ({ timeBased: () => ({ at: d => ({ create: () => utl.push({ getHandlerFunction: () => h, at: d }) }) }) }) };
f.planleggFellesTest(); f.planleggFellesTest();
assert.strictEqual(utl.length, 1); assert.strictEqual(utl[0].getHandlerFunction(), 'opoint_ft_triggerKjor');
assert.strictEqual(utl[0].at.toISOString(), '2026-11-20T06:35:00.000Z'); // 07:35 Oslo
assert.ok(logg.some(l => l.includes('Satt opp ÉN engangsutløser')));
f.avbrytFellesTest(); assert.strictEqual(utl.length, 0);
console.log('FellesTest og DEL A OK');
