/**
 * 04_Filtrering.gs
 *
 * Sokeord-filtrering av artikler.
 *
 * Tier 1: enkelt case-insensitivt substring-sok - treffer alltid.
 * Tier 2: substring-sok pa selve sokeordet MA i tillegg ha minst ett av
 *         kontekstordene fra samme rad til stede i teksten for a telle.
 *         Dette handterer sokeord som ogsa er vanlige ord/navn generelt
 *         (f.eks. "Apollo", "GASS", "AWESOME") - uten kontekstsjekk ville
 *         disse gitt for mange falske treff.
 *
 * NB: I Fase 2 vil et Tier 2-treff i tillegg sendes til Claude for en
 * RELEVANT JA/NEI-vurdering for det tas med i e-posten (se README).
 * I Fase 1 er et Tier 2-treff med kontekstord alltid nok til a telle.
 */

/**
 * Finner alle sokeord (fra bade Tier 1 og Tier 2) som matcher en gitt tekst.
 *
 * @param {string} tekst - f.eks. tittel + ingress slatt sammen
 * @param {Array<Object>} sokeordListe - fra hentSokeord()
 * @return {Array<string>} liste med sokeord (opprinnelig skrivemate) som matchet
 */
function finnMatchendeSokeord(tekst, sokeordListe) {
  // toLowerCase() i V8 handterer norske tegn (aeoa/aeøå) korrekt,
  // sa lenge teksten er en vanlig JavaScript-streng (som den er her).
  var normalisertTekst = tekst.toLowerCase();
  var treff = [];

  for (var i = 0; i < sokeordListe.length; i++) {
    var rad = sokeordListe[i];
    var ordLowerCase = rad.sokeord.toLowerCase();

    if (normalisertTekst.indexOf(ordLowerCase) === -1) {
      continue; // sokeordet finnes ikke i teksten i det hele tatt
    }

    if (rad.tier === 2) {
      var harKontekst = false;
      for (var j = 0; j < rad.kontekstord.length; j++) {
        if (normalisertTekst.indexOf(rad.kontekstord[j].toLowerCase()) !== -1) {
          harKontekst = true;
          break;
        }
      }
      if (!harKontekst) {
        continue; // Tier 2-ord uten stotte fra kontekstord teller ikke som treff
      }
    }

    // Tier 1-ord teller alltid som treff, og Tier 2-ord med bekreftet kontekst
    treff.push(rad.sokeord);
  }

  return treff;
}

/**
 * Finner kategorien til det FORSTE sokeordet i en liste med matchende
 * sokeord (fra finnMatchendeSokeord()). Brukes til a gruppere treff i
 * e-posten etter sokeord-kategori i stedet for kilde-kategori - se
 * 07_Hovedkjoring.gs. Et treff som matcher flere sokeord grupperes KUN
 * under det forste matchende sokeordets kategori (samme rekkefolge som
 * i "Sokeord"-fanen), slik at hvert treff vises nokjaktig en gang i
 * e-posten - aldri duplisert pa tvers av kategorier.
 *
 * @param {Array<string>} matchendeOrd - fra finnMatchendeSokeord()
 * @param {Array<Object>} sokeordListe - fra hentSokeord()
 * @return {string} kategorien til forste matchende sokeord, eller
 *   "Ukategorisert" hvis sokeordet mangler kategori eller (uventet)
 *   ikke finnes i sokeordListe
 */
function finnKategoriForForsteSokeord(matchendeOrd, sokeordListe) {
  if (!matchendeOrd || matchendeOrd.length === 0) return 'Ukategorisert';

  var forsteSokeord = matchendeOrd[0];
  for (var i = 0; i < sokeordListe.length; i++) {
    if (sokeordListe[i].sokeord === forsteSokeord) {
      return sokeordListe[i].kategori || 'Ukategorisert';
    }
  }
  return 'Ukategorisert';
}
