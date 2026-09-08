/**
 * 03_RSSHenting.gs
 *
 * Henter og tolker (parser) RSS 2.0- og Atom-feeder.
 *
 * Dette er hoveddelen for Fase 1: siden vi IKKE vet hvilke kilder som
 * faktisk har fungerende RSS enna, ma alt her tale a feile "pent" -
 * en enkelt darlig kilde skal ALDRI stoppe resten av kjoringen.
 *
 * hentRSSFeed(url) returnerer alltid et objekt pa formen:
 *   { suksess: true/false, artikler: [...], feilmelding: "..." }
 * og kaster ALDRI et unntak videre til den som kaller den.
 */

/**
 * Henter en RSS/Atom-feed fra en URL, validerer at den faktisk er en
 * gyldig feed, og returnerer en liste med artikler.
 *
 * @param {string} url
 * @return {{suksess: boolean, artikler: Array<Object>, feilmelding: string}}
 */
function hentRSSFeed(url) {
  var resultat = { suksess: false, artikler: [], feilmelding: '' };
  var respons;

  // Steg 1: Hent selve URL-en. Nettverksfeil (feil domene, timeout, DNS-feil
  // osv.) kaster et unntak i UrlFetchApp - det fanger vi her.
  //
  // NB: Vi sender en vanlig nettleser-lignende User-Agent-header. Uten den
  // sender UrlFetchApp en tydelig "robotaktig" signatur som standard, og
  // enkelte nettsteder (observert bl.a. hos DN) svarer da med noe annet enn
  // den faktiske RSS-feeden (f.eks. en blokkeringsside eller en
  // omdirigering) selv om feeden er helt i orden i en vanlig nettleser.
  try {
    respons = UrlFetchApp.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      muteHttpExceptions: true,   // ikke kast unntak pa HTTP-feilkoder - vi sjekker koden selv under
      followRedirects: true,
      validateHttpsCertificates: true
    });
  } catch (e) {
    resultat.feilmelding = 'Nettverksfeil ved henting av URL (f.eks. feil domene, tidsavbrudd eller sertifikatfeil): ' + e.message;
    return resultat;
  }

  // Steg 2: Sjekk HTTP-statuskode. Mange feeder som ikke lenger finnes
  // svarer med 404/410/500 osv.
  var statusKode = respons.getResponseCode();
  if (statusKode < 200 || statusKode >= 300) {
    resultat.feilmelding = 'HTTP-feil: mottok statuskode ' + statusKode + ' fra serveren.';
    return resultat;
  }

  var innhold = respons.getContentText('UTF-8');
  if (!innhold || innhold.trim().length === 0) {
    resultat.feilmelding = 'Tomt svar fra server (0 tegn mottatt).';
    return resultat;
  }

  // Steg 3: Prov a tolke innholdet som XML. Mange "dode" feed-URL-er
  // returnerer en HTML-feilside med status 200 OK i stedet for feed-XML -
  // XmlService.parse() feiler pa ekte HTML (ugyldig XML), og det fanges her.
  var dokument;
  try {
    dokument = XmlService.parse(innhold);
  } catch (e) {
    resultat.feilmelding = 'Ugyldig XML - klarte ikke a tolke svaret som en feed (mottok sannsynligvis en HTML-feilside i stedet for RSS/Atom-XML): ' + e.message;
    return resultat;
  }

  // Steg 4: Sjekk at rotelementet faktisk er <rss> eller <feed> (Atom).
  // Dette fanger opp tilfeller der responsen ER gyldig XML, men ikke en feed
  // (f.eks. en XHTML-feilside eller en helt annen XML-type).
  var rot = dokument.getRootElement();
  var rotNavn = rot.getName();

  try {
    if (rotNavn === 'rss') {
      resultat.artikler = parseRssFeed(rot);
    } else if (rotNavn === 'feed') {
      resultat.artikler = parseAtomFeed(rot);
    } else {
      resultat.feilmelding = 'Uventet rotelement <' + rotNavn + '> i svaret - forventet <rss> (RSS) eller <feed> (Atom). Dette er sannsynligvis ikke en gyldig feed-URL.';
      return resultat;
    }
  } catch (e) {
    resultat.feilmelding = 'Feil under tolking av feed-innholdet (uventet struktur): ' + e.message;
    return resultat;
  }

  resultat.suksess = true;
  return resultat;
}

/**
 * Parser en RSS 2.0-feed (rotelement <rss><channel><item>...).
 *
 * @param {XmlElement} rotElement
 * @return {Array<Object>} liste med {tittel, lenke, ingress, dato}
 */
function parseRssFeed(rotElement) {
  var kanal = rotElement.getChild('channel');
  if (!kanal) {
    throw new Error('Fant ikke <channel>-element i RSS-feeden.');
  }

  // content:encoded brukes av mange feeder (f.eks. WordPress) for a gi et
  // fyldigere HTML-innhold i tillegg til <description>.
  var contentNamespace = XmlService.getNamespace('content', 'http://purl.org/rss/1.0/modules/content/');
  var elementer = kanal.getChildren('item');
  var artikler = [];

  for (var i = 0; i < elementer.length; i++) {
    var element = elementer[i];

    var tittel = hentTekstFraBarn(element, 'title');

    var lenke = hentTekstFraBarn(element, 'link');
    if (!lenke) {
      // Noen feeder mangler <link>, men har <guid> som permanent lenke
      var guidElement = element.getChild('guid');
      if (guidElement) {
        lenke = guidElement.getText().trim();
      }
    }

    var ingress = hentTekstFraBarn(element, 'description');
    if (!ingress) {
      var utvidetInnhold = element.getChild('encoded', contentNamespace);
      if (utvidetInnhold) {
        ingress = utvidetInnhold.getText().trim();
      }
    }

    var pubDatoTekst = hentTekstFraBarn(element, 'pubDate');
    var dato = pubDatoTekst ? new Date(pubDatoTekst) : null;

    artikler.push({
      tittel: renseHtml(tittel),
      lenke: lenke,
      ingress: renseHtml(ingress),
      dato: dato
    });
  }

  return artikler;
}

/**
 * Parser en Atom-feed (rotelement <feed><entry>...).
 *
 * @param {XmlElement} rotElement
 * @return {Array<Object>} liste med {tittel, lenke, ingress, dato}
 */
function parseAtomFeed(rotElement) {
  var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
  var elementer = rotElement.getChildren('entry', atomNs);
  var artikler = [];

  for (var i = 0; i < elementer.length; i++) {
    var element = elementer[i];

    var tittel = hentTekstFraBarn(element, 'title', atomNs);

    // Atom kan ha flere <link>-elementer (alternate, self, osv). Vi vil ha
    // "alternate" (selve artikkelen), og faller tilbake til forste lenke.
    var lenke = '';
    var lenkeElementer = element.getChildren('link', atomNs);
    for (var j = 0; j < lenkeElementer.length; j++) {
      var relAttributt = lenkeElementer[j].getAttribute('rel');
      var relVerdi = relAttributt ? relAttributt.getValue() : null;
      if (!relVerdi || relVerdi === 'alternate') {
        var hrefAttributt = lenkeElementer[j].getAttribute('href');
        lenke = hrefAttributt ? hrefAttributt.getValue() : '';
        break;
      }
    }
    if (!lenke && lenkeElementer.length > 0) {
      var forsteHref = lenkeElementer[0].getAttribute('href');
      lenke = forsteHref ? forsteHref.getValue() : '';
    }

    var ingress = hentTekstFraBarn(element, 'summary', atomNs);
    if (!ingress) {
      ingress = hentTekstFraBarn(element, 'content', atomNs);
    }

    var datoTekst = hentTekstFraBarn(element, 'published', atomNs);
    if (!datoTekst) {
      datoTekst = hentTekstFraBarn(element, 'updated', atomNs);
    }
    var dato = datoTekst ? new Date(datoTekst) : null;

    artikler.push({
      tittel: renseHtml(tittel),
      lenke: lenke,
      ingress: renseHtml(ingress),
      dato: dato
    });
  }

  return artikler;
}

/**
 * Henter tekstinnholdet i et gitt barn-element, eller tom streng hvis
 * elementet ikke finnes. Handterer eventuelt navnerom (namespace).
 *
 * @param {XmlElement} element
 * @param {string} barnNavn
 * @param {XmlNamespace} [navnerom]
 * @return {string}
 */
function hentTekstFraBarn(element, barnNavn, navnerom) {
  var barn = navnerom ? element.getChild(barnNavn, navnerom) : element.getChild(barnNavn);
  if (!barn) return '';
  return barn.getText().trim();
}

/**
 * Fjerner HTML-tagger og enkle HTML-entiteter fra en tekst, slik at
 * ingress/tittel blir ren, lesbar tekst i e-posten og i sokefiltreringen.
 * Bevarer norske tegn (aeoa/aeøå) siden vi kun fjerner "<...>"-tagger,
 * ikke gjor om tegnsettet.
 *
 * @param {string} tekst
 * @return {string}
 */
function renseHtml(tekst) {
  if (!tekst) return '';
  var utenTagger = tekst.replace(/<[^>]*>/g, ' ');
  utenTagger = utenTagger
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  return utenTagger.replace(/\s+/g, ' ').trim();
}

/**
 * Sjekker om en artikkel-dato er innenfor siste 24 timer.
 * Godtar ogsa noen minutter i "fremtiden" for a tale mindre klokke-avvik
 * mellom kilden og Google sine servere.
 *
 * @param {Date|null} dato
 * @return {boolean}
 */
function erInnenSisteDogn(dato) {
  if (!dato || isNaN(dato.getTime())) return false;

  var na = new Date().getTime();
  var toleranseFremtidMs = 60 * 60 * 1000; // 1 time takhoyde for klokke-avvik
  var enDognMs = 24 * 60 * 60 * 1000;
  var alderMs = na - dato.getTime();

  return alderMs <= enDognMs && alderMs >= -toleranseFremtidMs;
}
