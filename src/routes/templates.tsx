import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/templates")({
  component: () => (
    <AuthGate>
      <AppShell>
        <TemplatesPage />
      </AppShell>
    </AuthGate>
  ),
  head: () => ({
    meta: [{ title: "Respostas Rápidas — Lex CRM" }],
  }),
});

type Tpl = { id: string; shortcut: string; message: string; created_at: string };

function TemplatesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Tpl[]>([]);
  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("quick_replies")
      .select("*")
      .order("shortcut", { ascending: true });
    setItems((data ?? []) as Tpl[]);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!shortcut.trim() || !message.trim() || !user) return;
    setLoading(true);
    const cleanShortcut = shortcut.trim().replace(/^\//, "").toLowerCase();
    const { error } = await supabase.from("quick_replies").insert({
      user_id: user.id,
      shortcut: cleanShortcut,
      message: message.trim(),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setShortcut("");
    setMessage("");
    toast.success("Template criado");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    await supabase.from("quick_replies").delete().eq("id", id);
    toast.success("Excluído");
    load();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Respostas Rápidas</h1>
          <p className="text-sm text-muted-foreground">
            Use no Inbox digitando <code className="bg-muted px-1 rounded">/</code> seguido do atalho.
          </p>
        </div>
      </header>

      <Card className="p-4 space-y-3">
        <p className="font-medium text-sm">Novo template</p>
        <div className="flex gap-2">
          <div className="w-48">
            <Input
              placeholder="Atalho (ex: ola)"
              value={shortcut}
              maxLength={50}
              onChange={(e) => setShortcut(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Textarea
              placeholder="Mensagem. Variáveis: {{nome}}, {{telefone}}"
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
            <p className="text-right text-[11px] text-muted-foreground mt-1">
              {message.length}/2000
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={create} disabled={loading || !shortcut.trim() || !message.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Nenhum template ainda. Crie atalhos rápidos para enviar mais rápido no Inbox.
          </p>
        )}
        {items.map((t) => (
          <Card key={t.id} className="p-4 flex items-start gap-4">
            <code className="bg-primary/10 text-primary px-2 py-1 rounded font-mono text-sm shrink-0">
              /{t.shortcut}
            </code>
            <p className="flex-1 text-sm whitespace-pre-wrap">{t.message}</p>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
