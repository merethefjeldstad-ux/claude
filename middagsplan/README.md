# Middagsplan

Enkel, mobilvennlig web-app for en husstand med to brukere: ukesmeny styrt av
dagligvaretilbud og kalendertid, pluss en delt handleliste.

Dette er **fase 1**. Fase 2 (automatisk aggregert handleliste fra rettenes
ingredienser) er ikke bygget, men datamodellen (se `prisma/schema.prisma`) er
lagt til rette for det — se kommentarene der.

## Teknologi

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite (filbasert database — enkelt å drifte for en husholdning)
- Tailwind CSS
- NextAuth (Google OAuth, kun kalender-lesetilgang)
- `node-cron` i en frittstående scheduler-prosess (`scripts/scheduler.ts`)
- Vitest for enhetstester

## Kom i gang (lokal utvikling)

```bash
npm install
cp .env.example .env.local   # fyll inn verdier, se under
npx prisma migrate dev       # oppretter SQLite-db + kjører seed automatisk
npm run dev
```

Åpne http://localhost:3000. Uten tilbud/kalender generert ennå vises en tom
tilstand på Meny-fanen — kjør mandagsjobben manuelt (se under) for å teste.

## Miljøvariabler

Se `.env.example` for full liste og forklaring. De viktigste:

- `DATABASE_URL` — sti til SQLite-fil.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_URL` / `NEXTAUTH_SECRET`
  — Google-innlogging for kalendertilgang.
- `KASSALAPP_API_KEY` — valgfritt i fase 1 (prissammenligning, ikke tilbud).
- `CRON_SECRET` — delt hemmelighet mellom scheduler-scriptet og
  `/api/cron/*`-endepunktene, så de ikke kan trigges utenfra.
- `APP_URL` — URL-en scheduler-scriptet kaller.

## VIKTIG: Google OAuth-appen må stå i "Production"

I Google Cloud Console (APIs & Services → OAuth consent screen) må appen stå i
**Production**-status, ikke **Testing**, FØR noen av de to brukerne logger inn
første gang. I Testing-status utløper refresh token automatisk etter 7 dager,
og den automatiske ukentlige/daglige kjøringen vil da slutte å kunne lese
kalenderen — stille, uten varsel i UI-et (kun i loggene).

Steg:
1. Opprett et prosjekt i Google Cloud Console.
2. Aktiver **Google Calendar API**.
3. Sett opp OAuth-samtykkeskjermen (OAuth consent screen) → **Production**.
   Siden dette er et privat husholdningsverktøy med kun to brukere, holder
   det med "External" + de to e-postadressene lagt til (evt. "Internal" hvis
   dere bruker Google Workspace).
4. Opprett OAuth-klient (Web application), legg til
   `<NEXTAUTH_URL>/api/auth/callback/google` som redirect URI.
5. Begge de to brukerne logger inn via appens innloggingsflyt (NextAuth/Google),
   og godkjenner kalender-lesetilgang.

## Datakilder for tilbud

To kilder brukes sammen, med ulike roller:

- **Kassal.app** (`lib/kassalapp/client.ts`) — offisiell, dokumentert API
  (kassal.app/api/docs). Brukes til prissammenligning (current_price), IKKE
  til tilbud — Kassalapp har ikke noe kampanje-/tilbudsendepunkt.
- **Tjek/etilbudsavis** (`lib/offers/tjek-adapter.ts`) — samme datagrunnlag
  som etilbudsavis.no og Mattilbud-appen. Dette er en **uoffisiell,
  ikke-dokumentert API** (`api.etilbudsavis.dk/v2`). All kontakt med denne
  kilden skjer isolert i `lib/offers/` — resten av appen forholder seg kun
  til `NormalizedOffer`. Adapteren kaster aldri: feil for én kjede logges og
  rapporteres i en `OfferFetchLog`-rad i databasen, uten å stoppe henting for
  de andre kjedene.

  **Dealer-IDer** (`lib/offers/dealers.ts`) er reverse-engineerede/uoffisielle,
  opprinnelig hentet fra to offentlige kilder som bruker samme API:
  [tilbudstrolden-mcp](https://github.com/olgasafonova/tilbudstrolden-mcp) og
  [discount-getter](https://github.com/elvios/discount-getter). Disse kan
  slutte å stemme uten varsel.

  **Live-testet 2026-09-09:** endepunktet, `dealer_ids`-parameteret og
  Rema 1000-IDen (`faa0Ym`) er bekreftet mot det ekte APIet — se ekte
  eksempel-respons og feltnavn i git-historikken/PR-beskrivelsen. Feltene
  adapteren leser (`heading`, `pricing.price`/`pre_price`, `dealer`/
  `branding.name`, `run_from`/`run_till`, `id`) stemmer med det APIet
  faktisk returnerer.

  **Coop Mega mangler fortsatt en verifisert dealer-ID.** `GET /v2/dealers`
  filtrerer IKKE pålitelig på `country_id=NO` (bekreftet: den returnerer
  stort sett danske kjeder uansett), og vi lette gjennom APIets fulle
  paginering (maks 1000 treff) uten å finne "Coop Mega" i listen. Coop er
  uansett lavest prioritert i butikkvalg-regelen, så dette er ikke
  kritisk — men legg inn IDen i `DEALER_IDS` i `lib/offers/dealers.ts` hvis
  den dukker opp senere (f.eks. ved å søke i responsen fra
  `GET /v2/offers?dealer_ids=<gjettet-id>` for kjente Coop Mega-butikker).

  Sjekk `OfferFetchLog`-tabellen jevnlig (eller ved mistanke om at menyen
  ser rar ut) for å se om en kjede har sluttet å svare.

## Match mellom retter og tilbud

`data/recipes.json` er generert fra den vedlagte oppskriftslisten. Hver rett
har ett eller flere nøkkelord (`keywords`) som matches mot tilbudets
produktnavn (enkel, case-insensitiv substring-sjekk i
`lib/menu/match.ts`) — bevisst enkelt fremfor en tung ingredienstaksonomi.
Retter uten fast hovedingrediens (Pizza, Vegetarcurry) har `flexible: true`
og et bredere, kuratert nøkkelordsett. Vil dere justere hvilke ord som
trigger en rett, rediger `data/recipes.json` og kjør `npm run seed` på nytt.

**Live-funn:** ekte Rema 1000-tilbud viste at kjøttdeig ofte selges under
navn som "DEIG AV SVIN/STORFE" eller "KARBONADEDEIG", ikke bare "kjøttdeig".
Nøkkelordene for alle kjøttdeig-baserte retter er derfor utvidet med
`karbonadedeig`, `deig av svin`, `deig av storfe` og `kvernet`. Dette er
trolig ikke det siste eksempelet på at ekte produktnavn varierer mer enn
antatt — følg med på om menyen ser ut til å gå glipp av åpenbare tilbud, og
utvid nøkkelordlisten etter behov.

## Kalender → tid til middag

`lib/calendar/time-budget.ts` oversetter kveldens kalenderavtaler (default
kveldsvindu 16:00–21:00) til kjapt/middels/tidkrevende ut fra to justerbare
terskler. Terskelverdiene ligger i databasen (`TimeBudgetConfig`, én rad) —
endre dem direkte i databasen (f.eks. med `npx prisma studio`) uten
kodeendring eller redeploy:

```
eveningStart / eveningEnd     — kveldsvinduet (HH:mm)
kjaptMaxMinutes                — under denne = "kjapt"
middelsMaxMinutes              — under denne (og over kjaptMax) = "middels", ellers "tidkrevende"
```

**Dokumentert antakelse:** når begge brukeres kalendere sjekkes, brukes den av
de to som har mest ledig tid den kvelden (det holder at én kan lage middag).
Ønsker dere heller at begge må være ledige samtidig, er det kun
`computeDayTimeBudget` i denne filen som må endres.

## Butikkvalg-regel (klargjort for fase 2)

`lib/store-selection/select-store.ts` + `StoreSelectionConfig` i databasen
(`trumfPriceThreshold`, default 0) er klare til bruk, men kalles ikke fra
menylogikken i fase 1 — der vises kun hvilken butikk det enkelttilbudet som
utløste en rett kom fra. Full handlekurv-sammenligning krever den aggregerte
handlelisten fra fase 2.

## Automatisering (Europe/Oslo, sommer-/vintertid håndtert automatisk)

`scripts/scheduler.ts` er en frittstående Node-prosess (kjøres ved siden av
Next.js-serveren, f.eks. som en egen systemd-tjeneste/Docker-container/PM2-
prosess) som bruker `node-cron` med `timezone: "Europe/Oslo"`:

- **Mandag 10:00**: `POST /api/cron/weekly` — henter ukens tilbud, leser
  kalenderen, genererer ny ukesmeny.
- **Hver dag 22:00**: `POST /api/cron/daily` — sjekker om kalenderen er
  endret; hvis en dags tidsbudsjett ikke lenger stemmer med den tildelte
  retten, byttes dagene om blant de allerede valgte rettene for uken (henter
  aldri inn en ny, ukontrollert rett). Justeringen vises i UI-et
  ("· justert i dag").

Start scheduleren:

```bash
npm run scheduler
```

Begge endepunktene krever header `x-cron-secret: <CRON_SECRET>` — de kan
også trigges manuelt (f.eks. for å teste, eller fra en annen
skedulerings-plattform enn `node-cron` om dere heller vil bruke f.eks.
Vercel Cron, GitHub Actions eller en systemd-timer — pass da på at
plattformen enten støtter IANA-tidssoner direkte, eller regn om til UTC og
husk å justere for sommer-/vintertid selv).

Ingen push-varsler eller e-post sendes — feil logges (stdout/stderr,
strukturert JSON) og i `OfferFetchLog`-tabellen.

## Struktur

```
app/(app)/            Meny- og Handleliste-fanene (mobilvennlig UI)
app/api/               API-ruter (meny, handleliste, cron, auth)
lib/offers/            Isolert Tjek/etilbudsavis-adapter + lagring
lib/kassalapp/          Kassalapp-klient (prissammenligning)
lib/calendar/           Google Calendar-henting + tid-til-middag-logikk
lib/menu/                Matching, ukesgenerering, daglig ombalansering
lib/store-selection/    Butikkvalg-regel (fase 2-grunnmur)
prisma/schema.prisma    Datamodell (kommentert med fase 2-forberedelser)
data/recipes.json        Oppskriftslisten, strukturert med nøkkelord
scripts/scheduler.ts     Europe/Oslo-cron (mandag 10:00 / daglig 22:00)
```

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

UI-et er visuelt verifisert mot skissen (kortbasert dagsoversikt,
fargekodede tidsbruk-merkelapper, bunn-faner) med en lokalt generert
demo-meny og skjermbilder i mobilvisning (390×844).
