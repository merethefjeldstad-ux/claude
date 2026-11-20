// Node-test av v2 (DEL 1–5) etter Felles-test v2 19.–20. nov. Kjør: node tests/opoint/test_v2.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const ctx = { Logger: { log: () => {} } }; vm.createContext(ctx);
ctx.Utilities = { formatDate: () => 'fredag 20. november 2026', parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1795500000, header: { text: 'x' }, summary: { text: '' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const lagTj = (svarFn) => { const kall = []; const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x,
  fetch: b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b, kall.length) }] }) }; } }); t.kallListe = kall; return t; };
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const vindu = { oldest: Date.parse('2026-11-19T07:30:00+01:00') / 1000, newest: Date.parse('2026-11-20T07:30:00+01:00') / 1000 };
const prio = { kart: {}, kilder: {} };

// ---- DEL 1a: søppelmønstre ----
['Want to bookmark your favourite articles and stories to read or reference later?', 'We use cookies to improve your experience.',
  'Subscribe to our newsletter', 'Sign up for free', 'Log in to read', 'Share this article', 'Related: other news', 'Click here to download',
  'Advertisement The ferry', '© 2026 Example', 'All rights reserved.'].forEach(t => assert.ok(f.opoint_kj_soppel(t), t));
assert.strictEqual(f.opoint_kj_soppel('The ferry was delivered to Molslinjen in Denmark after sea trials.'), '');
assert.strictEqual(f.opoint_kj_rensTittel('Energy Zeno Power Completes Seabed Test of Nuclear Battery Prototype Contributor Nov 19, 2026 8 min read The Demonstration'),
  'Energy Zeno Power Completes Seabed Test of Nuclear Battery Prototype');
assert.strictEqual(f.opoint_kj_vurderIngress('Short text that ends.').god, false); // under 80 tegn

// ---- DEL 1b/c: Havila Capella – første gode medlem i representantrekkefølgen ----
const havila = [
  doc({ id_article: 1, unix_timestamp: 1795500100, orig_url: 'https://www.breakingtravelnews.com/havila', header: { text: 'Havila Capella Undergoes Modifications to Reduce Underwater Noise Levels' },
    summary: { text: 'How this cruise ship is lowering engine noise to reduce disturbance to marine life Want to bookmark your favourite articles and stories to read or reference later?' } }),
  doc({ id_article: 2, unix_timestamp: 1795500200, orig_url: 'https://luminews.my/havila', header: { text: 'How this cruise ship is lowering engine noise to reduce disturbance to marine life' },
    summary: { text: 'Havila Voyages has begun modifications on Havila Capella to reduce underwater noise as part of the EU research project LowNoiser.' } }),
  doc({ id_article: 3, unix_timestamp: 1795500300, orig_url: 'https://wisevoter.com/havila', header: { text: 'Havila Voyages Adds Underwater Noise-Reduction Tech' },
    summary: { text: 'Havila Voyages adds a much longer description of underwater noise reduction technology on board its coastal ships, with measurements planned.' } })
];
const kh = f.opoint_kj_dedup([{ strom: 'A', navn: 'A LOWNOISER', searchterm: 'x', dokumenter: havila }], [], prio);
const sh = f.opoint_kj_lagSaker(kh, { grupper: [[0, 1, 2]] })[0];
assert.ok(sh.representant.domene.includes('breakingtravelnews'));
const ih = f.opoint_kj_sakIngress(sh);
assert.strictEqual(ih.fra, 'luminews.my'); assert.ok(ih.tekst.startsWith('Havila Voyages has begun')); // neste i rekkefølgen, ikke lengste
assert.ok(!f.opoint_kj_visSakIngress(sh).includes('bookmark'));
const kand = f.opoint_kj_ingressKandidater(sh);
assert.strictEqual(kand[0].grunn, 'søppel: bookmark');
console.log('DEL 1 OK');

// ---- DEL 2: eksplisitt vindu er alltid historisk ----
const t0 = Date.parse('2026-11-20T09:02:00+01:00');
assert.strictEqual(f.opoint_ft_erHistorisk('2026-11-19 07:30', '2026-11-20 07:30', vindu, t0), true);   // v2 ble regnet som «ekte» før
assert.strictEqual(f.opoint_ft_erHistorisk('', '', vindu, Date.parse('2026-11-20T07:38:00+01:00')), false); // utløseren: ekte
// Apps Script-treff (TankerLink, Postschiff, Gemini) får kort når de finnes
const asT = [
  { tittel: 'TankerLink: Shore Power For Tankers', lenke: 'https://www.hellenicshippingnews.com/tankerlink-shore-power-for-tankers/', ingress: 'Today we are introducing TankerLink, our new product line of cable management systems that can connect all tanker types to shore power.', kilde: 'Hellenic Shipping News', matchendeOrd: ['shore power'], aiRelevant: true, aiNevnerOss: false, aiNotat: '' },
  { tittel: 'Postschiff nimmt künftig in jedem Hafen Autos an Bord - Nordisch.info', lenke: 'https://www.nordisch.info/postschiff', ingress: 'Ob das gelingt, den Unterwasserlärm zu verringern, sollen Messungen im Rahmen des EU-Forschungsprojekts LowNoiser im ersten Quartal 2027 zeigen.', kilde: 'LOWNOISER', matchendeOrd: ['LOWNOISER'], aiRelevant: true, aiNevnerOss: true, aiNotat: '' },
  { tittel: 'Gemini 4 Hydrogen : 90% of a Flagship for 37% of the Price - YouTube', lenke: 'https://youtube.com/x', ingress: '', kilde: 'FLAGSHIPS', matchendeOrd: ['FLAGSHIPS'], aiRelevant: false, aiIrrelevantGrunn: 'Ikke maritimt', aiNevnerOss: false, aiNotat: '' }
];
const opT = [doc({ id_article: 9, orig_url: 'https://www.hellenicshippingnews.com/tankerlink-shore-power-for-tankers/', header: { text: 'TankerLink: Shore Power For Tankers' } })];
const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: opT }], [], prio);
f.opoint_ft_kobleAS(kk, asT);
const sk = f.opoint_kj_lagSaker(kk, null); f.opoint_ft_merkSaker(sk);
sk[0].kiResultat = { relevant: true, prioritet: 'lav' }; // Opoint sa «lav» – AS-treffet vises likevel
f.opoint_kj_vurderSaker(sk, { sokeord: [] }, lagTj(() => '{"saker": []}'), 0, vindu);
const as = { treff: asT, kategori: {}, ok: 47, totalt: 50, feilet: [], hoppet: 0 };
const op = { ok: true, forb: { kandidater: kk, resultater: [{}], klient: {}, oppsett: { merknader: [] } }, saker: sk, ki: { kall: 0 }, sm: null };
const fe = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, []);
assert.strictEqual(fe.kort.length, 2); // Felles DEL 2a: Postschiff (tysk) får ikke eget kort
assert.ok(fe.html.includes('TankerLink: Shore Power For Tankers') && !fe.html.includes('Postschiff nimmt') && fe.html.includes('Gemini 4 Hydrogen'));
assert.ok(fe.html.includes('Mulig irrelevant</div>')); // 2c
op.fremmed = f.opoint_ft_fordelFremmedspraak(op, fe.kort, null, asT);
assert.strictEqual(op.fremmed.omOss.length, 1); assert.strictEqual(op.fremmed.omOss[0].navn, 'nordisch.info (de)');
const feF = f.opoint_ft_byggFellesEpost(as, op, vindu, { fmtSek: fmt }, []);
assert.ok(/Også omtalt på tysk: <a href="https:\/\/www\.nordisch\.info\/postschiff"[^>]*>nordisch\.info \(de\)<\/a>/.test(feF.html));
assert.ok(feF.tekst.includes('Også omtalt på tysk: nordisch.info (de) https://www.nordisch.info/postschiff'));
delete op.fremmed;
console.log('DEL 2 OK');

// ---- DEL 4: «Kun test»-boks og arkivlenke ----
const s4 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 40, orig_url: 'https://a.com/1' }), doc({ id_article: 41, orig_url: 'https://b.com/1' })] }], []), null);
s4[0].kiResultat = { relevant: true, prioritet: 'lav' }; s4[1].kiResultat = { relevant: false };
const e4 = f.opoint_kj_byggEpost(s4, null, vindu, fmt, false, {}, [], { visTestinfo: true });
assert.ok(e4.html.includes('<strong>Kun test</strong><br>1 øvrige treff med lav prioritet.<br>1 Opoint-treff vurdert som irrelevante.'));
assert.ok(!f.opoint_kj_byggEpost(s4, null, vindu, fmt, false, {}, [], {}).html.includes('Kun test')); // standard: av
assert.ok(e4.html.indexOf('Kun test') > e4.html.indexOf('Spørsmål? Ta kontakt')); // nederst, under bunnteksten
const e4b = f.opoint_kj_byggEpost(s4, null, vindu, fmt, false, {}, [], { visTestinfo: false, arkivUrl: 'https://arkiv.example/x' });
assert.ok(!e4b.html.includes('arkfanen') && !e4b.tekst.includes('arkfanen')); assert.ok(e4b.html.includes('Se alle treff i arkivet'));
console.log('DEL 4 OK');

// ---- DEL 3: kontroll-lesing ----
const sk3 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [
  doc({ id_article: 50, orig_url: 'https://a.com/50', header: { text: 'Ferry ordered in Norway' }, summary: { text: 'Click here to read more about this.' } }),
  doc({ id_article: 51, orig_url: 'https://b.com/51', header: { text: 'Ferry ordered in Norway' }, summary: { text: 'Fjord1 has ordered two battery-electric ferries from a Norwegian yard for delivery in 2028, according to the company.' } }),
  doc({ id_article: 52, orig_url: 'https://c.com/52', header: { text: 'Kettle review' }, summary: { text: 'The best electric kettles for your kitchen this winter, tested by our editors over several weeks of use.' } }),
  doc({ id_article: 53, orig_url: 'https://d.com/53', header: { text: 'Toaster review' }, summary: { text: 'The best toasters for your kitchen this winter, tested by our editors over several weeks of daily use at home.' } }),
  doc({ id_article: 54, orig_url: 'https://e.com/54', header: { text: 'Blender review' }, summary: { text: 'The best blenders for your kitchen this winter, tested by our editors over several weeks of daily use at home.' } })
] }], [], prio), { grupper: [[0, 1]] });
sk3.forEach(s => { s.kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Annet', notat: '' }; });
sk3[0].ingressOverstyrt = { tekst: 'Click here to read more about this ferry order and the yard.', fra: 'a.com', god: true }; // simulerer dårlig valgt ingress
const sm3 = { setninger: [{ tekst: 'Ferger bestilt.', sak: 'S1', url: 'u', kilde: 'A' }, { tekst: 'Oppdiktet setning.', sak: 'S2', url: 'u2', kilde: 'B' }], inndata: [] };
const ep3 = f.opoint_kj_byggEpost(sk3, sm3, vindu, fmt, false, {}, [], {});
assert.deepStrictEqual(J(ep3.kort.map(k => k.id)), ['K1', 'K2', 'K3', 'K4']);
const tj3 = lagTj(() => JSON.stringify({ funn: [
  { id: 'K2', problem: 'Kjøkkenapparat, tydelig irrelevant', alvorlighet: 'kritisk', forslag: 'fjern_kort' },
  { id: 'K3', problem: 'Irrelevant', alvorlighet: 'kritisk', forslag: 'fjern_kort' },
  { id: 'K4', problem: 'Irrelevant', alvorlighet: 'kritisk', forslag: 'fjern_kort' },
  { id: 'S2', problem: 'Kan ikke belegges', alvorlighet: 'kritisk', forslag: 'fjern_setning' }] }));
delete sk3[0].ingressOverstyrt;
const ep3b = f.opoint_kj_byggEpost(sk3, sm3, vindu, fmt, false, {}, [], {});
ep3b.kort[0].ingress = 'Click here to read more about this.'; // kortet slik det ble bygget med dårlig ingress
const kl = f.opoint_ft_kontrollLes({ epost: ep3b, saker: sk3, sm: sm3, tjeneste: tj3, vindu: vindu, d: { fmtSek: fmt } });
assert.strictEqual(kl.overstyr.ingress.K1.startsWith('Fjord1 has ordered'), true);   // steg 1: regel → bytt_ingress
assert.deepStrictEqual(J(kl.overstyr.fjern), { K2: true, K3: true });                     // maks 2
assert.strictEqual(kl.overstyr.flagget, 3); assert.deepStrictEqual(J(kl.overstyr.fjernSetning), { 1: true });
assert.ok(kl.logg.some(x => x.handling.includes('maks 2')));
assert.ok(tj3.kallListe[0].messages[0].content.includes('K1 | kategori:') && tj3.kallListe[0].messages[0].content.includes('S2: Oppdiktet setning.'));
const ep3c = f.opoint_kj_byggEpost(sk3, sm3, vindu, fmt, false, {}, [], { kontroll: kl.overstyr });
assert.strictEqual(ep3c.kort.length, 2); assert.strictEqual(ep3c.fjernet.length, 2); assert.ok(!ep3c.html.includes('Oppdiktet setning'));
assert.ok(ep3c.html.includes('Fjord1 has ordered'));
// «Om oss» fjernes aldri
const tjO = lagTj(() => '{"funn": [{"id": "K1", "problem": "x", "alvorlighet": "kritisk", "forslag": "fjern_kort"}]}');
const epO = f.opoint_kj_byggEpost(sk3, null, vindu, fmt, false, {}, [], {}); epO.kort[0].kategori = 'Om oss';
assert.deepStrictEqual(J(f.opoint_ft_kontrollLes({ epost: epO, saker: sk3, sm: null, tjeneste: tjO, vindu, d: { fmtSek: fmt } }).overstyr.fjern), {});
// KI-feil: sendes uten kontroll, rårespons i «KI-feil»
const tjF = lagTj(() => 'Beklager, jeg kan ikke');
const klF = f.opoint_ft_kontrollLes({ epost: epO, saker: sk3, sm: null, tjeneste: tjF, vindu, d: { fmtSek: fmt } });
assert.ok(klF.melding.startsWith('KI-kontroll feilet')); assert.strictEqual(tjF.kiFeil[0].raa, 'Beklager, jeg kan ikke');
console.log('DEL 3 OK');

// ---- DEL 5: Beholdt/droppet ----
const rb = f.opoint_ft_raderBeholdt({ treff: [] }, { saker: sk3, forb: { kandidater: [] } }, ep3c);
assert.ok(rb.some(r => r[0] === 'droppet' && r[3] === 'kontroll-lesing'));
assert.ok(rb.some(r => r[0] === 'beholdt' && r[3] === 'høy'));
const rb2 = f.opoint_ft_raderBeholdt(as, op, fe);
assert.ok(rb2.some(r => r[0] === 'beholdt' && r[3] === 'Apps Script (Mulig irrelevant)'));
console.log('DEL 5 OK');
console.log('Alle v2-tester OK');

// ---- Felles-prompt DEL 1c: ingen meta-språk ----
(function () {
  ['opoint_kj_kiSystem'].forEach(n => assert.ok(f[n]({ oldest: 1, newest: 2 }).includes('«er nevnt i» er forbudt')));
  [f.OPOINT_KJ_OPPS_SYSTEM, f.OPOINT_KJ_SAMMENDRAG_SYSTEM, f.OPOINT_IMO_SYSTEM, f.OPOINT_KJ_OMTALT_SYSTEM].forEach(p => assert.ok(p.includes('Ingen meta-språk')));
  assert.ok(f.OPOINT_KJ_META_RE.test('LowNoiser-prosjektet er nevnt i ingressen.')); assert.ok(f.OPOINT_KJ_META_RE.test('Artikkelen beskriver …'));
  assert.ok(!f.OPOINT_KJ_META_RE.test('LowNoiser samler 15 partnere fra industri og forskning.'));
  const s = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 70, orig_url: 'https://m.com/1', header: { text: 'LowNoiser' }, summary: { text: 'LowNoiser brings together fifteen partners from industry and research to reduce underwater noise from ships.' } })] }], [], prio), null);
  s[0].kiResultat = { relevant: true, prioritet: 'høy', kategori: 'Annet', notat: 'LowNoiser-prosjektet er nevnt i ingressen.' };
  const ep = f.opoint_kj_byggEpost(s, { setninger: [{ tekst: 'Artikkelen handler om støy.', sak: 'S1', url: 'u', kilde: 'M' }], inndata: [] }, vindu, fmt, false, {}, [], {});
  const kl = f.opoint_ft_kontrollLes({ epost: ep, saker: s, sm: null, tjeneste: lagTj(() => '{"funn": []}'), vindu, d: { fmtSek: fmt } });
  assert.ok(kl.logg.some(x => x.problem === 'Meta-språk i KI-notatet') && kl.logg.some(x => x.problem === 'Meta-språk i sammendraget'));
  console.log('Felles-prompt 1c OK');
})();
