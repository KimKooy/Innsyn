# Innsyn

3D-innsynsapp for punktskyer (SLPK) hostet i ArcGIS Online. Bygges av Origon for interne ansatte og eksterne kunder.

Frittstående app — ikke relatert til Innsikten. Se [`CLAUDE.md`](./CLAUDE.md) for arkitektur og konvensjoner, og [`docs/m1-plan.md`](./docs/m1-plan.md) for nåværende milepæl.

## Komme i gang lokalt

Forutsetninger:

- Node.js 22+
- pnpm 9+
- Docker Desktop (for lokal Postgres)

```bash
pnpm install
pnpm db:up
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter @innsyn/backend exec prisma migrate dev --name init
pnpm dev
```

Backend: <http://localhost:3000>. Frontend: <http://localhost:5173>.

`GET /api/health` virker straks. `GET /api/me` returnerer **503** inntil IT har levert Entra-tenant-ID + audience for `innsyn-dev` og verdiene er fylt inn i `apps/backend/.env` (`AUTH_TENANT_ID`, `AUTH_AUDIENCE`) og `apps/frontend/.env` (`VITE_AUTH_*`).

## Struktur

```
apps/frontend/     React + Vite + Tailwind
apps/backend/      Express + Prisma
packages/shared/   TypeScript-typer delt mellom front og back
infra/bicep/       Azure-infrastruktur som kode (kommer)
docs/              Plan- og arkitekturdokumenter
```

## Skript

| Kommando | Beskrivelse |
| --- | --- |
| `pnpm dev` | Start frontend + backend parallelt |
| `pnpm typecheck` | `tsc --noEmit` på alle workspaces |
| `pnpm build` | Build alle workspaces |
| `pnpm db:up` / `pnpm db:down` | Start/stopp lokal Postgres |
| `pnpm db:migrate` | Kjør Prisma-migrasjon |
| `pnpm db:studio` | Åpne Prisma Studio |
