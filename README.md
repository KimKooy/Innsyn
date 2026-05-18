# Innsyn

3D-innsynsapp for punktskyer / IntegratedMesh hostet i ArcGIS Online (eller Geodata Online). Bygges av Origon for interne ansatte og eksterne kunder.

Frittstående app — ikke relatert til Innsikten. Se [`CLAUDE.md`](./CLAUDE.md) for arkitektur og konvensjoner, og [`docs/m1-plan.md`](./docs/m1-plan.md) for M1.

## Hva er ferdig

| Milepæl | Status |
| --- | --- |
| **M1** Skjelett + auth-middleware | ✅ kode klar (MSAL i frontend venter på IT) |
| **M2** Scene-visning | ✅ partial — IntegratedMesh-rendring fungerer; full DB-koblet scene-liste utsatt til M5 |
| **M3** Måleverktøy | ✅ distance / area / volume / profile / slice + liste + CSV-eksport |
| **M4** Assets | ✅ kode klar (Postgres + Azurite må kjøre for å teste flyten ende-til-ende) |
| **Multi-scene** | ✅ config-drevet registry i [`apps/frontend/src/scene/scenes.config.ts`](apps/frontend/src/scene/scenes.config.ts) |

## Komme i gang lokalt

Minimum (kun frontend + scene-visning + målinger):

- Node.js 22+
- pnpm 9+

```bash
pnpm install
cp apps/frontend/.env.example apps/frontend/.env
pnpm dev
```

Frontend: <http://localhost:5173>. Vollsveien-meshet kommer opp som standard scene.

For full funksjonalitet (assets, brukerprofil) trenger du også:

- **Docker Desktop** — lokal Postgres via `pnpm db:up`
- **Azurite** — lokal Azure Blob-emulator (`npx azurite-blob --silent`) eller en faktisk storage account
- **Entra-app-registrering** — IT må levere tenant-ID + audience for `innsyn-dev` (se `docs/m1-plan.md`)

```bash
pnpm db:up
cp apps/backend/.env.example apps/backend/.env
# fyll inn AUTH_TENANT_ID + AUTH_AUDIENCE + AZURE_STORAGE_* i .env
pnpm --filter @innsyn/backend exec prisma migrate dev --name init
pnpm dev
```

`GET /api/health` virker alltid. `GET /api/me` og `/api/assets/*` returnerer **503** inntil tilhørende env-variabler er satt.

## Struktur

```
apps/frontend/                      React + Vite + Tailwind + ArcGIS SDK 5.x
  src/scene/scenes.config.ts        Registry over tilgjengelige scener
  src/scene/SceneViewer.tsx         <arcgis-scene>-wrapper
  src/scene/MeasurementToolbar.tsx  M3 toolbar (5 verktøy)
  src/scene/useSceneMeasurements.ts M3 state hook
  src/scene/AssetToolbar.tsx        M4 plasser-asset
  src/scene/AssetUploadModal.tsx    M4 opplastingsmodal
  src/scene/AssetDetails.tsx        M4 detaljpanel
  src/scene/useSceneAssets.ts       M4 state hook + GraphicsLayer
apps/backend/                       Express + Prisma + Pino + jose
  src/routes/assets.ts              /api/assets (auth + Zod)
  src/services/asset-service.ts     Asset CRUD + ownership check
  src/services/blob-service.ts      Azure Blob SAS-signering
packages/shared/                    DTO-typer delt mellom front og back
docs/                               Plan- og arkitekturdokumenter
```

## Legge til ny scene

Rediger [`apps/frontend/src/scene/scenes.config.ts`](apps/frontend/src/scene/scenes.config.ts) og legg til en oppføring i `builtIn`-arrayet. Eksempel for en Geodata Online IntegratedMesh:

```ts
{
  id: 'mitt-prosjekt',
  title: 'Mitt prosjekt',
  type: 'integrated-mesh',
  serviceUrl: 'https://services.geodataonline.no/.../SceneServer',
  wkid: 25833, // ETRS89 / UTM 33N for de fleste norske oppdrag
}
```

For AGOL Web Scenes: bruk `type: 'web-scene'` og `itemId: '...'` istedenfor.

## Skript

| Kommando | Beskrivelse |
| --- | --- |
| `pnpm dev` | Start frontend + backend parallelt |
| `pnpm typecheck` | `tsc --noEmit` på alle workspaces |
| `pnpm build` | Build alle workspaces |
| `pnpm db:up` / `pnpm db:down` | Start/stopp lokal Postgres (Docker Compose) |
| `pnpm db:migrate` | Kjør Prisma-migrasjon |
| `pnpm db:studio` | Åpne Prisma Studio |

> **Windows-merknad:** Hvis `pnpm dev` henger på backend etter en `prisma generate`, kjør backend og frontend i separate terminaler:
>
> ```powershell
> pnpm --filter @innsyn/backend exec tsx --env-file=.env src/server.ts
> pnpm --filter @innsyn/frontend exec vite
> ```
