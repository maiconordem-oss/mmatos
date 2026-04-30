// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // The default `**/server/**` pattern from @lovable.dev/vite-tanstack-config
  // blocks our server-fn RPC files in `src/server/*.functions.ts`. Those files
  // are safe to import from client code because the server-fn Vite plugin
  // transforms them into RPC stubs. We allow `*.functions.ts` files via
  // onViolation; real server-only modules (`*.server.ts`) remain blocked.
  tanstackStart: {
    importProtection: {
      onViolation: (info: any) => {
        const id = String(info?.import ?? info?.resolved ?? "");
        if (/\.functions(\.ts|\.tsx)?$/.test(id)) return false;
        return true;
      },
    },
  },
});
