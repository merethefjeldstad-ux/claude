// Node-test av Felles-prompt DEL 2 og DEL 6 (backfill). Kjør: node tests/opoint/test_backfill.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const ctx = { Logger: { log: () => {} } }; vm.createContext(ctx);
const osloDag = t => new Date(t.getTime() + 3600e3).toISOString().slice(0, 10);
ctx.Utilities = { formatDate: (t, tz, f) => f === 'yyyy-MM-dd' ? osloDag(t) : 'onsdag 18. november 2026', parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')), sleep: () => {} };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const d = { fmtSek: fmt };

// ---- Tolking av sendt e-post (originalen 18. nov, ren tekst) ----
const ep18 = `MEDIEOVERVÅKING MARITIME CLEANTECH - Wednesday 18. November 2026

5 treff i dag, hvorav 1 under "Mulig irrelevant".
47 av 50 kilder hentet OK. 3 kilde(r) feilet: Dagens Naeringsliv, World Ports Organization, Stortinget.

== Energi og fremdrift ==
Sustainable Shipping Initiative and partners target ‘blue shipping corridors’
Kilde: Hellenic Shipping News | Søkeord: sustainable shipping
Sustainable Shipping Initiative (SSI) oppfordrer myndigheter til å etablere «blå skipsfartskorridorer».
Les saken: https://www.hellenicshippingnews.com/ssi-blue/

== Om oss ==
Advances in the EU LowNoiser project: How research is reducing the environmental impact ...
Nevner oss | Kilde: Maritime CleanTech | Søkeord: Maritime CleanTech, LOWNOISER
EU-prosjektet LowNoiser ledes av Maritime CleanTech og samler 15 partnere. Overskriften peker på at forskningen skal bidra.
Les saken: https://www.google.com/url?url=https://kommunikasjon.ntb.no/lownoiser&ct=ga

Havila Voyages: Forschungsprojekt macht Betrieb umweltschonender - cruise4news
Nevner oss | Kilde: Maritime CleanTech | Søkeord: Maritime CleanTech, LOWNOISER
Forskningsprosjektet LowNoiser, ledet av Maritime CleanTech, samler 15 partnere.
Les saken: https://www.google.com/url?url=https://www.cruise4news.at/218634/havila&ct=ga

Får 900.000 til å hjelpe næringslivet - fjt.no
Nevner oss | Kilde: Maritime CleanTech | Søkeord: Maritime CleanTech
Det er tildelt 900.000 kroner til å hjelpe næringslivet. Ingressen lister opp flere aktører.
AI-notat: Beløpet er 900.000 kroner; avsender er ikke oppgitt i ingressen.
Les saken: https://www.google.com/url?url=https://www.fjt.no/900&ct=ga

== Mulig irrelevant ==
LNG-tankskip skal ha sunket utenfor Bulgaria – mannskapet berget (Kilde: Aftenposten)
Skipsforlis med LNG-last, ikke nullutslippsløsninger
https://www.aftenposten.no/lng

---
Denne e-posten sendes automatisk hver morgen av medieovervåkingsskriptet.`;
const t18 = f.opoint_ft_tolkEpostTekst(ep18);
assert.strictEqual(t18.antallTreff, 5); assert.strictEqual(t18.antallIrrelevant, 1); assert.strictEqual(t18.ok, 47); assert.strictEqual(t18.totalt, 50);
assert.deepStrictEqual(J(t18.feilet), ['Dagens Naeringsliv', 'World Ports Organization', 'Stortinget']);
assert.strictEqual(t18.kort.length, 5);
assert.deepStrictEqual(J(t18.kort.map(k => k.kategori)), ['Energi og fremdrift', 'Om oss', 'Om oss', 'Om oss', 'Mulig irrelevant']);
assert.ok(t18.kort[1].nevnerOss && t18.kort[1].sokeord.join() === 'Maritime CleanTech,LOWNOISER');
assert.strictEqual(t18.kort[3].notat, 'Beløpet er 900.000 kroner; avsender er ikke oppgitt i ingressen.');
assert.ok(t18.kort[4].irrelevant && t18.kort[4].kilde === 'Aftenposten' && t18.kort[4].url === 'https://www.aftenposten.no/lng' && t18.kort[4].grunn.startsWith('Skipsforlis'));
// Fellesversjonen (20. nov) med opprinnelse
const tF = f.opoint_ft_tolkEpostTekst('9 treff i dag, hvorav 1 under "Mulig irrelevant".\nApps Script: 47 av 50 kilder hentet OK. 3 feilet: A, B, C · Opoint: OK (35 søk)\n\n== Havn ==\nTankerLink\nKilde: Hellenic Shipping News [AS+OP] | Søkeord: shore power\nTekst.\nLes saken: https://h.com/t\n\nTMC\nKilde: Hellenic Shipping News [OP] | Søkeord: methanol\nX.\nLes saken: https://h.com/tmc\n\n== Mulig irrelevant ==\nGemini 4 Hydrogen - YouTube (Kilde: FLAGSHIPS [AS])\nGenerell KI-modell\nhttps://y.com/g\n\n---\nfot');
assert.strictEqual(tF.ok, 47); assert.deepStrictEqual(J(tF.feilet), ['A', 'B', 'C']);
assert.deepStrictEqual(J(tF.kort.map(k => [k.kilde, k.opphav])), [['Hellenic Shipping News', 'AS+OP'], ['Hellenic Shipping News', 'OP'], ['FLAGSHIPS', 'AS']]);
console.log('Tolking av e-post OK');

// ---- Mock-regneark ----
const lagArk = (rader) => {
  const a = { rader: rader.map(r => r.slice()) };
  a.getLastRow = () => a.rader.length;
  a.getDataRange = () => ({ getValues: () => a.rader.map(r => r.slice()) });
  a.getRange = (r, c, nr, nc) => ({
    getValues: () => a.rader.slice(r - 1, r - 1 + (nr || 1)).map(x => { const y = x.slice(c - 1, c - 1 + (nc || 1)); while (y.length < (nc || 1)) y.push(''); return y; }),
    setValues: v => { v.forEach((rad, i) => { a.rader[r - 1 + i] = a.rader[r - 1 + i] || []; rad.forEach((x, j) => { a.rader[r - 1 + i][c - 1 + j] = x; }); }); },
    setNumberFormat: () => {} });
  a.deleteRow = n => a.rader.splice(n - 1, 1);
  a.deleteRows = (n, k) => a.rader.splice(n - 1, k);
  return a;
};
const T = s => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00'));
const faner = {
  'Sendte artikler': lagArk([['URL', 'Dato lagt til', 'Overskrift', 'AI Relevant', 'AI Notat'],
    ['https://www.aftenposten.no/lng', T('2026-11-18 07:09'), 'LNG-tankskip skal ha sunket utenfor Bulgaria – mannskapet berget', 'nei', ''],
    ['https://www.google.com/url?url=https://kommunikasjon.ntb.no/lownoiser&ct=ga', T('2026-11-18 07:09'), 'Advances in the EU LowNoiser project: How research is reducing the environmental impact ...', 'ja', ''],
    ['https://www.google.com/url?url=https://www.cruise4news.at/218634/havila&ct=ga', T('2026-11-18 07:09'), 'Havila Voyages: Forschungsprojekt macht Betrieb umweltschonender - cruise4news', 'ja', ''],
    ['https://www.google.com/url?url=https://www.fjt.no/900&ct=ga', T('2026-11-18 07:09'), 'Får 900.000 til å hjelpe næringslivet - fjt.no', 'ja', 'Beløpet er 900.000 kroner; avsender er ikke oppgitt i ingressen.'],
    ['https://www.hellenicshippingnews.com/ssi-blue/', T('2026-11-18 07:09'), 'Sustainable Shipping Initiative and partners target ‘blue shipping corridors’', 'ja', ''],
    ['https://x.com/19', T('2026-11-19 07:08'), 'Annen dag', 'ja', '']]),
  'Artikkellogg': lagArk([f.ARTIKKELLOGG_OVERSKRIFTER, [T('2026-11-18 07:09'), f.normaliserUrlForLogging('https://www.aftenposten.no/lng'), 'Aftenposten', 'GASS', 'LNG', '', '', '', 'Ikke relevant', 'Nei']]),
  'Søkeord': null
};
const ss = { getSheetByName: n => faner[n] || null, insertSheet: n => (faner[n] = lagArk([])) };
f.hentSokeord = () => [{ sokeord: 'sustainable shipping', kategori: 'Energi og fremdrift' }];
let gmailTekst = ep18;
f.GmailApp = { search: (q) => /Medieovervåking Maritime CleanTech/.test(q) && gmailTekst ? [{ getMessages: () => [{ getSubject: () => 'Medieovervåking Maritime CleanTech (test) - 18.11.2026', getDate: () => T('2026-11-18 07:09'), getPlainBody: () => gmailTekst }] }] : [] };
const v18 = f.opoint_ft_backfillVindu('2026-11-18');
assert.strictEqual(fmt(v18.oldest) + ' – ' + fmt(v18.newest), '2026-11-17 07:30 – 2026-11-18 07:30');
const as18 = f.opoint_ft_asFraSendte(ss, '2026-11-18', v18, d);
assert.strictEqual(as18.sendteAntall, 5); assert.strictEqual(as18.epostAntall, 5); assert.strictEqual(as18.treff.length, 5); assert.deepStrictEqual(J(as18.avvik), []);
const lng = as18.treff.find(t => /LNG/.test(t.tittel));
assert.strictEqual(lng.aiRelevant, false); assert.strictEqual(lng.kilde, 'Aftenposten'); assert.ok(lng.aiIrrelevantGrunn.startsWith('Skipsforlis'));
const ln = as18.treff.find(t => /Advances/.test(t.tittel));
assert.ok(ln.aiNevnerOss && ln.aiRelevant === true && as18.kategori[ln.lenke] === 'Om oss' && ln.aiSammendrag.startsWith('EU-prosjektet'));
assert.strictEqual(as18.ok, 47); assert.strictEqual(as18.kategori['https://www.hellenicshippingnews.com/ssi-blue/'], 'Energi og fremdrift');
// Uten e-post: fanene alene, kategori fra Søkeord
gmailTekst = '';
const as18b = f.opoint_ft_asFraSendte(ss, '2026-11-18', v18, d);
assert.strictEqual(as18b.treff.length, 5); assert.ok(as18b.merknader.some(m => m.includes('Fant ikke den sendte e-posten')));
gmailTekst = ep18;
// Felles e-post: språkregel – cruise4news (de) får ikke eget kort, meta-språk renses
const kk = f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [] }], []);
f.opoint_ft_kobleAS(kk, as18.treff);
const sk = f.opoint_kj_lagSaker(kk, null); f.opoint_ft_merkSaker(sk);
const op = { ok: true, forb: { kandidater: kk, resultater: [], klient: {}, oppsett: { merknader: [] } }, saker: sk, ki: { kall: 0 }, sm: null };
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const tjN = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x, fetch: () => ({ status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: '{"saker": []}' }] }) }) });
f.opoint_kj_vurderSaker(sk, { sokeord: [] }, tjN, 0, v18);
const fe = f.opoint_ft_byggFellesEpost(as18, op, v18, d, []);
assert.strictEqual(fe.kort.length, 4); // 5 sendt, cruise4news er tysk
assert.ok(!fe.html.includes('Forschungsprojekt macht'));
assert.ok(!/Overskriften peker|Ingressen lister/.test(fe.html)); // meta-språk fjernet fra originalens sammendrag
assert.ok(fe.html.includes('Det er tildelt 900.000 kroner til å hjelpe næringslivet.'));
assert.ok(fe.html.includes('Mulig irrelevant</div>') && fe.html.includes('LNG-tankskip'));
op.fremmed = f.opoint_ft_fordelFremmedspraak(op, fe.kort, null, as18.treff);
const lnKort = fe.kort.find(k => /Advances/.test(k.tittel));
assert.deepStrictEqual(J(Object.keys(op.fremmed.perKort)), [lnKort.id]); // regel: LowNoiser i begge titler → samme kort
const fe2 = f.opoint_ft_byggFellesEpost(as18, op, v18, d, []);
assert.ok(/Også omtalt: <a href="[^"]*cruise4news[^"]*"[^>]*>cruise4news\.at \(de\)<\/a>/.test(fe2.html));
assert.ok(!/arkfane/i.test(fe2.html + fe2.tekst));
console.log('Apps Script fra sendte artikler OK');

// ---- Backfill-status ----
assert.deepStrictEqual(J(f.opoint_ft_nesteBackfill({})), { dag: '2026-11-16', forste: true, siste: false });
assert.strictEqual(f.opoint_ft_nesteBackfill({ '2026-11-16': { status: 'ferdig' }, '2026-11-17': { status: 'feilet' } }).dag, '2026-11-17');
assert.ok(f.opoint_ft_nesteBackfill({ '2026-11-17': { status: 'ferdig' } }).dag === '2026-11-16'); // 16 først
assert.ok(f.opoint_ft_nesteBackfill({ '2026-11-16': { status: 'ferdig' }, '2026-11-17': { status: 'ferdig' }, '2026-11-18': { status: 'ferdig' }, '2026-11-19': { status: 'ferdig' } }).nekt.includes('Alle'));
// D–1 ikke ferdig → nekt (19 kan ikke kjøres når 18 mangler, selv om 16–17 er ferdige og 19 står som feilet)
const n2 = f.opoint_ft_nesteBackfill({ '2026-11-16': { status: 'ferdig' }, '2026-11-17': { status: 'ferdig' }, '2026-11-19': { status: 'feilet' } });
assert.strictEqual(n2.dag, '2026-11-18');
// Forberedelse: simulert/backfill slettes, 20. nov parkeres, og legges tilbake
faner['Sendte saker'] = lagArk([f.OPOINT_SENDTE_SAKER_KOLONNER,
  [T('2026-11-17 07:30'), 'S1', 'u1', 'u1', 'a', '', 'høy', 'simulert'],
  [T('2026-11-18 07:30'), 'S2', 'u2', 'u2', 'b', '', 'høy', 'backfill'],
  [T('2026-11-20 07:38'), 'S3', 'u3', 'u3', 'c', '', 'høy', 'ekte'],
  [T('2026-11-15 07:38'), 'S4', 'u4', 'u4', 'd', '', 'høy', 'ekte']]);
const fb = f.opoint_ft_forberedBackfill(ss);
assert.deepStrictEqual(J(fb), { slettet: 2, parkert: 1 }); assert.strictEqual(faner['Sendte saker'].rader.length, 2);
assert.strictEqual(faner['Sendte saker – parkert'].rader.length, 2);
assert.strictEqual(f.opoint_ft_gjenopprettParkerte(ss), 1); assert.strictEqual(faner['Sendte saker'].rader.length, 3);
// Statusfanen
f.opoint_ft_skrivBackfillStatus(ss, '2026-11-16', ['ferdig', T('2026-11-20 10:00'), 3]);
f.opoint_ft_skrivBackfillStatus(ss, '2026-11-16', ['ferdig', T('2026-11-20 10:01'), 4]);
assert.strictEqual(faner['Backfill-status'].rader.length, 2); assert.strictEqual(faner['Backfill-status'].rader[1][3], 4);
// lesSendte for backfill: dagens Apps Script-utsending (18.11 07:09) tas ikke med når tilArtikler = vindusstart
const lest = f.opoint_kj_lesSendte(ss, (v18.oldest - 7 * 86400) * 1000, v18.newest * 1000, v18.oldest * 1000);
assert.ok(!lest.some(r => /LNG/.test(r.tittel)));
// Kilde: ingen sending i FellesTest utenom lagreOgSend
assert.ok(!/sendEmail/.test(fs.readFileSync(__dirname + '/../../FellesTest.gs', 'utf8')));
console.log('Backfill-status OK');
console.log('Alle backfill-tester OK');
