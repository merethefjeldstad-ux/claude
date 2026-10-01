# Medieovervåking – Mal (Fase 1, Apps Script)

Dette er en **generell, gjenbrukbar mal** for å sette opp en ny
medieovervåking i Google Apps Script. Den er bygget på samme kode som
«Maritime CleanTech»-overvåkingen (se `medieovervaking/`-mappen i dette
repoet), men uten noe som er spesifikt for den overvåkingen, og uten de
midlertidige feilsøkingsfilene som ble lagt til underveis der.

Bruk denne malen hver gang du vil sette opp overvåking av et **nytt** tema
(ny bransje, nytt firma, nytt interesseområde) i et **nytt** Google Sheet.
Ikke lim denne inn i det eksisterende Maritime CleanTech-arket – da
overskriver du den fungerende oppsettet.

---

## Viktig: hvorfor forrige forsøk sannsynligvis feilet

Hvis du fikk en feilmelding da du prøvde å gjenbruke koden fra sist: den
nyeste versjonen av `07_Hovedkjoring.gs` i `medieovervaking/`-mappen kaller
en funksjon (`kjorDiagnostikk`) som bare finnes i en egen feilsøkingsfil
(`08_Diagnostikk.gs`) – lagt til underveis for å spore opp et konkret
problem i Maritime CleanTech-oppsettet. Hvis du kopierte produksjonsfilene
uten å også ta med den filen, feiler `kjorTest()` med noe sånt som
*"kjorDiagnostikk is not defined"*.

Filene i **denne** mal-mappen er renset for den avhengigheten – `kjorTest()`
her gjør kun det den skal, uten noe ekstra.

---

## 1. Opprett nytt Google Sheet og lim inn koden

1. Opprett et **nytt**, tomt regneark på [sheets.google.com](https://sheets.google.com)
   – gi det et navn som beskriver hva du overvåker.
2. Åpne **Utvidelser → Apps Script**.
3. Slett alt innhold i standardfilen (`Kode.gs`) som Google oppretter automatisk.
4. Opprett én ny fil per fil i denne mappen, og lim inn innholdet (bruk `+`
   ved siden av «Filer»):

   | Fil i denne malen         | Filnavn i Apps Script (uten `.gs`) |
   |----------------------------|-------------------------------------|
   | `01_Konfigurasjon.gs`      | `01_Konfigurasjon`                   |
   | `02_Oppsett.gs`            | `02_Oppsett`                         |
   | `03_RSSHenting.gs`         | `03_RSSHenting`                      |
   | `04_Filtrering.gs`         | `04_Filtrering`                      |
   | `05_Deduplisering.gs`      | `05_Deduplisering`                   |
   | `06_Epost.gs`              | `06_Epost`                           |
   | `07_Hovedkjoring.gs`       | `07_Hovedkjoring`                    |

   **VIKTIG ved innliming:** Apps Script legger automatisk inn en tom
   `function myFunction() { }` i hver nye fil. Merk ALT innhold i det tomme
   feltet (Ctrl/Cmd+A) og slett det FØR du limer inn – ikke lim inn midt
   oppi malen, da havner koden feil og funksjonene blir ikke synlige i
   kjøremenyen.

5. Slå på visning av manifest-filen: tannhjulet **Prosjektinnstillinger** →
   kryss av for «Vis filen appsscript.json i redigeringsprogrammet». Lim inn
   innholdet fra `appsscript.json` i denne malen.
6. Lagre (Ctrl/Cmd+S).

---

## 2. ENDRE prosjektnavnet (det eneste du MÅ tilpasse i koden)

Åpne `01_Konfigurasjon.gs` og finn denne linjen helt øverst:

```js
var PROSJEKTNAVN = '[SKRIV INN NAVN PA OVERVAKINGEN HER]';
```

Bytt ut teksten i anførselstegnene med navnet på det du overvåker, f.eks.:

```js
var PROSJEKTNAVN = 'Offshore Vind Norge';
```

Dette navnet brukes i overskriften og emnefeltet på e-posten skriptet
sender. Det er den eneste tekst-tilpasningen som er nødvendig i selve koden.

---

## 3. Kjør første gangs oppsett

1. Velg funksjonen **`forsteGangsOppsett`** i nedtrekksmenyen og trykk **Kjør**.
2. Godkjenn tilgangene Google ber om (regneark, Gmail, internett) – trykk
   **Avansert** → **Gå til (prosjektnavn) (usikkert)** → **Tillat**.
3. Sjekk regnearket – fem nye faner skal ha dukket opp: `Kilder`, `Søkeord`,
   `Mottakere`, `Sendte artikler`, `Kjøringslogg`.

---

## 4. Fyll ut fanene

### «Kilder»
Én rad per RSS-kilde: `Navn | RSS-URL | Kategori`. La `Status`,
`Sist verifisert` og `Antall treff siste kjøring` stå tomme – skriptet
fyller dem ut selv.

### «Søkeord»
Én rad per søkeord: `Søkeord | Tier | Kontekstord`.
- **Tier 1**: enkelt, entydig ord/frase – teller alltid som treff når det
  finnes i teksten (substring-søk, ikke ordgrense-sjekk).
- **Tier 2**: ord som også er vanlige ord/navn generelt (f.eks. et firmanavn
  som også er et vanlig ord). Krever at minst ett kontekstord fra samme
  rad (kommaseparert i kolonne C) også finnes i teksten.

  **Pass på korte kontekstord** (3–4 tegn): siden søket er rent
  substring-basert uten ordgrense, kan korte ord/forkortelser matche
  tilfeldig inni helt andre ord – f.eks. vil kontekstordet «KI» matche
  inni det vanlige ordet «**ki**lder», og «ship» matcher inni engelske ord
  som «leadership» eller «relationship». Bruk lengre, mer spesifikke
  kontekstord der det er mulig.

### «Mottakere»
Én e-postadresse per rad.

### «Sendte artikler» og «Kjøringslogg»
Ikke rediger disse manuelt – skriptet fyller dem ut selv.

---

## 5. Test og sett opp daglig kjøring

Samme fremgangsmåte som i hovedprosjektet:

1. Kjør **`kjorTest`** manuelt og sjekk Utførelseslogg + innboks.
2. Sjekk `Status`-kolonnen i «Kilder» og «Kjøringslogg» for feilede kilder.
3. Når du er fornøyd: gå til **Utløsere** (klokke-ikonet) → **Legg til
   utløser** → funksjon `kjorDaglig` → Tidsdrevet → Dag-tidtaker → velg et
   tidsvindu (f.eks. 06:00–07:00).

---

## Hva er IKKE med i denne malen

- Ingen AI-oppsummering (Fase 2) – kun rå RSS-ingress, slik Fase 1 er
  spesifisert. Koden er strukturert slik at dette kan legges til senere som
  et eget steg mellom `04_Filtrering.gs` og `06_Epost.gs`, uten stor
  omskriving.
- Ingen av de midlertidige feilsøkingsfilene fra Maritime
  CleanTech-prosjektet. Hvis du støter på noe som ser ut som en bug (f.eks.
  treff som ikke burde skjedd, eller omvendt), bygg diagnostikk-logging
  etter samme mønster som ble brukt der – ikke gjett deg frem til en fiks
  uten å ha logget hva som faktisk skjer først.

## Kjente begrensninger (samme som hovedprosjektet)

- 6-minutters kjøretidsgrense i Apps Script – skriptet varsler og hopper
  over resterende kilder hvis det nærmer seg grensen.
- Ferskhetsvinduet er satt til 72 timer (`TIDSVINDU_ARTIKKEL_TIMER` i
  `01_Konfigurasjon.gs`), ikke 24 – dette er trygt fordi deduplisering mot
  «Sendte artikler» uansett hindrer at noe sendes to ganger.
