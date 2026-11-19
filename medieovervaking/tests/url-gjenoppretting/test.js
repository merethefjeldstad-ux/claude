var fs = require('fs');

// 12_Artikkellogg.gs gir hentQueryParameter/sikkerDecodeURIComponent/
// normaliserUrlForLogging - samme globale scope som i Apps Script.
eval(fs.readFileSync('/home/user/claude/medieovervaking/01_Konfigurasjon.gs', 'utf8'));
eval(fs.readFileSync('/home/user/claude/medieovervaking/12_Artikkellogg.gs', 'utf8'));
eval(fs.readFileSync('/home/user/claude/medieovervaking/16_UrlGjenoppretting.gs', 'utf8'));

var feil = 0;
function assertEqual(faktisk, forventet, beskrivelse) {
  var ok = JSON.stringify(faktisk) === JSON.stringify(forventet);
  console.log((ok ? 'OK  ' : 'FEIL') + ' - ' + beskrivelse);
  if (!ok) {
    console.log('     forventet: ' + JSON.stringify(forventet));
    console.log('     faktisk:   ' + JSON.stringify(faktisk));
    feil++;
  }
}

console.log('=== normaliserTittelForMatching ===');
var n = normaliserTittelForMatching;
assertEqual(n('Maritim elektrifi­sering: Klima­teknologien som Norge eksporterer til Kina'),
  'maritim elektrifisering klimateknologien som norge eksporterer til kina', 'myk bindestrek (U+00AD) fjernes');
assertEqual(n('Singapore tops maritime hub ranking - Maritimt Magasin'),
  'singapore tops maritime hub ranking', '« - kilde»-suffiks fjernes');
assertEqual(n('Får 900.000 til å hjelpe næringslivet - fjt.no'),
  'får 900 000 til å hjelpe næringslivet', 'suffiks med punktum + tegnsetting i tall');
assertEqual(n('Fiskeri- og havministeren har møte med Maritime Cleantech'),
  'fiskeri og havministeren har møte med maritime cleantech', 'bindestrek uten mellomrom er IKKE suffiks');
assertEqual(n('瑞典PowerCell获1500万瑞典克朗船用燃料电池订单 - 维度网'),
  '瑞典powercell获1500万瑞典克朗船用燃料电池订单', 'CJK-tittel beholdes, suffiks fjernes');
assertEqual(n('LNG-tankskip skal ha sunket utenfor Bulgaria – mannskapet reddet'),
  'lng tankskip skal ha sunket utenfor bulgaria', 'tankestrek-suffiks (–) fjernes');
assertEqual(n('‘BLUE SHIPPING CORRIDORS’ PROPOSED'), 'blue shipping corridors proposed', 'typografiske anforselstegn');
assertEqual(n('Ett to  tre'), 'ett to tre', 'hardt mellomrom og doble mellomrom');
assertEqual(n(''), '', 'tom streng');
assertEqual(n(null), '', 'null');
assertEqual(n('!!!'), '', 'kun tegnsetting -> tom');

console.log('');
console.log('=== dekodHtmlEntiteter ===');
assertEqual(dekodHtmlEntiteter('A &amp; B &lt;p&gt; &quot;x&quot; &#39;y&#39; &#x2013; &amp;lt;'),
  'A & B <p> "x" \'y\' – &lt;', 'escapeHtml-entiteter + ingen dobbel dekoding');

console.log('');
console.log('=== hentLenkerFraHtml (format som ekte daglig e-post) ===');
var html =
  '<div><a href="https://www.google.com/url?rct=j&sa=t&url=https://oceannews.com/news/energy/bibby-marine/&ct=ga&cd=CAIy&usg=AOvVaw341" style="display:block;font-size:19px;">Bibby Marine Calls On Offshore Wind To Match Electric Vessel Readiness</a>' +
  '<a href="https://www.google.com/url?rct=j&sa=t&url=https://oceannews.com/news/energy/bibby-marine/&ct=ga&cd=CAIy&usg=AOvVaw341" style="font-size:14px;">Les saken →</a></div>' +
  '<a href="https://www.regjeringen.no/no/aktuelt/fiskeri/id3192108/?utm_source=regjeringen.no&utm_medium=rss" style="x">Fiskeri- og havministeren har møte med Maritime Cleantech</a>' +
  '<a href=\'https://example.no/a\'><b>Fet &amp; tittel</b></a>' +
  '<a href="mailto:noen@example.no" style="color:#0066FF;">noen@example.no</a>' +
  '<img src="cid:logo">';
var lenker = hentLenkerFraHtml(html);
assertEqual(lenker.length, 4, '4 http-lenker (mailto hoppes over)');
assertEqual(lenker[0].href, 'https://www.google.com/url?rct=j&sa=t&url=https://oceannews.com/news/energy/bibby-marine/&ct=ga&cd=CAIy&usg=AOvVaw341',
  'href er uendret (rå &, ikke dekodet)');
assertEqual(lenker[0].tekst, 'Bibby Marine Calls On Offshore Wind To Match Electric Vessel Readiness', 'lenketekst = tittel');
assertEqual(lenker[1].tekst, 'Les saken →', '"Les saken"-lenken har annen tekst');
assertEqual(lenker[3], { href: 'https://example.no/a', tekst: 'Fet & tittel' }, 'enkle anforselstegn, indre tagger, entiteter');
assertEqual(hentLenkerFraHtml(''), [], 'tom html');

console.log('');
console.log('=== pakkUtGoogleOmdirigering ===');
assertEqual(pakkUtGoogleOmdirigering(lenker[0].href), 'https://oceannews.com/news/energy/bibby-marine/', 'Google-omdirigering pakkes ut');
assertEqual(pakkUtGoogleOmdirigering('https://www.google.com/url?q=https%3A%2F%2Fex.no%2Fa%3Fb%3D1&sa=D'), 'https://ex.no/a?b=1', 'q= og URL-koding');
assertEqual(pakkUtGoogleOmdirigering('https://ex.no/x'), 'https://ex.no/x', 'vanlig URL uendret');

console.log('');
console.log('=== matchRaderMotEposter ===');
var T = function (s) { return new Date(s).getTime(); };
var vindu = { foerMs: 20 * 60 * 1000, etterMs: 5 * 60 * 1000 };
var e1 = { tid: T('2026-11-13T06:10:21Z'), lenker: [
  { href: 'https://g.example/a1', tekst: 'Singapore tops maritime hub ranking - Maritimt Magasin' },
  { href: 'https://g.example/a1', tekst: 'Les saken →' },
  { href: 'https://ex.no/to-ulike', tekst: 'Samme tittel' },
  { href: 'https://ex.no/to-ulike-2', tekst: 'Samme tittel' }
] };
var e2 = { tid: T('2026-11-14T06:08:31Z'), lenker: [
  { href: 'https://g.example/a1-dag2', tekst: 'Singapore tops maritime hub ranking - Maritimt Magasin' },
  { href: 'https://www.google.com/url?rct=j&url=https://ex.no/al&usg=1', tekst: 'Artikkellogg bekrefter' },
  { href: 'https://www.google.com/url?rct=j&url=https://ex.no/feil&usg=1', tekst: 'Artikkellogg motsier' }
] };
var al = [
  { tid: T('2026-11-14T06:08:33Z'), url: 'https://ex.no/al', tittel: 'Artikkellogg bekrefter' },
  { tid: T('2026-11-14T06:08:33Z'), url: 'https://ex.no/riktig', tittel: 'Artikkellogg motsier' },
  { tid: T('2026-11-14T06:08:33Z'), url: 'https://ex.no/kun-al', tittel: 'Bare i Artikkellogg' }
];
var rader = [
  { rad: 10, tid: T('2026-11-13T06:10:22.430Z'), tittel: 'Singapore tops maritime hub ranking - Maritimt Magasin' },
  { rad: 11, tid: T('2026-11-14T06:08:33Z'), tittel: 'Singapore tops maritime hub ranking - Maritimt Magasin' },
  { rad: 12, tid: T('2026-11-13T06:10:22Z'), tittel: 'Samme tittel' },
  { rad: 13, tid: T('2026-11-13T06:10:22Z'), tittel: 'Finnes ikke' },
  { rad: 14, tid: T('2026-11-14T06:08:33Z'), tittel: 'Artikkellogg bekrefter' },
  { rad: 15, tid: T('2026-11-14T06:08:33Z'), tittel: 'Artikkellogg motsier' },
  { rad: 16, tid: T('2026-11-14T06:08:33Z'), tittel: 'Bare i Artikkellogg' },
  { rad: 17, tid: null, tittel: 'Singapore tops maritime hub ranking' },
  { rad: 18, tid: T('2026-11-20T06:08:00Z'), tittel: 'Singapore tops maritime hub ranking' }
];
var r = matchRaderMotEposter(rader, [e1, e2], al, vindu);
var kort = r.map(function (b) { return [b.rad, b.status, b.url]; });
assertEqual(kort[0], [10, 'OK', 'https://g.example/a1'], 'dag 1: samme tittel avgjøres av tidsvindu');
assertEqual(kort[1], [11, 'OK', 'https://g.example/a1-dag2'], 'dag 2: samme tittel, annen kjøring -> annen href');
assertEqual(kort[2], [12, 'FLERE_TREFF', ''], 'to ulike href-er med samme tittel i samme e-post -> ikke skrevet');
assertEqual(r[2].kandidater, ['https://ex.no/to-ulike', 'https://ex.no/to-ulike-2'], 'kandidatene listes');
assertEqual(kort[3], [13, 'MANGLER', ''], 'ingen treff -> MANGLER');
assertEqual(kort[4], [14, 'OK', 'https://www.google.com/url?rct=j&url=https://ex.no/al&usg=1'], 'Artikkellogg bekrefter -> rå Gmail-href skrives');
assertEqual(r[4].kilde, 'Gmail, samme kjøring + bekreftet av Artikkellogg', 'kilde viser bekreftelse');
assertEqual(kort[5], [15, 'KONFLIKT', ''], 'Artikkellogg motsier Gmail -> KONFLIKT');
assertEqual(kort[6], [16, 'OK', 'https://ex.no/kun-al'], 'kun Artikkellogg -> brukes som reserve');
assertEqual(kort[7], [17, 'FLERE_TREFF', ''], 'uten dato: alle e-poster, to ulike href-er -> FLERE_TREFF');
assertEqual(kort[8], [18, 'FLERE_TREFF', ''], 'ingen e-post i vindu -> alle e-poster -> FLERE_TREFF');

console.log('');
console.log('=== ekte titler fra 13.11 (arket) mot ekte lenketekster (e-posten) ===');
var arkTitler = [
  'Bibby Marine Calls On Offshore Wind To Match Electric Vessel Readiness',
  '瑞典PowerCell获1500万瑞典克朗船用燃料电池订单 - 维度网',
  'Singapore tops maritime hub ranking - Maritimt Magasin',
  'Fiskeri- og havministeren har møte med Maritime Cleantech'
];
var epostTekster = [
  'Bibby Marine Calls On Offshore Wind To Match Electric Vessel Readiness',
  '瑞典PowerCell获1500万瑞典克朗船用燃料电池订单 - 维度网',
  'Singapore tops maritime hub ranking - Maritimt Magasin',
  'Fiskeri- og havministeren har møte med Maritime Cleantech'
];
var ekteE = { tid: T('2026-11-13T06:10:21Z'), lenker: epostTekster.map(function (t, i) { return { href: 'https://h/' + i, tekst: escapeForTest(t) }; }) };
function escapeForTest(t) { return t.replace(/&/g, '&amp;').replace(/'/g, '&#39;'); }
var ekteR = matchRaderMotEposter(arkTitler.map(function (t, i) { return { rad: 176 + i, tid: T('2026-11-13T06:10:22.430Z'), tittel: t }; }),
  [{ tid: ekteE.tid, lenker: ekteE.lenker.map(function (l) { return { href: l.href, tekst: dekodHtmlEntiteter(l.tekst) }; }) }], [], vindu);
assertEqual(ekteR.map(function (b) { return b.status + ' ' + b.url; }),
  ['OK https://h/0', 'OK https://h/1', 'OK https://h/2', 'OK https://h/3'], 'alle fire rader fra 13.11 matcher unikt');

console.log('');
console.log(feil === 0 ? 'ALLE TESTER OK' : feil + ' TEST(ER) FEILET');
process.exit(feil === 0 ? 0 : 1);
