import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2, Zap, Tag, Clock, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ConfigPage />
      </AppShell>
    </AuthGate>
  ),
});

const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const TAG_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#14b8a6"];

function ConfigPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"quick"|"tags"|"horario">("quick");

  // Quick Replies
  const [replies, setReplies]   = useState<any[]>([]);
  const [newShortcut, setNewShortcut] = useState("");
  const [newMessage, setNewMessage]   = useState("");

  // Tags
  const [tags, setTags]         = useState<any[]>([]);
  const [newTag, setNewTag]     = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");

  // Horário
  const [bh, setBh]             = useState<any>({
    enabled: false, start_hour: 9, end_hour: 18,
    work_days: [1,2,3,4,5],
    absent_message: "Nosso atendimento é de segunda a sexta das 9h às 18h. Em breve retornaremos!",
    away_timeout_min: 5,
    away_message: "Aguarde, em breve um atendente irá te responder.",
  });

  const loadReplies = useCallback(async () => {
    const { data } = await supabase.from("quick_replies").select("*").order("shortcut");
    setReplies(data ?? []);
  }, []);

  const loadTags = useCallback(async () => {
    const { data } = await supabase.from("conversation_tags").select("*").order("name");
    setTags(data ?? []);
  }, []);

  const loadBH = useCallback(async () => {
    const { data } = await supabase.from("business_hours").select("*").maybeSingle();
    if (data) setBh(data);
  }, []);

  useEffect(() => { loadReplies(); loadTags(); loadBH(); }, []);

  const addReply = async () => {
    if (!newShortcut.trim() || !newMessage.trim()) return;
    if (!user?.id) { toast.error("Usuário não autenticado"); return; }
    const { error } = await supabase.from("quick_replies").insert({
      user_id: user.id,
      shortcut: newShortcut.trim().toLowerCase().replace(/\s/g,"_").replace(/[^a-z0-9_]/g,""),
      message: newMessage.trim(),
    });
    if (error) {
      console.error("addReply error:", error);
      toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`);
      return;
    }
    setNewShortcut(""); setNewMessage("");
    loadReplies(); toast.success("Resposta rápida adicionada!");
  };

  const deleteReply = async (id: string) => {
    await supabase.from("quick_replies").delete().eq("id", id);
    loadReplies();
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    if (!user?.id) { toast.error("Usuário não autenticado"); return; }
    const { error } = await supabase.from("conversation_tags").insert({
      user_id: user.id, name: newTag.trim(), color: newTagColor,
    });
    if (error) {
      console.error("addTag error:", error);
      toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`);
      return;
    }
    setNewTag("");
    loadTags(); toast.success("Tag adicionada!");
  };

  const deleteTag = async (id: string) => {
    await supabase.from("conversation_tags").delete().eq("id", id);
    loadTags();
  };

  const saveBH = async () => {
    if (!user?.id) { toast.error("Usuário não autenticado"); return; }
    const { error } = await supabase.from("business_hours").upsert({
      ...bh, user_id: user.id,
    }, { onConflict: "user_id" });
    if (error) {
      console.error("saveBH error:", error);
      toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`);
      return;
    }
    toast.success("Horário salvo!");
  };

  const toggleDay = (day: number) => {
    const days = bh.work_days.includes(day)
      ? bh.work_days.filter((d: number) => d !== day)
      : [...bh.work_days, day].sort();
    setBh({ ...bh, work_days: days });
  };

  const TABS = [
    { id: "quick",  label: "Respostas rápidas", icon: Zap },
    { id: "tags",   label: "Tags",              icon: Tag },
    { id: "horario",label: "Horário",           icon: Clock },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      <Toaster />
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Respostas rápidas, tags e horário de atendimento</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* QUICK REPLIES */}
          {tab === "quick" && (
            <>
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Nova resposta rápida
                </p>
                <p className="text-xs text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">/atalho</code> ou clique no botão ⚡ no inbox para inserir.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <Label className="text-xs">Atalho *</Label>
                    <div className="flex items-center mt-1">
                      <span className="text-muted-foreground text-sm px-2 border border-r-0 border-border rounded-l-lg h-9 flex items-center bg-muted">/</span>
                      <Input className="rounded-l-none" value={newShortcut}
                        onChange={e => setNewShortcut(e.target.value)}
                        placeholder="bom_dia" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Mensagem *</Label>
                    <Input className="mt-1" value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Bom dia! Como posso ajudar?"
                      onKeyDown={e => e.key === "Enter" && addReply()} />
                  </div>
                </div>
                <Button onClick={addReply} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                {replies.map(r => (
                  <div key={r.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
                    <code className="text-sm text-primary font-mono shrink-0 mt-0.5">/{r.shortcut}</code>
                    <p className="text-sm text-foreground flex-1">{r.message}</p>
                    <button onClick={() => deleteReply(r.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {replies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma resposta rápida cadastrada</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAGS */}
          {tab === "tags" && (
            <>
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Tag className="h-4 w-4 text-violet-500" /> Nova tag
                </p>
                <div className="flex gap-3">
                  <Input className="flex-1" value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    placeholder="Nome da tag (ex: urgente, aguardando doc)" />
                  <div className="flex items-center gap-2">
                    {TAG_COLORS.map(color => (
                      <button key={color} onClick={() => setNewTagColor(color)}
                        className={cn("h-6 w-6 rounded-full transition-transform hover:scale-110", newTagColor === color && "ring-2 ring-offset-2 ring-foreground scale-110")}
                        style={{ background: color }} />
                    ))}
                  </div>
                  <Button onClick={addTag} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" /> Criar
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: t.color }} />
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    <button onClick={() => deleteTag(t.id)} className="text-muted-foreground hover:text-destructive ml-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {tags.length === 0 && (
                  <div className="w-full text-center py-8 text-muted-foreground">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma tag criada</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* HORÁRIO */}
          {tab === "horario" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Horário de atendimento</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Fora do horário a IA envia mensagem automática</p>
                  </div>
                  <Switch checked={bh.enabled} onCheckedChange={v => setBh({ ...bh, enabled: v })} />
                </div>

                {bh.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">Hora início</Label>
                        <Input type="number" min={0} max={23} className="mt-1"
                          value={bh.start_hour} onChange={e => setBh({ ...bh, start_hour: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">Hora fim</Label>
                        <Input type="number" min={0} max={23} className="mt-1"
                          value={bh.end_hour} onChange={e => setBh({ ...bh, end_hour: Number(e.target.value) })} />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Dias de atendimento</Label>
                      <div className="flex gap-2 mt-2">
                        {WEEKDAYS.map((d, i) => (
                          <button key={i} onClick={() => toggleDay(i)}
                            className={cn("h-9 w-9 rounded-full text-xs font-medium transition-colors",
                              bh.work_days.includes(i)
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80")}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Mensagem fora do horário</Label>
                      <Textarea className="mt-1" rows={3} value={bh.absent_message}
                        onChange={e => setBh({ ...bh, absent_message: e.target.value })} />
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Label className="text-xs flex-1">Mensagem de ausência (sem resposta em X minutos)</Label>
                        <Input type="number" className="w-20" value={bh.away_timeout_min}
                          onChange={e => setBh({ ...bh, away_timeout_min: Number(e.target.value) })} />
                        <span className="text-xs text-muted-foreground shrink-0">min</span>
                      </div>
                      <Textarea rows={2} value={bh.away_message}
                        onChange={e => setBh({ ...bh, away_message: e.target.value })} />
                    </div>
                  </>
                )}

                <Button onClick={saveBH} className="gap-2">
                  <Save className="h-4 w-4" /> Salvar horário
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
