import { createFileRoute } from "@tanstack/react-router";
import { handleFunnelMessage } from "@/server/funnel-executor.server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const Route = createFileRoute("/api/simulate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { action, funnel_id, message, token } = body;

          if (!token) return Response.json({ error: "No token" }, { status: 401 });

          const admin = getAdmin();

          // Verificar usuário pelo token
          const anonUrl  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
          const anonKey  = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
          const authClient = createClient(anonUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error } = await authClient.auth.getUser(token);
          if (error || !userData?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const userId = userData.user.id;

          if (action === "reset") {
            const { data: convs } = await admin.from("conversations").select("id")
              .eq("user_id", userId).like("phone", "SIM_%");
            if (convs?.length) {
              const ids = convs.map((c: any) => c.id);
              await admin.from("funnel_states").delete().in("conversation_id", ids);
              await admin.from("messages").delete().in("conversation_id", ids);
              await admin.from("conversations").delete().in("id", ids);
            }
            return Response.json({ ok: true });
          }

          // action === "send"
          const simPhone = `SIM_${userId.slice(0, 8)}`;
          let { data: conv } = await admin.from("conversations").select("*")
            .eq("user_id", userId).eq("phone", simPhone).maybeSingle();

          if (!conv) {
            const { data: created } = await admin.from("conversations").insert({
              user_id: userId, phone: simPhone,
              contact_name: "🧪 Simulação", status: "open",
              last_message_at: new Date().toISOString(),
              last_message_preview: message,
            }).select().single();
            conv = created;
          }
          if (!conv) return Response.json({ error: "Failed to create conversation" }, { status: 500 });

          await admin.from("messages").insert({
            user_id: userId, conversation_id: conv.id,
            direction: "inbound", content: message, status: "sent",
          });
          await admin.from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: message.slice(0, 80),
            unread_count: 1,
          }).eq("id", conv.id);

          await handleFunnelMessage(admin as any, userId, conv.id, message, funnel_id);

          return Response.json({ ok: true, conversation_id: conv.id });
        } catch (e: any) {
          console.error("simulate error:", e);
          return Response.json({ error: e.message }, { status: 500 });
        }
      },
    },
  },
});
