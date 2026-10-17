# RALPH — Rapid Assessment for Little Patients in Healthcare

Hack the Valley 11. A friendly raccoon on a waiting-room tablet helps kids (4–12) tell the care team how they feel, and helps nurses catch a child getting worse sooner.

> Prototype. **Synthetic data only. Not a medical device. No diagnosis.** Triage rules are team-defined demo rules; real use would require clinician-validated criteria.

## Run it locally
Requires Node 22+ and pnpm (`npm i -g pnpm`).

```sh
pnpm install
cp .env.example .env      # fill in GEMINI_API_KEY, DATABASE_URL, etc.
pnpm db:migrate           # once DATABASE_URL points at Tiger Cloud
pnpm dev                  # api :3001 + web :5173
```

- Kiosk: http://localhost:5173/kiosk
- Staff dashboard: http://localhost:5173/staff
- To test on a phone/iPad on the same Wi-Fi, use the "Network" URL Vite prints (mic needs HTTPS outside localhost — use the deployed site for voice).

Other scripts: `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Deploy (Vultr)
```sh
DOMAIN=your.domain docker compose up -d --build
```
Caddy gets TLS automatically and proxies `/api` + `/socket.io` to the API.

## Layout
`apps/web` (React kiosk + dashboard) · `apps/api` (Fastify) · `packages/shared` (types, Zod schemas, triage trees + rules). Docs for humans in `docs/`; context for Claude Code in `CLAUDE.md` and `.claude/skills/`.
