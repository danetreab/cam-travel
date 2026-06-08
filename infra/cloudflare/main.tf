terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  # Token is read from the CLOUDFLARE_API_TOKEN environment variable.
  # Create one at https://dash.cloudflare.com/profile/api-tokens with the
  # "Zone > Cache Rules > Edit" and "Zone > Zone > Read" permissions.
  # (No api_token here so Terraform never prompts for it as a variable.)
}

# Cache Rules live in the http_request_cache_settings phase ruleset.
# This single zone-level ruleset holds all of our cache rules; add more
# entries to `rules` to extend it.
resource "cloudflare_ruleset" "cache_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "Static asset caching"
  description = "Edge-cache fingerprinted assets and static files"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      ref         = "cache_static_assets"
      description = "Force-cache /assets/ and static files at the edge"
      enabled     = true

      # Matches the fingerprinted build output (/assets/) plus any static
      # file extension served from public/. Mirrors the Cache-Control headers
      # that apps/web/server.ts sets when serving ./dist/client.
      #
      # Scoped to the web host: rikrey.com is a multi-app zone (api/auth/admin
      # also live here), so we only force-cache the public web frontend. To
      # also cache the admin SPA, add `"admin.${var.web_hostname}"` to the
      # http.host set below.
      expression = <<-EOT
        (http.host in {"${var.web_hostname}"})
        and (
          (starts_with(http.request.uri.path, "/assets/"))
          or (http.request.uri.path.extension in {"js" "css" "mjs" "map" "png" "jpg" "jpeg" "gif" "svg" "ico" "webp" "avif" "woff" "woff2" "ttf" "otf"})
        )
      EOT

      action = "set_cache_settings"
      action_parameters = {
        # Make these responses eligible for the Cloudflare cache.
        cache = true

        # Honor the Cache-Control headers the origin already sets
        # (immutable, max-age=31536000 for fingerprinted assets; shorter for
        # the rest — see apps/web/server.ts).
        edge_ttl = {
          mode = "respect_origin"
        }
        browser_ttl = {
          mode = "respect_origin"
        }

        # Serve slightly stale assets while revalidating to avoid origin hits.
        serve_stale = {
          disable_stale_while_updating = false
        }
      }
    }
  ]
}
