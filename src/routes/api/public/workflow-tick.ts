import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runExecution } from "@/server/workflow-executor.server";

/**
 * Cron endpoint: resumes any workflow executions whose `next_run_at` has passed.
 * Call periodically (e.g. every minute) from an external scheduler.
 *
 * URL: https://project--{id}.lovable.app/api/public/workflow-tick
 */
export const Route = createFileRoute("/api/public/workflow-tick")({
  server: {
    handlers: {
      GET: async () => {
        const now = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("workflow_executions")
          .select("id, user_id")
          .eq("status", "running")
          .lte("next_run_at", now)
          .limit(20);

        const results: any[] = [];
        for (const e of due ?? []) {
          try {
            await runExecution({ admin: supabaseAdmin, userId: e.user_id }, e.id);
            results.push({ id: e.id, ok: true });
          } catch (err: any) {
            results.push({ id: e.id, error: err.message });
          }
        }
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
