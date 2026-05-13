import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const envClient = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_URL: z.string().url(),
    VITE_AUTH_URL: z.string().url(),
    VITE_GRAPHQL_HTTP_URL: z.string().url(),
    VITE_GOOGLE_CLIENT_ID: z.string(),
    VITE_PUBLIC_MAP_KEY: z.string(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
