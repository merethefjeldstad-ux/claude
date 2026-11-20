// Node-test av rettelsene etter Felles-testen 19.–20. nov (punkt 1–8). Kjør: node tests/opoint/test_rettelser20.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const ctx = { Logger: { log: () => {} } }; vm.createContext(ctx);
ctx.Utilities = { formatDate: () => 'fredag 20. november 2026', parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1795500000, header: { text: 'x' }, summary: { text: 'Teksten er en hel setning som er lang nok til å telle.' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const lagTj = (svarFn) => { const kall = []; const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
  fetch: b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; } }); t.kallListe = kall; return t; };
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const vindu = { oldest: Date.parse('2026-11-19T07:30:00+01:00') / 1000, newest: Date.parse('2026-11-20T07:30:00+01:00') / 1000 };
const iVinduet = vindu.oldest + 3600;

// ---- 1: Oppfølging ----
assert.strictEqual(f.opoint_kj_urlDato('https://fuelcellsworks.com/2026/11/17/battery/energy-storage-manufacturer-ayk'), '2026-11-17');
assert.strictEqual(f.opoint_kj_urlDato('https://www.ilnautilus.it/trasporti/2026-11-19/econowind-turns-ten_199537/'), '2026-11-19');
assert.strictEqual(f.opoint_kj_urlDato('https://x.com/news/20261117-ayk'), '2026-11-17');
assert.strictEqual(f.opoint_kj_urlDato('https://maritimt.com/econowind-turns-ten'), '');
assert.strictEqual(f.opoint_kj_urlDato('https://www.mdpi.com/2077-1312/14/22/2196'), ''); // ikke en dato
const ayk = doc({ id_article: 1, unix_timestamp: iVinduet, orig_url: 'https://fuelcellsworks.com/2026/11/17/battery/ayk', header: { text: 'AYK Energy wins biggest marine battery contract' } });
const nau = doc({ id_article: 2, unix_timestamp: iVinduet, orig_url: 'https://www.ilnautilus.it/trasporti/2026-11-19/econowind/', header: { text: 'Econowind turns ten' } });
const ks = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [ayk, nau] }], []);
const ss1 = f.opoint_kj_lagSaker(ks, null);
assert.strictEqual(f.opoint_kj_settOppfolging(ss1, vindu), 1);
assert.strictEqual(ss1[0].oppfolging, true); assert.ok(ss1[0].oppfolgingGrunn.includes('2026-11-17'));
assert.strictEqual(ss1[1].oppfolging, false); // samme dag som vindusstart teller ikke
// Apps Script-saker berøres ikke
ss1[0].asTreff = { tittel: 'x' }; f.opoint_kj_settOppfolging(ss1, vindu); assert.strictEqual(ss1[0].oppfolging, false); delete ss1[0].asTreff;
// lesSendte: Sendte saker + Sendte artikler slås sammen (før: bare den ene)
const ark = (rader) => ({ getLastRow: () => rader.length, getDataRange: () => ({ getValues: () => rader }) });
const t17 = new Date(Date.parse('2026-11-18T07:30:00+01:00')), t12 = new Date(Date.parse('2026-11-12T08:00:00+01:00'));
const ssMock = { getSheetByName: n => ({
  'Sendte saker': ark([f.OPOINT_SENDTE_SAKER_KOLONNER, [t17, 'S3', 'https://motorship.com/ayk', 'https://motorship.com/ayk', 'AYK to supply 165 MWh for Molslinjen', 'Rekord', 'høy', 'simulert']]),
  'Sendte artikler': ark([['URL', 'Dato lagt til', 'Overskrift'], ['https://splash247.com/nyk', t12, 'NYK ammonia'], ['https://motorship.com/ayk', t17, 'dobbel']]) })[n] || null };
const lest = f.opoint_kj_lesSendte(ssMock, (vindu.oldest - 7 * 86400) * 1000, vindu.newest * 1000);
assert.strictEqual(lest.length, 2); assert.ok(lest.some(x => x.tittel === 'NYK ammonia'));
// KI: samme hendelse → Oppfølging; ny informasjon → Oppdatering
const nyk = doc({ id_article: 3, unix_timestamp: iVinduet, orig_url: 'https://fullavantenews.com/izanami', header: { text: 'World\'s first ammonia ship named Izanami by NYK' } });
const ss2 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [ayk, nyk] }], []), null);
ss2.forEach(s => { s.oppfolging = false; });
const tjOm = lagTj(() => '{"treff": [{"ny": 1, "tidligere": "T1", "nytt": ""}, {"ny": 2, "tidligere": "T2", "nytt": "Skipet har fått navnet Izanami"}]}');
const om = f.opoint_kj_settOmtaltTidligere(ss2, lest, tjOm);
assert.strictEqual(ss2[0].oppfolging, true); assert.strictEqual(ss2[1].oppfolging, false); assert.strictEqual(om.oppdatering, 1);
assert.ok(tjOm.kallListe[0].system.includes('"nytt"'));
ss2[1].kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Energi og framdrift' };
const ep0 = f.opoint_kj_byggEpost(ss2, null, vindu, fmt, false, {}, []);
assert.ok(ep0.html.includes('Oppdatering: Skipet har fått navnet Izanami')); assert.ok(!ep0.html.includes('AYK Energy wins'));
console.log('1 Oppfølging OK');

// ---- 3: ingress-rens og beste ingress ----
assert.strictEqual(f.opoint_kj_rensIngress("Image Credits: NYK The vessel is the world's first to be adopted with ammonia-fueled engines."),
  "The vessel is the world's first to be adopted with ammonia-fueled engines.");
assert.strictEqual(f.opoint_kj_rensIngress('Published: 19.11.2026 Econowind is celebrating its tenth anniversary.'), 'Econowind is celebrating its tenth anniversary.');
assert.strictEqual(f.opoint_kj_rensIngress('FCW Team · Battery pioneer to supply record-breaking 165MWh'), 'Battery pioneer to supply record-breaking 165MWh');
assert.strictEqual(f.opoint_kj_rensIngress('By Jane Doe · The ferry  was delivered.'), 'The ferry was delivered.');
assert.strictEqual(f.opoint_kj_rensIngress('18-Nov-2026 In a rare move, nine groups wrote to IMO.'), 'In a rare move, nine groups wrote to IMO.');
assert.strictEqual(f.opoint_kj_rensIngress('... maritime Industrie ist.'), 'maritime Industrie ist.');
const fr = f.opoint_kj_vurderIngress('... maritime Industrie ist. Bereits ein ... Das von Maritime CleanTech geleitete Projekt LowNoiser vereint 15 Partner aus Industrie und Forschung.');
assert.deepStrictEqual(J(fr), { tekst: 'Das von Maritime CleanTech geleitete Projekt LowNoiser vereint 15 Partner aus Industrie und Forschung.', god: true });
assert.strictEqual(f.opoint_kj_vurderIngress('FCW Team · Battery pioneer to supply record-breaking 165MWh of battery systems for three ferries for Molslinjen…').god, false);
assert.deepStrictEqual(J(f.opoint_kj_vurderIngress('Lloyd\'s Register has introduced a new fire safety notation for car carriers. It aims at preventing fires from')),
  { tekst: 'Lloyd\'s Register has introduced a new fire safety notation for car carriers.', god: true }); // kuttet til hel setning (≥ 40 tegn)
assert.strictEqual(f.opoint_kj_vurderIngress('the vessel was delivered to the owner yesterday in Spain.').god, false); // liten forbokstav
// Beste ingress i gruppen: lengste gode (FCW-teksten er avkuttet; Motorship har en hel)
const fcw = doc({ id_article: 10, unix_timestamp: iVinduet, orig_url: 'https://fuelcellsworks.com/a', summary: { text: 'FCW Team · Battery pioneer to supply record-breaking 165MWh of battery systems…' } });
const ms = doc({ id_article: 11, unix_timestamp: iVinduet + 10, orig_url: 'https://motorship.com/a', summary: { text: 'AYK Energy will supply 165 MWh of batteries for three Molslinjen fast ferries.' } });
const sg = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [fcw, ms] }], []), { grupper: [[0, 1]] })[0];
const bi = f.opoint_kj_sakIngress(sg);
assert.strictEqual(bi.tekst, 'AYK Energy will supply 165 MWh of batteries for three Molslinjen fast ferries.'); assert.strictEqual(bi.god, true);
// Ingen god → KI-oppsummering «(oppsummert)»
const dårlig = doc({ id_article: 12, orig_url: 'https://fullavantenews.com/x', header: { text: 'Izanami named' }, summary: { text: 'Image Credits: NYK' } });
const sd = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [dårlig] }], []), null);
sd[0].kiResultat = { relevant: true, prioritet: 'høy' };
const tjO = lagTj(() => '{"saker": [{"nr": 1, "oppsummering": "NYK har gitt det ammoniakkdrevne skipet navnet Izanami."}]}');
const opps = f.opoint_kj_lagOppsummeringer(sd, tjO);
assert.strictEqual(opps.antall, 1); assert.strictEqual(f.opoint_kj_visSakIngress(sd[0]), 'NYK har gitt det ammoniakkdrevne skipet navnet Izanami. (oppsummert)');
assert.ok(tjO.kallListe[0].messages[0].content.startsWith('1. Izanami named'));
console.log('3 Ingress OK');

// ---- 2: egne prosjekter deles etter vinkel ----
const asT = [
  { tittel: 'Advances in the EU LowNoiser project', lenke: 'https://ntb.no/lownoiser', ingress: 'LowNoiser brings together 15 partners from industry and research.', kilde: 'Google Alerts', matchendeOrd: ['LOWNOISER'], aiNevnerOss: true, aiRelevant: true },
  { tittel: 'Havila Capella Undergoes Modifications to Reduce Underwater Noise Levels', lenke: 'https://breakingtravelnews.com/havila', ingress: 'Havila Capella is being modified to reduce underwater noise.', kilde: 'Google Alerts', matchendeOrd: ['LOWNOISER'], aiNevnerOss: true, aiRelevant: true },
  { tittel: 'How this cruise ship is lowering engine noise to reduce disturbance to marine life', lenke: 'https://au.news.yahoo.com/cruise', ingress: 'A cruise ship on the Norwegian coast is lowering noise.', kilde: 'Google Alerts', matchendeOrd: ['LOWNOISER'], aiNevnerOss: true, aiRelevant: true },
  { tittel: 'Wie Forschung den Betrieb der Postschiffroute umweltschonender macht', lenke: 'https://forum-csr.net/lownoiser', ingress: 'Das von Maritime CleanTech geleitete Projekt LowNoiser vereint 15 Partner aus Industrie und Forschung.', kilde: 'Google Alerts', matchendeOrd: ['LOWNOISER'], aiNevnerOss: true, aiRelevant: true }
];
const kE = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 20, orig_url: 'https://other.com/ferry', header: { text: 'Ferry ordered' } })] }], []);
f.opoint_ft_kobleAS(kE, asT);
const gr = { grupper: [[0, 1, 2, 3, 4]] };
const tjE = lagTj(() => '{"A": [[2, 5], [3], [4]]}');
const de = f.opoint_kj_delEgneGrupper(kE, gr, tjE);
assert.strictEqual(de.delt, 1); assert.deepStrictEqual(J(gr.grupper), [[1, 4]]); // pressemeldingen (EN+DE) sammen; Havila og cruise egne; ferge alene
assert.ok(tjE.kallListe[0].messages[0].content.includes('GRUPPE A\n1. Ferry ordered'));
const sE = f.opoint_kj_lagSaker(kE, gr); f.opoint_ft_merkSaker(sE);
assert.strictEqual(sE.length, 4);
const asListe = sE.filter(s => s.asTreff).map(s => ({ treff: s.asTreff, sak: s, kategori: 'Om oss' }));
const epE = f.opoint_kj_byggEpost(sE, null, vindu, fmt, false, {}, [], { asTreff: asListe });
assert.ok(epE.html.includes('Havila Capella Undergoes') && epE.html.includes('How this cruise ship') && epE.html.includes('Advances in the EU LowNoiser'));
assert.strictEqual(epE.kort.length, 3);
// Fanen: alle AS-treff med sak og kort
const radAs = f.opoint_ft_raderAsTreff({ treff: asT }, { saker: sE, egne: de, forb: { kandidater: kE } }, epE.kort);
assert.strictEqual(radAs.filter(r => asT.some(t => t.tittel === r[0])).length, 4);
assert.ok(radAs.some(r => r[0].startsWith('Wie Forschung') && r[7].startsWith('samme kort')));
assert.ok(!radAs.some(r => r[7] === 'INGEN KORT'));
// KI feiler → gruppen beholdes (merknad)
const gr2 = { grupper: [[0, 1, 2, 3, 4]] };
assert.ok(f.opoint_kj_delEgneGrupper(kE, gr2, lagTj(() => 'beklager')).melding.includes('IKKE delt')); assert.deepStrictEqual(J(gr2.grupper), [[0, 1, 2, 3, 4]]);
console.log('2 Egne vinkler OK');

// ---- 5: prioritet ----
const regler = f.opoint_kj_prioritetRegler(vindu);
assert.ok(regler.includes('"høy" KUN når') && regler.includes('regionale eller kommunale prosjekter uten norsk kobling') && regler.includes('jubileer'));
assert.ok(regler.includes('IMO Net-Zero Framework')); assert.strictEqual(f.OPOINT_KJ_KI_PROMPTVERSJON, 'opoint-4');
console.log('5 Prioritet OK');

// ---- 6: sammendrag: avkuttet svar berges, større max_tokens ----
const inn = [{ nr: 1, sak: 'S6', url: 'u1', kilde: 'A' }, { nr: 2, sak: 'S7', url: 'u2', kilde: 'B' }];
const avk = '{"setninger": [{"tekst": "Blå ammoniakk kan bli mer attraktiv med forutsigbare priser.", "sak": 1}, {"tekst": "Etanol gir lavere ab';
const tt = f.opoint_kj_tolkSammendrag(avk, inn);
assert.strictEqual(tt.length, 1); assert.strictEqual(tt[0].sak, 'S6');
assert.strictEqual(f.OPOINT_KJ_SAMMENDRAG_MAX_TOKENS, 1500);
// Bare middels som sto i sammendraget logges som sendt
const sm1 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 30, orig_url: 'https://a.com/1' }), doc({ id_article: 31, orig_url: 'https://b.com/1' })] }], []), null);
sm1.forEach(s => { s.kiResultat = { relevant: true, prioritet: 'middels' }; });
const sr = f.opoint_ft_sendteRader({ kort: [] }, sm1, new Date(), 'ekte', { setninger: [{ sak: sm1[1].id }] });
assert.strictEqual(sr.length, 1); assert.strictEqual(sr[0][1], sm1[1].id);
console.log('6 Sammendrag OK');

// ---- 4: representant-tabell ----
sg.kiResultat = { relevant: true, prioritet: 'høy' };
const rr = f.opoint_ft_raderRepresentant({ saker: [sg] }, [{ sak: sg.id }], { fmtSek: fmt });
assert.strictEqual(rr.length, 2 + 2); assert.ok(rr.some(r => r[8] === 'JA' && r[2] === 'fuelcellsworks.com')); // likt nivå 3, likt Åpen → tidligst
console.log('4 Representant OK');

// ---- 7 og 8: recall-fasit og header ----
assert.strictEqual(f.opoint_ft_fasitFor(vindu, { fmtSek: fmt }), '20'); assert.strictEqual(f.OPOINT_KJ_RECALL_FASIT['20'].saker.length, 8);
assert.strictEqual(f.opoint_ft_fasitFor({ oldest: vindu.oldest + 86400, newest: vindu.newest + 86400 }, { fmtSek: fmt }), '');
assert.ok(fs.readFileSync(__dirname + '/../../FellesTest.gs', 'utf8').includes("' søk, ' + st.dokumenter + ' artikler, ' + st.grupper + ' saker)'"));
console.log('7–8 OK');
console.log('Alle rettelser 20. nov OK');
