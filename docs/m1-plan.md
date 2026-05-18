# M1 — Skjelett og auth

**Definition of done:** Testbruker logger inn via Entra, backend validerer JWT, User-rad opprettes i Postgres ved første login, `GET /api/me` returnerer profilen, og navn vises i TopBar.

## Forhåndsvalg

- **Region:** Norway East
- **Pakkemanager:** pnpm (workspaces)
- **Environments:** kun prod fra start; staging i M9 før pilot. Lokal dev mot Docker-Postgres.
- **Entra-app-reg:** separate per env. I M1 opprettes `innsyn-dev` (localhost) og `innsyn-prod`. AGOL-broker og Graph-invite kommer i M2/M6.
- **Postgres SKU (prod):** Burstable B2s, 32 GB, Norway East. HA av i starten.

## Repo-struktur (M1)

```
innsyn/
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── auth/         msal-config.ts, AuthProvider.tsx, useAccount.ts
│   │   │   ├── components/   TopBar.tsx
│   │   │   ├── lib/          api-client.ts
│   │   │   ├── App.tsx, main.tsx, index.css
│   │   └── index.html, vite.config.ts, tsconfig.json, tailwind.config.ts
│   └── backend/
│       ├── src/
│       │   ├── middleware/   auth.ts, errors.ts
│       │   ├── routes/       me.ts, health.ts
│       │   ├── services/     user-service.ts
│       │   ├── lib/          prisma.ts, logger.ts, config.ts
│       │   └── server.ts
│       └── prisma/           schema.prisma, migrations/
├── packages/shared/src/types/  user.ts, errors.ts
├── infra/bicep/                main.bicep + moduler (committet, ikke deployet i M1)
├── docs/                       m1-plan.md, architecture.md, auth-flow.md, datamodel.md
├── docker-compose.yml          lokal Postgres
├── pnpm-workspace.yaml, package.json, tsconfig.base.json, .gitignore, .env.example
└── CLAUDE.md
```

## NPM-pakker (M1)

**Frontend:** `react`, `react-dom`, `react-router-dom`, `@azure/msal-browser`, `@azure/msal-react`, `tailwindcss`/`postcss`/`autoprefixer`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react*`.

**Backend:** `express`, `cors`, `helmet`, `jose` (JWT-validering mot Entra JWKS), `@prisma/client`, `prisma`, `pino`, `pino-http`, `zod` (env- og request-parsing), `tsx`, `typescript`, `@types/express`, `@types/node`.

**Rot:** `prettier`, `eslint`, `@typescript-eslint/*`, `eslint-plugin-react-hooks`.

**Bevisst utelatt fra M1:** `@arcgis/core`, `@arcgis/map-components`, `@azure/storage-blob`, `@azure/identity`, `@microsoft/microsoft-graph-client` — kommer i M2+.

## Filer som opprettes i M1

- **Monorepo-konfig:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.env.example`, `docker-compose.yml`, `README.md`.
- **Shared:** `packages/shared/src/types/user.ts` (UserDTO: `oid`, `email`, `displayName`), `errors.ts`.
- **Backend:**
  - `prisma/schema.prisma` — `User`-modell (`id`, `entra_oid` unik, `email`, `display_name`, `created_at`, `last_login_at`) + initial migrasjon
  - `src/lib/config.ts` (Zod-parsing av env), `prisma.ts` singleton, `logger.ts` (Pino)
  - `src/middleware/auth.ts` — verifiserer JWT mot Entra JWKS, audience-sjekk, putter `req.user` (oid, email, name)
  - `src/middleware/errors.ts` — `NotFoundError`, `ForbiddenError`, `ValidationError` → HTTP
  - `src/services/user-service.ts` — `getOrCreateUserFromJwt(claims)`, oppdaterer `last_login_at`
  - `src/routes/me.ts` (`GET /api/me`), `src/routes/health.ts` (`GET /api/health`)
  - `src/server.ts` — helmet, cors, pino-http, auth, routes, error-middleware
- **Frontend:**
  - `src/main.tsx`, `App.tsx`, `index.css` (Tailwind-imports)
  - `src/auth/msal-config.ts`, `AuthProvider.tsx` (MsalProvider + interaktiv login), `useAccount.ts` (konto + `acquireTokenSilent`)
  - `src/lib/api-client.ts` — fetch-wrapper som henter token og setter `Authorization: Bearer …`
  - `src/components/TopBar.tsx` — viser displayName fra `/api/me`
- **Infra (Bicep, committes — ikke deployet i M1):** `main.bicep`, `postgres.bicep`, `app-service.bicep`, `swa.bicep`, `keyvault.bicep`, `blob.bicep`, `entra.md` (manuelle steg for app-reg).
- **Docs:** `m1-plan.md` (denne), `auth-flow.md` (sekvensdiagram Entra-login + JWT-validering), `architecture.md`, `datamodel.md` (User nå, resten kommer).

## Rekkefølge / blokkeringer

1. Monorepo-skall (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.gitignore`) → frigjør alt nedenfor.
2. `packages/shared` kompilerer med tom export → frigjør backend og frontend.
3. Backend-skjelett: Express + Pino + `/api/health` + error-middleware → frigjør auth-arbeid.
4. Docker Compose opp + `prisma migrate dev --name init` → frigjør user-service.
5. JWT-middleware (Entra JWKS) + user-service + `GET /api/me`.
6. Frontend-skjelett: Vite + Tailwind + tom TopBar → frigjør MSAL.
7. MSAL-config + AuthProvider + `acquireTokenSilent` + kall mot `/api/me` med Bearer-token.
8. Manuell ende-til-ende-test: logg inn, se navn i TopBar, verifiser User-rad i Prisma Studio.
9. Bicep og prod-Entra-reg ferdigstilles (committes), men deployes først i M2.

## Azure-ressurser som må eksistere før lokal dev

**Nødvendig før lokal kjøring:**
- **Entra app-registrering `innsyn-dev`** i Origons tenant:
  - SPA-platform, redirect `http://localhost:5173`
  - Expose an API: scope `access_as_user`, audience = clientId
  - API permissions: `User.Read` (delegert)
- **Postgres:** kjøres lokalt via Docker Compose. Ingen Azure-ressurs trengs i M1.

**Ikke nødvendig i M1, opprettes i Bicep og deployes i M2:**
- Resource group `rg-innsyn-prod` (Norway East)
- PostgreSQL Flexible Server (Burstable B2s, 32 GB)
- App Service Plan (Linux, B1) + App Service (Node 22)
- Static Web App
- Storage Account (blob)
- Key Vault
- Entra app-reg `innsyn-prod`

## Risiko / punkter å bekrefte før implementasjon

- **Tenant for Entra-app-reg:** bekreft at jeg bruker Origons hoved-tenant (samme som Innsikten), og at jeg har rett til å opprette app-registreringer der.
- **Person-felter:** UserDTO modelleres med `oid` + `email` (ikke fri tekst), jf. lagret feedback fra Innsikten.
- **GitHub-repo:** trenger navn og org for opprettelse (`Origon-AS/innsyn`?).
