# The API token is supplied via the CLOUDFLARE_API_TOKEN environment variable,
# read directly by the provider — not as a Terraform variable.

variable "cloudflare_zone_id" {
  type        = string
  description = "Zone ID for rikrey.com (Cloudflare dashboard > Overview > API section)."
}

variable "web_hostname" {
  type        = string
  description = "Public hostname of the TanStack Start web app (the SSR frontend)."
  default     = "domnaer.rikrey.com"
}
