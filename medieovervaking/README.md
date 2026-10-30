# Medieovervåking – Fase 1 (Apps Script)

Dette er et Google Apps Script-prosjekt for daglig medieovervåking basert på
RSS. **Fase 1 bruker ikke AI** – målet er å finne ut hvilke RSS-kilder som
faktisk fungerer, og få en komplett rørledning (henting → filtrering →
e-post → logg) til å kjøre stabilt hver morgen.

Du trenger ikke å kunne kode for å sette dette opp. Følg stegene i
rekkefølge under.

---

## 1. Opprett Google Sheet og lim inn koden

1. Gå til [sheets.google.com](https://sheets.google.com) og opprett et nytt,
   tomt regneark. Gi det gjerne navnet «Medieovervåking Maritime CleanTech».
2. Åpne **Utvidelser → Apps Script** i menyen.
3. Du får opp en tom fil som heter `Kode.gs`. Slett alt innholdet i den.
4. For hver av filene under, opprett en ny fil i Apps Script-editoren
   (klikk `+` ved siden av «Filer» → «Skript») og lim inn hele innholdet
   fra tilsvarende fil i denne leveransen. Behold filnavnene som under
   (rekkefølgen på tallene har ingen praktisk betydning for Apps Script,
   men gjør det lettere å finne frem):

   | Fil i denne leveransen   | Filnavn i Apps Script (uten `.gs`) |
   |---------------------------|-------------------------------------|
   | `01_Konfigurasjon.gs`     | `01_Konfigurasjon`                   |
   | `02_Oppsett.gs`           | `02_Oppsett`                         |
   | `03_RSSHenting.gs`        | `03_RSSHenting`                      |
   | `04_Filtrering.gs`        | `04_Filtrering`                      |
   | `05_Deduplisering.gs`     | `05_Deduplisering`                   |
   | `06_Epost.gs`             | `06_Epost`                           |
   | `07_Hovedkjoring.gs`      | `07_Hovedkjoring`                    |
   | `09_AITest.gs`            | `09_AITest`                          |
   | `10_AIIntegrasjon.gs`     | `10_AIIntegrasjon`                   |
   | `11_EpostMerkevare.gs`    | `11_EpostMerkevare`                  |

   (`08_Diagnostikk.gs` var en midlertidig feilsøkingsfil og er ikke
   lenger en del av det normale oppsettet. `09`–`11` er Fase 2/designet
   e-post – se egne seksjoner under.)

5. Åpne **manifest-filen** `appsscript.json` i Apps Script-editoren
   (du må kanskje slå den på via tannhjulet **Prosjektinnstillinger** →
   kryss av for «Vis filen appsscript.json i redigeringsprogrammet»).
   Erstatt innholdet med innholdet fra `appsscript.json` i denne
   leveransen (setter riktig tidssone – Europe/Oslo – og V8-motoren).
6. Trykk **Lagre** (disketten øverst, eller Ctrl/Cmd+S).

---

## 2. Kjør første gangs oppsett

1. I Apps Script-editoren, velg funksjonen **`forsteGangsOppsett`** i
   nedtrekksmenyen øverst (ved siden av «Kjør»/«Run»-knappen).
2. Trykk **Kjør**.
3. Første gang du kjører noe i prosjektet ber Google om godkjenning
   («autorisasjon»). Du vil se en advarsel om at appen «ikke er
   verifisert» – dette er normalt for ditt eget skript. Trykk
   **Avansert** → **Gå til (prosjektnavn) (usikkert)** → **Tillat**.
   Skriptet trenger tilgang til regnearket ditt, Gmail (for å sende
   e-post) og internett (for å hente RSS).
4. Gå tilbake til regnearket – du skal nå se fem nye faner nederst:
   `Kilder`, `Søkeord`, `Mottakere`, `Sendte artikler` og `Kjøringslogg`.

---

## 3. MANUELLE STEG BRUKEREN GJØR SELV – fyll ut arkene

### Fanen «Kilder»
Fyll inn én rad per kilde du vil overvåke:

| Navn | RSS-URL | Kategori |
|------|---------|----------|
| Eksempel Avis | https://example.no/rss | Riksmedia |

- Bruk kategoriene du selv ønsker, f.eks. «Riksmedia», «Amedia»,
  «Fagpresse-maritim», «Fagpresse-tek», «Fagpresse-klima» – rent for egen
  oversikt. **E-posten grupperer IKKE lenger treff etter denne kolonnen**
  – se «Fanen «Søkeord»» under for hvordan gruppering fungerer nå.
- Kolonnene `Status`, `Sist verifisert` og `Antall treff siste kjøring`
  fylles automatisk av skriptet – la dem stå tomme.

### Fanen «Søkeord»
Fyll inn ett søkeord per rad:

| Søkeord | Tier | Kontekstord | Kategori |
|---------|------|-------------|----------|
| Maritime CleanTech | 1 | | Energi og framdrift |
| hydrogen | 1 | | Energi og framdrift |
| Apollo | 2 | skip,shipping,maritim,rederi | Annet |

- **Tier 1**: ord som er tydelige nok i seg selv til alltid å telle som
  treff (f.eks. «Maritime CleanTech», «hydrogenskip»).
- **Tier 2**: ord som også er vanlige navn/ord generelt (f.eks. «Apollo»,
  «GASS», «AWESOME»). Disse krever at minst ett av kontekstordene i samme
  rad (kommaseparert i kolonne C) også finnes i teksten, ellers telles
  det ikke som treff.
- **Kategori** (kolonne D): styrer hvilken gruppe/overskrift treffet vises
  under i e-posten. Flere søkeord kan dele samme kategori – du bestemmer
  selv hvor mange/få kategorier dere vil ha. Tom celle blir
  «Ukategorisert». Matcher en artikkel flere søkeord samtidig, er det
  kategorien til det FØRSTE matchende søkeordet (samme rekkefølge som i
  dette arket) som avgjør hvilken gruppe artikkelen havner i – den vises
  aldri i flere grupper samtidig.

### Fanen «Mottakere»
Fyll inn én e-postadresse per rad, i kolonne A.

### Fanene «Sendte artikler» og «Kjøringslogg»
Ikke rediger disse – skriptet fyller dem ut selv.

---

## 4. Test kjøringen manuelt

1. I Apps Script-editoren, velg funksjonen **`kjorTest`** i nedtrekksmenyen.
2. Trykk **Kjør**.
3. Åpne **Utførelseslogg** («Execution log» – klokke-ikonet til venstre i
   editoren) for å se en detaljert logg av hva skriptet gjorde: hvilke
   kilder som ble hentet, hvor mange artikler siste 72 timer (justerbart via
   `TIDSVINDU_ARTIKKEL_TIMER` i `01_Konfigurasjon.gs`), og hvor mange treff.
4. Sjekk innboksen til mottakerne – du skal ha fått en e-post med emne
   «Medieovervåking Maritime CleanTech (test) – [dagens dato]».
5. Sjekk fanen **Kilder**: kolonnen `Status` viser `OK` eller `FEILET`
   per kilde. Sjekk fanen **Kjøringslogg** for konkrete feilmeldinger på
   kildene som feilet (feil HTTP-kode, ugyldig XML, tomt svar, osv.).
6. Rett opp eller fjern kilder som feiler, og kjør `kjorTest` på nytt til
   du er fornøyd med dekningen.

**Dette er hovedleveransen i Fase 1**: en tydelig oversikt over hvilke
RSS-kilder som faktisk fungerer, synlig både øverst i e-posten og i
regnearket – uten at du trenger å lese kode eller logger i Apps Script.

---

## 5. Sett opp daglig automatisk kjøring (kl. ca. 06:45)

1. I Apps Script-editoren, klikk på **klokke-ikonet** («Utløsere» /
   «Triggers») til venstre.
2. Klikk **Legg til utløser** («Add Trigger») nederst til høyre.
3. Sett opp følgende:
   - Velg funksjon å kjøre: **`kjorDaglig`**
   - Velg kilde for hendelse: **Tidsdrevet** («Time-driven»)
   - Velg type tidsutløser: **Dag-tidtaker** («Day timer»)
   - Velg tidsintervall: **06:00 til 07:00** (Apps Script lar deg ikke
     velge eksakt klokkeslett, kun et en-timers vindu – kjøringen skjer
     et tilfeldig tidspunkt i vinduet, typisk nær starten)
4. Trykk **Lagre**.

Skriptet kjører nå automatisk hver morgen. Du kan følge med på om det
går bra via fanen **Kjøringslogg** i regnearket, eller via **Utførelser**
(«Executions») i Apps Script-editoren.

---

## Merkevaredesignet e-post (logo, farger, Drive-tilgang)

E-posten sendes nå i et merkevaredesignet HTML-oppsett (farger/typografi
fra maritimecleantech.no/brand) i stedet for den enkle Fase 1-visningen.
Utvalg, gruppering, KI-vurdering, feilhåndtering og sendetidspunkt er
uendret – kun utseendet er nytt. Bygging av den nye malen er i try/catch:
feiler den av noen grunn, sendes e-posten automatisk i det gamle, enkle
formatet i stedet – e-posten uteblir aldri.

### Logo (valgfritt, men anbefalt)

1. Last opp logoen som PNG til Google Disk (den kontoen skriptet kjører som).
2. Finn fil-ID-en: åpne filen i Disk, kopiér ID-en fra URL-en
   (`.../d/`**`FIL-ID-EN-HER`**`/view`).
3. Sett Script Property `LOGO_FILE_ID` til denne verdien.
4. Uten `LOGO_FILE_ID` (eller hvis filen ikke finnes/henting feiler) vises
   «Maritime CleanTech» som fet tekst i stedet – e-posten sendes som vanlig,
   og feilen logges i **Kjøretidslogg**.

**Ny tillatelse du må godkjenne:** siden skriptet nå henter en fil fra
Google Disk (`DriveApp.getFileById(...).getBlob()`), vil du få en ny
autorisasjonsdialog neste gang du kjører noe (samme type som før, men nå
med en ekstra linje om Disk-tilgang). Du vil se enten *«Se Google
Disk-filene dine»* (kun lesetilgang) eller den bredere *«Se, rediger,
opprett og slett alle Google Disk-filene dine»*, avhengig av hvordan Apps
Script klassifiserer dette automatisk – skriptet bruker uansett kun
LESETILGANG til denne ene filen, det skriver eller sletter aldri noe i
Disk. Godkjenn den dialogen som dukker opp for logoen skal fungere.

### Test FØR dere går live: `previewEmail()`

1. Velg funksjonen **`previewEmail`** i nedtrekksmenyen og trykk **Kjør**.
2. Sender en e-post med eksempeldata KUN til din egen innboks (aldri til
   «Mottakere»-fanen, og påvirker ikke «Sendte artikler»/dedup).
3. Sjekk e-posten i **både Gmail (nettleser) og Outlook** – spesielt de
   avrundede hjørnene på KI-notat-boksen (vises fint i Gmail, men Outlook
   skrivebord viser rette hjørner – en kjent begrensning i HTML-e-post,
   ikke noe som kan rettes med ren CSS).
4. Kjør den **én gang med `LOGO_FILE_ID` satt** og **én gang uten**
   (fjern/tøm verdien midlertidig), så du ser begge variantene.
5. Luften rundt selve logoen er satt til en fornuftig standardverdi (ikke
   målt mot den faktiske fila) – juster `padding` rundt `<img>`-taggen i
   `byggEpostHtmlMerkevare()` i `11_EpostMerkevare.gs` hvis det ikke ser
   riktig ut mot den ekte logoen.

---

## Kjente begrensninger (Fase 1)

- Apps Script stopper en kjøring tvangsmessig etter 6 minutter (vanlig
  Google-konto). Skriptet varsler i loggen hvis det nærmer seg grensen,
  og hopper i så fall over resterende kilder denne dagen (de merkes
  `IKKE_KJORT` i Kjøringslogg) – de forsøkes på nytt neste dag.
- Dersom ingen kilder eller mottakere er fylt ut, sender ikke skriptet
  e-post (dette logges tydelig i Utførelsesloggen).
- Hvis det ikke er noen treff en gitt dag, sendes e-posten likevel, med
  statusoppsummeringen øverst – slik at du vet at agenten kjørte.

---

## Fase 2 (senere – ikke del av denne leveransen)

Når Fase 1 har kjørt en stund og RSS-dekningen er vurdert god nok, er
planen å legge til AI-oppsummering med Claude Haiku (`claude-haiku-4-5-20251001`)
via Anthropic API, med API-nøkkel lagret i **Script Properties** under
navnet `ANTHROPIC_API_KEY`.

Kodebasen er lagt opp for at dette skal kunne legges til som et eget
steg uten stor omskriving:

- Alt AI-arbeid vil skje som et nytt steg mellom filtrering
  (`04_Filtrering.gs`) og e-postbygging (`06_Epost.gs`) – f.eks. en ny fil
  `05b_AIOppsummering.gs` som tar imot treffobjektene som allerede
  bygges i `07_Hovedkjoring.gs`, kaller Anthropic API for hvert treff, og
  legger til et `oppsummering`- og `relevant`-felt på hvert objekt.
- `byggEpostHtml()` i `06_Epost.gs` har allerede ett sted (markert med
  kommentar) der AI-sammendraget vil erstatte/utfylle den rå
  RSS-ingressen.
- Planen er: 1–2 setningers norsk oppsummering per artikkel, kun basert
  på den gitte RSS-ingressen (ingen antakelser utover teksten), samt en
  relevansvurdering (RELEVANT: JA/NEI) – særlig viktig for Tier
  2-treff. Ved feil i AI-kallet skal skriptet falle tilbake til den rå
  RSS-ingressen, ikke droppe treffet.

Dette er **ikke** implementert i denne leveransen.
