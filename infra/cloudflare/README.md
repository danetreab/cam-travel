# Cloudflare cache rules (Terraform)

Manages Cloudflare Cache Rules for the `rikrey.com` zone as code.

Currently defines one rule: **force-cache static assets** (`/assets/` + static
file extensions) at the edge for the web frontend (`domnaer.rikrey.com`),
honoring the `Cache-Control` headers that `apps/web/server.ts` already sets when
serving `./dist/client`.

The web app is TanStack Start (React SSR) served by a bun-native `server.ts`
behind nginx/Coolify on Cloudflare. The SSR server tags fingerprinted assets
with `Cache-Control: public, max-age=31536000, immutable`; this rule makes
Cloudflare actually cache them at the edge so repeat requests never reach the
origin.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- A Cloudflare API token with **Zone → Cache Rules → Edit** (and Zone → Read).
  Create one at https://dash.cloudflare.com/profile/api-tokens
- The zone ID for `rikrey.com` (Cloudflare dashboard → the domain → Overview →
  right sidebar "API" section).

## Usage

```bash
cd infra/cloudflare

export CLOUDFLARE_API_TOKEN="<your-token>"

cp terraform.tfvars.example terraform.tfvars   # then set cloudflare_zone_id

terraform init
terraform plan      # review the rule it will create
terraform apply
```

After `apply`, verify a hit in the dashboard (Caching → Cache Rules) or via curl:

```bash
curl -sI https://domnaer.rikrey.com/assets/<some-fingerprinted-file>.js | grep -i cf-cache-status
# expect: cf-cache-status: HIT  (after the first request warms it)
```

## Notes

- `rikrey.com` is a multi-app zone (`api`, `auth`, `admin` subdomains also live
  here), so the rule is scoped to `http.host == domnaer.rikrey.com` to avoid
  edge-caching look-alike paths on the API/auth origins. Override the host with
  the `web_hostname` variable.
- To also cache the admin SPA (`admin.domnaer.rikrey.com`, served as static
  files by nginx), add it to the `http.host` set in `main.tf`.
- State is stored locally (`terraform.tfstate`, gitignored). For team use, move
  state to a remote backend (R2/S3) before sharing.
- To add more rules (e.g. bypass `/graphql`, cache public HTML), append entries
  to the `rules` list in `main.tf`.
