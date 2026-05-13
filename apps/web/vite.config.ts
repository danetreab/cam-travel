import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"

// No nitro plugin: this app follows the TanStack Start Bun hosting recipe
// (https://tanstack.com/start/v0/docs/framework/react/guide/hosting#bun) and
// runs the bun-native `server.ts` against the default tanstackStart build
// output at ./dist/client + ./dist/server/server.js.
const config = defineConfig({
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
