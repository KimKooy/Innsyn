# Innsyn

3D-innsynsapp for punktskyer (SLPK) hostet i ArcGIS Online. Bygges av Origon for interne ansatte og eksterne kunder. Frittstående app — IKKE relatert til Innsikten (Origons interne prosjektverktøy).

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind, ArcGIS Maps SDK for JavaScript **5.x** med web components (`@arcgis/map-components`, `@arcgis/core`)
- **Backend:** Node.js 22 + Express + TypeScript, Prisma ORM
- **DB:** Azure Database for PostgreSQL (Flexible Server)
- **Storage:** Azure Blob Storage (assets), Azure Key Vault (secrets)
- **Hosting:** Azure Static Web Apps (frontend), Azure App Service Linux (backend)
- **Auth sluttbruker:** Entra ID med B2B Collaboration (MSAL.js)
- **Auth AGOL:** OAuth2 client_credentials (server-side token broker)
- **Monorepo:** pnpm workspaces

## Struktur

```
apps/frontend/        React-app
apps/backend/         Express-API
packages/shared/      Delte TypeScript-typer
infra/bicep/          Azure infrastruktur som kode
docs/                 Arkitektur, auth-flow, datamodell
```

## Kommandoer

```bash
pnpm install                  # installer alt
pnpm dev                      # start frontend + backend parallelt
pnpm --filter frontend dev    # bare frontend (Vite, port 5173)
pnpm --filter backend dev     # bare backend (tsx watch, port 3000)
pnpm build                    # bygg alt
pnpm test                     # kjør alle tester
pnpm --filter backend prisma migrate dev   # database-migrasjon
pnpm --filter backend prisma studio        # database-UI
pnpm lint                     # ESLint
pnpm typecheck                # tsc --noEmit på alt
```

## Kodekonvensjoner

- **TypeScript strict mode** overalt. Ingen `any`. Bruk `unknown` ved usikkerhet og narrow.
- **Named exports**, ikke default exports.
- **Funksjonelle React-komponenter** med hooks. Ingen klassekomponenter.
- **Norsk i UI-tekst**, engelsk i kode og kommentarer.
- **Filnavn:** `kebab-case` for moduler, `PascalCase.tsx` for React-komponenter.
- **Database:** snake_case kolonnenavn, camelCase i Prisma client.
- **API-ruter:** REST-stil, `/api/scenes/:id`, ikke `/api/getScene`.
- **Logging:** bruk Pino. Aldri `console.log` i committed kode.
- **Error handling:** kast typede Error-klasser i backend (NotFoundError, ForbiddenError, ValidationError), mappes til HTTP-statuskoder i en error-middleware.
- **Imports:** absolutte fra `@/` (frontend) eller `~/` (backend), ikke `../../../`.

## ArcGIS-spesifikt

- Versjon **5.x** av Maps SDK. Widgets (`@arcgis/core/widgets/*`) er deprecated og fjernes i 6.0 (Q1 2027). **Bruk web components** (`<arcgis-scene>`, `<arcgis-measurement-line-3d>` osv.) eller programmatiske Analysis-objekter (`DirectLineMeasurementAnalysis`, `SliceAnalysis`).
- Importer 3D-komponenter via `@arcgis/map-components`.
- Bruk `$arcgis.import()` for dynamisk lasting i HTML-kontekst, ESM-imports i React-kontekst.
- SLPK lastes via `<arcgis-scene item-id="...">` med item-ID fra AGOL.
- AGOL-token MÅ være registrert i `IdentityManager` FØR scene-component initialiseres.
- For Innsyn-stylet egen toolbar: bruk Analysis-API direkte, ikke wrap default-components.

## Auth-flyt (kritisk å forstå)

To uavhengige tokens i spill:

1. **Entra JWT** — sluttbrukerens identitet, validert av backend på hver request
2. **AGOL access token** — appens identitet mot AGOL, hentet via client_credentials, cachet i backend, sendt til frontend som del av `GET /api/scenes/:id`-respons

Frontend registrerer AGOL-token i `IdentityManager.registerToken()` før Maps SDK gjør API-kall. Token er kortlivet (2 timer) og fornyes ved behov.

Eksterne brukere logger inn via Entra B2B — deres egen Microsoft-konto i deres egen tenant, gjest i Origons tenant. De ser ALDRI AGOL.

## Datamodell (overordnet)

Se `docs/datamodel.md` for full detalj. Kjernen:

- `User` — bruker, opprettes automatisk fra Entra JWT ved første login
- `Group` — kundegruppe (f.eks. "Bane NOR · Skarpsno")
- `GroupMembership` — bruker i gruppe + rolle (viewer / contributor / admin)
- `Scene` — peker til SLPK i AGOL (item-ID + scene service URL)
- `SceneGroupAccess` — kobling scene ↔ gruppe
- `Asset` — fil knyttet til posisjon i scene
- `Measurement` — lagret måling
- `Bookmark` — lagret kameraposisjon
- `Annotation` — kommentar/notat i 3D
- `AuditLog` — alle aksjoner

## Tilgangskontroll

Hver request til scene-relaterte endepunkter må kjøre en tilgangssjekk:

```ts
async function userCanAccessScene(userId, sceneId) {
  // joins gjennom group_membership og scene_group_access
}
```

Interne Origon-brukere kan ha en "Origon · alle ansatte"-gruppe som har tilgang til alle scener.

## Forbudt

- ALDRI commit secrets. Bruk Key Vault og miljøvariabler.
- ALDRI eksponer `clientSecret` for AGOL i frontend. Den lever kun i backend.
- ALDRI logg AGOL-token eller Entra JWT i klartekst.
- ALDRI bruk deprecated widgets fra `@arcgis/core/widgets/*` i ny kode.
- ALDRI lag per-user AGOL-pålogging. App credentials only.
- ALDRI tillat at en bruker laster opp SLPK direkte. SLPK-publisering skjer manuelt i AGOL.
- ALDRI skriv `any`-typer eller bruk `@ts-ignore` uten kommentar som forklarer hvorfor.

## Workflow for ny funksjonalitet

1. Lag ny branch fra `main`. Aldri commit direkte til `main`.
2. Hvis datamodell endres: oppdater `prisma/schema.prisma` først, kjør `prisma migrate dev --name kort-beskrivelse`.
3. Backend først: types i `packages/shared/`, route i `apps/backend/src/routes/`, evt. service i `apps/backend/src/services/`.
4. Frontend etterpå: bruk types fra `packages/shared/`, komponent i `apps/frontend/src/`.
5. Skriv unit-test for ny service-funksjon. E2E-test om det er en kritisk flyt.
6. `pnpm typecheck && pnpm lint && pnpm test` må passere før commit.
7. PR mot `main`. Squash-merge.

## Designsystem

Innsyn matcher Innsikten visuelt selv om kodebasen er separat. Se `docs/design-tokens.md` for fargepalett, typografi, spacing. Hovedfarger:

- Primary (teal): `#1cb5a8`
- Bakgrunn-soft: `#f0f7fc`
- Tekst: `#1a2733`
- Border: `#dbe6ed`

Font: system-stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif`).

## Når du er usikker

- Sjekk `docs/` for arkitekturbeslutninger.
- Spør i PR-kommentar før du gjør store endringer i datamodell, auth-flyt, eller AGOL-integrasjon.
- ArcGIS SDK 5.x har breaking changes fra 4.x — sjekk alltid offisiell dokumentasjon på developers.arcgis.com/javascript/latest, ikke gamle eksempler.
