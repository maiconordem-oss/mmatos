import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Plus, Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/conhecimento")({
  component: () => (
    <AuthGate>
      <AppShell>
        <KbPage />
      </AppShell>
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Base de Conhecimento — Lex CRM" }] }),
});

type Doc = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  active: boolean;
  updated_at: string;
};

function KbPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Doc[]>([]);
  const [editing, setEditing] = useState<Partial<Doc> | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("kb_documents")
      .select("*")
      .order("updated_at", { ascending: false });
    setItems((data ?? []) as Doc[]);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.title?.trim() || !editing?.content?.trim() || !user) return;
    const payload = {
      title: editing.title.trim(),
      content: editing.content.trim(),
      tags: editing.tags ?? [],
      active: editing.active ?? true,
    };
    if (editing.id) {
      const { error } = await supabase.from("kb_documents").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("kb_documents").insert({ user_id: user.id, ...payload });
      if (error) return toast.error(error.message);
    }
    setEditing(null);
    toast.success("Salvo");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    await supabase.from("kb_documents").delete().eq("id", id);
    toast.success("Excluído");
    load();
  };

  const toggleActive = async (d: Doc) => {
    await supabase.from("kb_documents").update({ active: !d.active }).eq("id", d.id);
    load();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
            <p className="text-sm text-muted-foreground">
              Informações que a IA usa para responder: valores, áreas atendidas, horários, FAQs.
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            setEditing({ title: "", content: "", tags: [], active: true })
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </header>

      {editing && (
        <Card className="p-4 space-y-3 border-primary/30">
          <p className="font-medium text-sm">{editing.id ? "Editar" : "Novo item"}</p>
          <Input
            placeholder="Título (ex: Valores de consulta)"
            value={editing.title ?? ""}
            maxLength={200}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
          <div>
            <Textarea
              placeholder="Conteúdo. Ex: Consulta inicial gratuita. Honorários definidos após análise."
              rows={5}
              maxLength={8000}
              value={editing.content ?? ""}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            <p className="text-right text-[11px] text-muted-foreground mt-1">
              {(editing.content ?? "").length}/8000
            </p>
          </div>
          <Input
            placeholder="Tags separadas por vírgula (opcional)"
            value={(editing.tags ?? []).join(", ")}
            onChange={(e) =>
              setEditing({
                ...editing,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {items.length === 0 && !editing && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Nenhum item ainda. Adicione informações do escritório que a IA deve usar nas respostas.
          </p>
        )}
        {items.map((d) => (
          <Card key={d.id} className={`p-4 flex items-start gap-4 ${!d.active && "opacity-60"}`}>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{d.title}</p>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{d.content}</p>
              {d.tags?.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {d.tags.map((t) => (
                    <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Switch checked={d.active} onCheckedChange={() => toggleActive(d)} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(d)}>
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
