# Medieovervåking – Mal (Fase 1 + valgfri Fase 2, Apps Script)

Dette er en **generell, gjenbrukbar mal** for å sette opp en ny
medieovervåking i Google Apps Script. Den er bygget på samme kode som
«Maritime CleanTech»-overvåkingen (se `medieovervaking/`-mappen i dette
repoet), men uten noe som er spesifikt for den overvåkingen, og uten de
midlertidige feilsøkingsfilene som ble lagt til underveis der.

Fase 1 (RSS → søkeordfiltrering → e-post) fungerer helt uten AI. Fase 2
(valgfri AI-vurdering av relevans + notat per treff) er inkludert, men
avslått som standard – se steg 6.

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
   | `09_AITest.gs`             | `09_AITest`                          |
   | `10_AIIntegrasjon.gs`      | `10_AIIntegrasjon`                   |

   (Det finnes ingen `08`-fil i denne malen - den numreringen er reservert
   for prosjekt-spesifikke feilsøkingsfiler, som i Maritime CleanTech-
   mappen. `09` og `10` er AI-vurdering - se steg 6 under. De kan utelates
   helt hvis du ikke skal bruke AI-vurdering ennå; resten av malen (Fase 1)
   fungerer uten dem.)

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
   `Mottakere`, `Sendte artikler`, `Kjøringslogg`. (`Sendte artikler` har nå
   fem kolonner, inkl. to for AI-vurdering - se steg 6. `Kjøretidslogg`
   opprettes automatisk forst nar du faktisk bruker AI-vurdering.)

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

## 6. (Valgfritt) Skru på AI-vurdering av treff (Fase 2)

Dette er helt valgfritt – uten det kjører skriptet akkurat som ren Fase 1
(rå RSS-ingress, ingen AI-kall). Aktiver det nar du vil at Claude skal
vurdere relevans og skrive et kort notat for hvert nytt treff.

1. Sett tre Script Properties (**Prosjektinnstillinger → Skriptegenskaper**):
   - `ANTHROPIC_API_KEY` = din Anthropic API-nøkkel
   - `AI_MODEL` = `claude-haiku-5-5` (rimelig) eller `claude-sonnet-5-5` (dyrere, bedre vurderinger)
   - `AI_ENABLED` = `true` (alt annet, eller ikke satt i det hele tatt, betyr av)
2. **Tilpass systemprompten.** Åpne `09_AITest.gs` og se på `AI_SYSTEM_PROMPT`
   – den bruker allerede `PROSJEKTNAVN`, men vurder å legge til noen
   setninger om HVA overvåkingen faktisk gjelder (bransje, nøkkelbegreper,
   tvetydige søkeord som trenger kontekst – se eksemplene i selve filen).
   Jo mer presist Claude vet hva «relevant» betyr for ditt tema, jo bedre
   blir vurderingene.
3. **(Anbefalt) Test forst med `runAiTest()`** før du slår det på i den
   daglige kjøringen: lag en fane «AI-test» med kolonner
   `Overskrift | Ingress | Kilde | Forventet` i A–D, fyll ut noen testrader,
   og kjør `runAiTest()`. Resultatet skrives til E–K i samme fane – sjekk at
   relevansvurderingene stemmer med det du forventet før du stoler på det
   i skarp drift.
4. Kjør `kjorTest` med `AI_ENABLED=true` og sjekk e-posten: hvert treff bør
   nå ha et «AI-notat» under ingressen, og eventuelle treff AI-en mener er
   irrelevante skal dukke opp i en egen seksjon «Mulig irrelevant» nederst
   (fjernes aldri, bare omplassert). Sjekk ogsa den nye fanen
   `Kjøretidslogg` for antall kall, tokens og anslått kostnad.

**Sikkerhetsmekanismer innebygd:**
- Maks 40 AI-kall per kjøring, i batcher på 5.
- Eget tidsbudsjett på 4,5 minutter for AI-steget – brukes det opp, sendes
  resten av treffene uten notat (ikke droppet).
- AI-steget kan aldri blokkere e-postutsendingen, uansett hva som går galt
  (nettverksfeil, API-feil, uventede svar).
- Stopper automatisk (uten nye forsøk) hvis kontoens utgiftstak er nådd.
- Hvert treff vurderes maks én gang noensinne – aldri på nytt for en
  artikkel som allerede er registrert i «Sendte artikler».

## Kjente begrensninger (samme som hovedprosjektet)

- 6-minutters kjøretidsgrense i Apps Script – skriptet varsler og hopper
  over resterende kilder hvis det nærmer seg grensen.
- Ferskhetsvinduet er satt til 72 timer (`TIDSVINDU_ARTIKKEL_TIMER` i
  `01_Konfigurasjon.gs`), ikke 24 – dette er trygt fordi deduplisering mot
  «Sendte artikler» uansett hindrer at noe sendes to ganger.
