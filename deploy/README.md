# One-click deploy templates

Templates we maintain for PaaS catalogs. All of them use the same image
(`ghcr.io/alphorn-dev/alphorn`) and PostgreSQL 18 (required: the schema uses
`uuidv7()`).

**Releasing:** `pnpm release X.Y.Z` pins the version in `render.yaml`,
`deploy/dokploy/alphorn/{docker-compose.yml,meta.json}` and
`deploy/coolify/alphorn.yaml`, commits, tags `vX.Y.Z` and pushes (after a
confirmation). Afterwards, update the image tag in the Railway template in the dashboard.

| Platform | File | How it reaches users |
|---|---|---|
| Render | `/render.yaml` (must be at repo root) | Deploy button in the README |
| Railway | none, lives in the Railway dashboard | Railway marketplace + deploy button |
| Dokploy | `deploy/dokploy/alphorn/` | PR to `Dokploy/templates` |
| Coolify | `deploy/coolify/alphorn.yaml` | Paste as custom compose (catalog closed) |

`BETTER_AUTH_URL` falls back to `RENDER_EXTERNAL_URL` or
`https://$RAILWAY_PUBLIC_DOMAIN` in `docker-entrypoint.sh`. An explicit value
always wins, so users set it when they add a custom domain.

## Render

Nothing to submit. The button is
`https://render.com/deploy?repo=https://github.com/alphorn-dev/alphorn`.
Uses the starter plan because the free plan sleeps and stops the embedded worker.

## Railway

1. Workspace > Templates > New Template.
2. Service `Postgres`: Railway's Postgres database, pinned to an 18 image
   (check the version; use image `postgres:18` with a volume at
   `/var/lib/postgresql` if the default isn't 18).
3. Service `Alphorn`: Docker image `ghcr.io/alphorn-dev/alphorn:<version>`,
   public networking on port 3000, health check path `/api/health`.
   Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   BETTER_AUTH_SECRET=${{secret(64)}}
   BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   PORT=3000
   ```
4. Deploy it once from the template and check that sign-up works.
5. Publish to the marketplace. Put "Support: support@alphorn.dev or GitHub
   issues" in the template description; Railway has no support-email field.
   Questions arrive in the template's queue on Central Station (Railway's
   forum), with notifications going to the email of the Railway account that
   answers. Answering that queue is required for kickbacks.
6. Add the deploy button to the README.

## Dokploy

1. Fork `Dokploy/templates`, copy `deploy/dokploy/alphorn/` to
   `blueprints/alphorn/`.
2. Run `node build-scripts/generate-meta.js --check`.
3. Open the PR. Test via the PR preview: copy the Base64 config, then in
   Dokploy go to Compose > Advanced > Import.

## Testing a compose template locally

```bash
cd deploy/dokploy/alphorn
POSTGRES_PASSWORD=test BETTER_AUTH_SECRET=$(openssl rand -base64 32) \
  BETTER_AUTH_URL=http://localhost:3000 docker compose -p tpl up -d
docker compose -p tpl exec alphorn wget -qO- http://127.0.0.1:3000/api/health
docker compose -p tpl down -v
```
