// Node-test av runde C (Oppdatering, rangering, URL-ID, norsk hovedtekst, daglig utløser). Kjør: node tests/opoint/test_c.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
const logg = []; const ctx = { Logger: { log: s => logg.push(String(s)) } }; vm.createContext(ctx);
let ukedag = '3';
ctx.Utilities = { formatDate: (t, tz, f) => f === 'u' ? ukedag : f === 'yyyy-MM-dd' ? new Date(t.getTime() + 3600e3).toISOString().slice(0, 10) : 'x',
  parseDate: (s) => new Date(Date.parse(s.replace(' ', 'T') + ':00+01:00')) };
['Opoint.gs', 'OpointTest3.gs', '12_Artikkellogg.gs', '09_AITest.gs', '01_Konfigurasjon.gs', '06_Epost.gs', '11_EpostMerkevare.gs', 'OpointKjoring.gs', 'FellesTest.gs']
  .forEach(fl => vm.runInContext(fs.readFileSync(__dirname + '/../../' + fl, 'utf8'), ctx));
const f = ctx;
const doc = o => Object.assign({ id_site: 1, id_article: 1, unix_timestamp: 1795500000, header: { text: 'x' }, summary: { text: 'Teksten er en hel setning som er lang nok til å telle som god ingress i testen her.' }, language: { text: 'en' } }, o);
const props = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-5-5' };
const lagTj = (svarFn) => { const kall = []; const svar = b => { kall.push(b); return { status: 200, tekst: JSON.stringify({ content: [{ type: 'text', text: svarFn(b) }] }) }; };
  const t = f.opoint_kj_lagKiTjeneste(80, Date.now(), { props: { getProperty: n => props[n] }, cache: null, hash: x => x, fetch: svar, fetchMange: bs => bs.map(svar) }); t.kallListe = kall; return t; };
const fmt = s => new Date((s + 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);
const vindu = { oldest: Date.parse('2026-11-18T07:30:00+01:00') / 1000, newest: Date.parse('2026-11-19T07:30:00+01:00') / 1000 };
const prio = { kart: {}, kilder: {} };

// ---- URL med ID-parameter (Fratelli Cosulich ≠ NYK) ----
const a = f.opoint_kj_normUrl('https://bunkerindex.com/articles/article.php?a=23814&h=keel-laid');
const b = f.opoint_kj_normUrl('https://bunkerindex.com/articles/article.php?a=23810&h=nyk');
assert.notStrictEqual(a, b); assert.strictEqual(a, 'bunkerindex.com/articles/article.php?a=23814');
assert.strictEqual(f.opoint_kj_normUrl('https://www.x.com/sak?utm_source=rss'), 'x.com/sak'); // sporingsparametre fjernes fortsatt
console.log('URL OK');

// ---- 1a/1b: vesentlig nytt og maks én oppdatering ----
const dd = ['Molslinjen Electric Ferries taps AYK Energy for Battery Power', 'Tersan Delivers First Battery-Powered Ferry to Fjord1', 'Brann i ladetårn ved ferjekai',
  'Første av fire autonome ferger er levert', 'Sweden\'s Styrsobolaget orders electric catamaran trio']
  .map((t, i) => doc({ id_article: 10 + i, orig_url: 'https://n.no/' + i, header: { text: t } }));
const s1 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: dd }], [], prio), null);
s1.forEach(s => { s.kiResultat = { relevant: true, prioritet: 'høy' }; });
const T = s => Date.parse(s.replace(' ', 'T') + ':00+01:00');
const sendte = [{ tid: T('2026-11-17 07:30'), tittel: 'AYK Energy wins biggest marine battery contract', ingress: '165 MWh til Molslinjen.', pri: 'høy' },
  { tid: T('2026-11-17 07:30'), tittel: 'Fjord1 Takes Delivery of First New Electric Ferry for Lavik–Oppedal', ingress: 'Skagastøl levert.', pri: 'høy' },
  { tid: T('2026-11-18 07:30'), tittel: 'Tersan Delivers First Battery-Powered Ferry to Fjord1', ingress: 'Skagastøl.', pri: 'oppdatering' },
  { tid: T('2026-11-17 07:30'), tittel: 'Ladetårn byrja brenne med ferje tilkopla', ingress: 'Brann.', pri: 'høy' }];
const tj = lagTj(bb => {
  if (/sjekker om nye nyhetssaker allerede er omtalt/.test(bb.system)) return '{"treff": [{"ny": 1, "tidligere": ["T1"]}, {"ny": 2, "tidligere": "T2"}, {"ny": 3, "tidligere": ["T4"]}, {"ny": 4, "tidligere": ["T2", "T3"]}, {"ny": 5, "tidligere": ["T1"]}]}';
  if (/sjekker om nyhetssaker allerede er sendt/.test(bb.system)) return '{"treff": []}';
  const c = bb.messages[0].content;
  if (/Styrsobolaget/.test(c)) return '{"samme_sak": false, "vesentlig": false, "begrunnelse": "Annen ordre.", "nytt": ""}';
  if (/Molslinjen/.test(c)) return '{"samme_sak": true, "vesentlig": false, "begrunnelse": "Samme 165 MWh-kontrakt; verftnavnet er bare en detalj.", "nytt": ""}';
  return '{"samme_sak": true, "vesentlig": false, "begrunnelse": "Bare detaljer.", "nytt": ""}';
});
f.opoint_kj_settOmtaltTidligere(s1, sendte, tj);
assert.ok(s1[3].oppfolging && /Allerede omtalt 2 gang/.test(s1[3].oppfolgingGrunn)); // «Første av fire autonome ferger» – tredje gang
const ek = f.opoint_kj_etterkontrollOppfolging(s1, sendte, tj);
assert.ok(s1[0].oppfolging && /ikke vesentlig nytt: Samme 165 MWh/.test(s1[0].oppfolgingGrunn)); // AYK
assert.ok(s1[1].oppfolging && s1[2].oppfolging);   // Tersan, brann
assert.ok(!s1[4].oppfolging && !s1[4].oppdatering); // Styrsobolaget: ikke samme sak → vanlig behandling
assert.ok(ek.liste.some(x => x.vesentlig === 'nei' && /verftnavnet/.test(x.begrunnelse)));
assert.ok(ek.liste.some(x => x.vesentlig === 'annen sak'));
assert.ok(tj.kallListe.some(x => /TIDLIGERE \(sendt 17\.11\): AYK Energy wins.*\|\| 165 MWh/.test(x.messages[0].content)));
console.log('1a–1b OK');

// ---- 1c: Oppdateringer-blokk, maks 3, ikke kort ----
const od = [0, 1, 2, 3, 4].map(i => doc({ id_article: 50 + i, orig_url: 'https://o.no/' + i, header: { text: 'Sak ' + i } }));
const s2 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: od }], [], prio), null);
s2.forEach((s, i) => { s.kiResultat = { relevant: true, prioritet: i === 4 ? 'middels' : 'høy' }; s.oppdatering = { nytt: 'Nytt ' + i, tittel: 'T', dato: '17.11' }; });
const e2 = f.opoint_kj_byggEpost(s2, { setninger: [{ tekst: 'X.', sak: 'S9', url: 'u', kilde: 'K' }], inndata: [] }, vindu, fmt, false, {}, [], {});
assert.strictEqual(e2.kort.length, 0); assert.strictEqual(e2.oppdateringer.length, 3);
assert.ok(e2.html.indexOf('>Oppdateringer</div>') < e2.html.indexOf('>Ellers i bransjen</div>'));
assert.ok(s2.filter(s => s.oppdateringUtelatt).length === 2);
assert.deepStrictEqual(J(f.opoint_kj_validerHtml(e2.html)), []);
const sr = f.opoint_ft_sendteRader(e2, s2, new Date(), 'backfill', { setninger: [] });
assert.strictEqual(sr.filter(r => r[6] === 'oppdatering').length, 3); assert.ok(sr[0][5].startsWith('Nytt: '));
console.log('1c OK');

// ---- 3: rangering ----
const rd = [['Molslinjen taps AYK Energy for record 165 MWh', { prioritet: 'middels', stor: true, tema: true, norsk: false, konkret: true }],
  ['Boreal søker de første skipperne til Candelas hydrofoilbåter', { prioritet: 'høy', stor: false, tema: true, norsk: true, konkret: false }],
  ['Kort kystrutekontrakt setter arbeidsplassene i fare', { prioritet: 'høy', stor: false, tema: false, norsk: true, konkret: false }],
  ['Ny dypvannskai åpnet i Mo i Rana', { prioritet: 'høy', stor: false, tema: false, norsk: true, konkret: true }],
  ['Norled bestiller to hydrogenferger', { prioritet: 'høy', stor: false, tema: true, norsk: true, konkret: true }]]
  .map((x, i) => [doc({ id_article: 80 + i, orig_url: 'https://r.no/' + i, header: { text: x[0] } }), x[1]]);
const s3 = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: rd.map(x => x[0]) }], [], prio), null);
s3.forEach((s, i) => { s.kiResultat = Object.assign({ relevant: true }, rd[i][1]); });
f.opoint_kj_brukVariant(s3, true, 8);
assert.deepStrictEqual(J(s3.map(s => s.kiResultat.prioritet)), ['høy', 'middels', 'middels', 'middels', 'høy']);
assert.strictEqual(s3[0].kiResultat.rang, 1); assert.strictEqual(s3[0].kiResultat.poeng, 6); // stor + tema først, norsk bare tie-break
const rv = f.opoint_ft_raderVariant({ saker: s3 }, { kort: [{ sak: 'S1' }, { sak: 'S5' }], setningerVist: [{ sak: 'S2' }] });
assert.ok(rv.some(r => r[1] === 'S1' && r[10] === 'kort' && r[11].startsWith('løftet')));
assert.ok(rv.some(r => r[1] === 'S2' && r[10] === 'sammendrag') && rv.some(r => r[1] === 'S3' && r[10] === 'kuttet'));
console.log('3 OK');

// ---- 5: norsk hovedtekst ----
const sn = f.opoint_kj_lagSaker(f.opoint_kj_dedup([{ strom: 'B', navn: 'B', searchterm: 'b', dokumenter: [doc({ id_article: 90, orig_url: 'https://e.com/1', header: { text: 'TMC picked for 23 bulkers' }, summary: { text: 'Norway-based TMC Compressors has been awarded a contract to deliver compressed air systems to 23 vessels.' } })] }], [], prio), null);
sn[0].kiResultat = { relevant: true, prioritet: 'høy' }; sn[0].oppsummertIngress = 'TMC Compressors skal levere trykkluftsystemer til 23 nye bulkskip.';
const en = f.opoint_kj_byggEpost(sn, null, vindu, fmt, false, {}, [], { norskHovedtekst: true });
assert.ok(en.html.indexOf('TMC Compressors skal levere') < en.html.indexOf('Original: Norway-based'));
const en0 = f.opoint_kj_byggEpost(sn, null, vindu, fmt, false, {}, [], {});
assert.ok(!en0.html.includes('Original:') && en0.html.includes('Norway-based TMC'));
assert.strictEqual(f.NORSK_HOVEDTEKST, false);
console.log('5 OK');

// ---- 6: daglig utløser ----
let utl = [];
const lagUtl = (h, type) => ({ getHandlerFunction: () => h, getEventType: () => type || 'CLOCK' });
const bygger = { timeBased: () => bygger, everyDays: n => { bygger.n = n; return bygger; }, atHour: h => { bygger.h = h; return bygger; }, nearMinute: m => { bygger.m = m; return bygger; },
  inTimezone: z => { bygger.z = z; return bygger; }, create: () => utl.push(lagUtl(f.DAGLIG_FUNKSJON)) };
ctx.ScriptApp = { getProjectTriggers: () => utl.slice(), deleteTrigger: t => { utl = utl.filter(x => x !== t); }, newTrigger: h => { bygger.handler = h; return bygger; } };
utl = [lagUtl('kjorMedieovervaking')];
assert.strictEqual(f.planleggDagligFellesTest(), false); assert.strictEqual(utl.length, 1); assert.ok(logg.some(l => l.startsWith('STOPP: kopien har andre utløsere')));
utl = [lagUtl(f.DAGLIG_FUNKSJON)];
assert.strictEqual(f.planleggDagligFellesTest(), true); assert.strictEqual(utl.length, 1);
assert.deepStrictEqual([bygger.handler, bygger.n, bygger.h, bygger.m, bygger.z], ['opoint_ft_dagligKjor', 1, 7, 35, 'Europe/Oslo']);
assert.strictEqual(f.avbrytDagligFellesTest(), 1); assert.strictEqual(utl.length, 0);
ukedag = '6'; assert.strictEqual(f.opoint_ft_dagligKjor(), null); // lørdag
console.log('6 OK');
console.log('Alle C-tester OK');
