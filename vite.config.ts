// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // The default importProtection blocks any path under **/server/**.
  // We allow `src/server/**.functions.ts` (server-fn RPC files are safe to import
  // from client because the plugin transforms them into RPC stubs) while still
  // blocking actual server-only modules (`*.server.ts`) and the `server-only` package.
  tanstackStart: {
    importProtection: {
      behavior: "error",
      client: {
        files: ["**/*.server.*"],
        specifiers: ["server-only"],
      },
    },
  },
});
