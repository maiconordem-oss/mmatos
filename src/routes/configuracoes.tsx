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
import { Plus, Trash2, Zap, Tag, Clock, Save, Mic, Loader2, KeyRound, Scale, ShieldAlert, Bot, Users2, Mail, Crown, GraduationCap, Briefcase, UserX, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { checkElevenlabsToken, saveElevenlabsToken, deleteElevenlabsToken } from "@/server/elevenlabs.functions";
import { listForbiddenWords, addForbiddenWord, deleteForbiddenWord } from "@/server/intelligence.functions";
import { listTeamMembers, inviteTeamMember, updateTeamMemberRole, removeTeamMember } from "@/server/juridico.functions";

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
  const [tab, setTab] = useState<"quick"|"tags"|"horario"|"ia"|"integracoes"|"equipe">("quick");

  // Team management
  const listMembersFn   = useAuthServerFn(listTeamMembers);
  const inviteMemberFn  = useAuthServerFn(inviteTeamMember);
  const updateRoleFn    = useAuthServerFn(updateTeamMemberRole);
  const removeMemberFn  = useAuthServerFn(removeTeamMember);
  const [teamMembers, setTeamMembers]       = useState<any[]>([]);
  const [teamLoading, setTeamLoading]       = useState(false);
  const [inviteEmail, setInviteEmail]       = useState("");
  const [inviteRole, setInviteRole]         = useState<"admin"|"advogado"|"estagiario"|"secretaria">("secretaria");
  const [showInviteForm, setShowInviteForm] = useState(false);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const r = await listMembersFn({ data: {} });
      setTeamMembers(r.members);
    } catch {}
    finally { setTeamLoading(false); }
  }, [listMembersFn]);

  useEffect(() => { if (tab === "equipe") loadTeam(); }, [tab, loadTeam]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMemberFn({ data: { email: inviteEmail.trim(), role: inviteRole } });
      toast.success("Convite enviado!");
      setInviteEmail("");
      setShowInviteForm(false);
      loadTeam();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await removeMemberFn({ data: { memberId: id } });
      toast.success("Membro removido");
      loadTeam();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateRole = async (id: string, role: "admin"|"advogado"|"estagiario"|"secretaria") => {
    try {
      await updateRoleFn({ data: { memberId: id, role } });
      setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    } catch (e: any) { toast.error(e.message); }
  };

  // Forbidden words / IA segurança
  const listFwFn = useAuthServerFn(listForbiddenWords);
  const addFwFn = useAuthServerFn(addForbiddenWord);
  const delFwFn = useAuthServerFn(deleteForbiddenWord);
  const [fws, setFws] = useState<Array<{ id: string; word: string; severity: string }>>([]);
  const [newFw, setNewFw] = useState("");
  const loadFw = useCallback(async () => {
    try {
      const r = await listFwFn({ data: {} } as any);
      setFws(r.items as any);
    } catch {}
  }, [listFwFn]);
  useEffect(() => { if (tab === "ia") loadFw(); }, [tab, loadFw]);
  const addFw = async () => {
    const w = newFw.trim();
    if (w.length < 2) return;
    try {
      await addFwFn({ data: { word: w } } as any);
      setNewFw("");
      toast.success("Adicionada");
      loadFw();
    } catch (e: any) { toast.error(e.message); }
  };
  const removeFw = async (id: string) => {
    try { await delFwFn({ data: { id } } as any); loadFw(); } catch {}
  };

  // A/B prompts (qualifier)
  const [abLoading, setAbLoading] = useState(false);
  const [promptA, setPromptA] = useState("");
  const [promptB, setPromptB] = useState("");
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSplit, setAbSplit] = useState(50);
  const loadAB = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("ai_agent_settings")
      .select("qualifier_prompt, qualifier_prompt_b, ab_enabled, ab_split_pct")
      .eq("user_id", user.id).maybeSingle();
    if (data) {
      setPromptA(data.qualifier_prompt ?? "");
      setPromptB(data.qualifier_prompt_b ?? "");
      setAbEnabled(!!data.ab_enabled);
      setAbSplit(data.ab_split_pct ?? 50);
    }
  }, [user]);
  useEffect(() => { if (tab === "ia") loadAB(); }, [tab, loadAB]);
  const saveAB = async () => {
    if (!user) return;
    setAbLoading(true);
    try {
      const { data: existing } = await supabase.from("ai_agent_settings")
        .select("id").eq("user_id", user.id).maybeSingle();
      const payload = {
        qualifier_prompt: promptA || "Você é um assistente jurídico. Qualifique o lead.",
        qualifier_prompt_b: promptB || null,
        ab_enabled: abEnabled,
        ab_split_pct: abSplit,
      };
      const { error } = existing
        ? await supabase.from("ai_agent_settings").update(payload).eq("id", existing.id)
        : await supabase.from("ai_agent_settings").insert({ user_id: user.id, ...payload });
      if (error) throw error;
      toast.success("Prompts salvos");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setAbLoading(false); }
  };

  // ElevenLabs token
  const checkElevenFn  = useAuthServerFn(checkElevenlabsToken);
  const saveElevenFn   = useAuthServerFn(saveElevenlabsToken);
  const deleteElevenFn = useAuthServerFn(deleteElevenlabsToken);
  const [elevenInfo, setElevenInfo] = useState<{ configured: boolean; source: string | null; masked: string | null } | null>(null);
  const [elevenOpen, setElevenOpen] = useState(false);
  const [elevenInput, setElevenInput] = useState("");
  const [savingEleven, setSavingEleven] = useState(false);
  const loadElevenInfo = useCallback(async () => {
    try { setElevenInfo(await checkElevenFn({ data: {} } as any)); } catch {}
  }, [checkElevenFn]);
  useEffect(() => { loadElevenInfo(); }, [loadElevenInfo]);

  // DataJud API Key
  const [datajudKey, setDatajudKey]       = useState("");
  const [datajudSaved, setDatajudSaved]   = useState(false);
  const [datajudOpen, setDatajudOpen]     = useState(false);
  const [datajudInput, setDatajudInput]   = useState("");
  const [savingDatajud, setSavingDatajud] = useState(false);
  const loadDatajudKey = useCallback(async () => {
    const { data } = await supabase.from("user_integrations")
      .select("config").eq("provider", "datajud").maybeSingle();
    const k = (data?.config as any)?.api_key;
    if (k) { setDatajudKey(k); setDatajudSaved(true); }
  }, []);
  useEffect(() => { loadDatajudKey(); }, [loadDatajudKey]);

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
    { id: "quick",       label: "Respostas rápidas", icon: Zap },
    { id: "tags",        label: "Tags",              icon: Tag },
    { id: "horario",     label: "Horário",           icon: Clock },
    { id: "ia",          label: "IA & Segurança",    icon: Bot },
    { id: "integracoes", label: "Integrações",       icon: KeyRound },
    { id: "equipe",      label: "Equipe",            icon: Users2 },
  ] as const;

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin", advogado: "Advogado", estagiario: "Estagiário", secretaria: "Secretária",
  };
  const ROLE_ICONS: Record<string, any> = {
    admin: Crown, advogado: Scale, estagiario: GraduationCap, secretaria: Briefcase,
  };

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

          {/* IA & SEGURANÇA */}
          {tab === "ia" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  <p className="font-medium text-foreground">Palavras proibidas / críticas</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando uma destas palavras aparecer na mensagem do cliente, a IA é desligada e a conversa marcada como "Precisa de humano".
                </p>
                <div className="flex gap-2">
                  <Input value={newFw} onChange={(e) => setNewFw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFw()}
                    placeholder="Ex.: processar, procon, denúncia" />
                  <Button onClick={addFw} disabled={newFw.trim().length < 2}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {fws.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Palavras padrão (processar, procon, denunciar, justiça...) já são detectadas automaticamente.</p>
                  )}
                  {fws.map((f) => (
                    <span key={f.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-red-500/10 text-red-600 border border-red-500/30">
                      {f.word}
                      <button onClick={() => removeFw(f.id)} className="hover:text-red-800"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" /> Prompts do qualificador (A/B)
                    </p>
                    <p className="text-xs text-muted-foreground">Quando A/B está ativo, novas respostas alternam entre A e B conforme o split. Veja a performance em Debug IA / Relatórios.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">A/B</span>
                    <Switch checked={abEnabled} onCheckedChange={setAbEnabled} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Prompt A (padrão)</Label>
                    <Textarea value={promptA} onChange={(e) => setPromptA(e.target.value)} rows={6} className="text-xs font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs">Prompt B {abEnabled && <span className="text-primary">(ativo)</span>}</Label>
                    <Textarea value={promptB} onChange={(e) => setPromptB(e.target.value)} rows={6} className="text-xs font-mono" placeholder="Variante para teste A/B (deixe vazio para desativar)" />
                  </div>
                </div>
                {abEnabled && (
                  <div className="flex items-center gap-3">
                    <Label className="text-xs whitespace-nowrap">% para B:</Label>
                    <Input type="number" min={0} max={100} value={abSplit}
                      onChange={(e) => setAbSplit(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-24" />
                    <span className="text-xs text-muted-foreground">{100 - abSplit}% A · {abSplit}% B</span>
                  </div>
                )}
                <Button onClick={saveAB} disabled={abLoading}>
                  {abLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar prompts
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <p className="font-medium text-foreground">Proteções automáticas (ativas)</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                  <li>Anti-loop: IA não responde mais de 6 mensagens seguidas sem intervenção humana.</li>
                  <li>Pedido de humano detectado: frases como "falar com atendente" desligam a IA.</li>
                  <li>Baixa confiança: respostas vagas marcam a conversa como "Precisa de humano".</li>
                  <li>Fora do horário comercial: IA pausada e conversa marcada para retorno.</li>
                </ul>
              </div>
            </div>
          )}

          {/* INTEGRAÇÕES */}
          {tab === "integracoes" && (
            <div className="space-y-5">
              <div className={cn(
                "rounded-xl border-l-4 border border-border bg-card p-5",
                elevenInfo?.configured ? "border-l-emerald-500" : "border-l-amber-500"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Mic className="h-4 w-4 text-violet-500" /> ElevenLabs (transcrição + TTS)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {elevenInfo === null
                        ? "Verificando..."
                        : elevenInfo.configured
                        ? `Configurado (${elevenInfo.source === "user" ? "salvo por você" : "via secret"}) — ${elevenInfo.masked}`
                        : "Não configurado. Cole sua API key da ElevenLabs para habilitar transcrição de áudios e geração de voz."}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-2">
                      Pegue sua chave em <code className="bg-muted px-1 rounded">elevenlabs.io → Profile → API Keys</code>
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant={elevenInfo?.configured ? "outline" : "default"}
                      onClick={() => { setElevenInput(""); setElevenOpen(true); }}>
                      {elevenInfo?.configured ? "Atualizar" : "Salvar token"}
                    </Button>
                    {elevenInfo?.configured && elevenInfo.source === "user" && (
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={async () => {
                          if (!confirm("Remover o token salvo?")) return;
                          try { await deleteElevenFn({ data: {} } as any); toast.success("Removido"); loadElevenInfo(); }
                          catch (e: any) { toast.error(e.message); }
                        }}>
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* DataJud */}
              <div className={cn(
                "rounded-xl border-l-4 border border-border bg-card p-5",
                datajudSaved ? "border-l-emerald-500" : "border-l-amber-500"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Scale className="h-4 w-4 text-blue-500" /> DataJud CNJ (busca de processos)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {datajudSaved
                        ? `Chave configurada — ${datajudKey.slice(0,8)}...${datajudKey.slice(-4)}`
                        : "Não configurado. A chave padrão pode ter expirado. Gere uma nova no portal DataJud."}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-2">
                      Acesse <code className="bg-muted px-1 rounded">datajud.cnj.jus.br</code> → Login → Meu Perfil → API Key → Gerar Nova Chave
                    </p>
                  </div>
                  <Button size="sm" variant={datajudSaved ? "outline" : "default"}
                    onClick={() => { setDatajudInput(datajudKey); setDatajudOpen(true); }}>
                    {datajudSaved ? "Atualizar" : "Configurar"}
                  </Button>
                </div>
              </div>

              <Dialog open={datajudOpen} onOpenChange={setDatajudOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle className="flex items-center gap-2"><Scale className="h-4 w-4" />API Key DataJud CNJ</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                      <p className="font-semibold mb-1">Como obter a chave:</p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>Acesse <strong>datajud.cnj.jus.br</strong> e faça login</li>
                        <li>Clique em <strong>Meu Perfil</strong></li>
                        <li>Clique em <strong>API Key</strong></li>
                        <li>Clique em <strong>Gerar Nova Chave</strong></li>
                        <li>Copie e cole aqui abaixo</li>
                      </ol>
                    </div>
                    <div>
                      <Label className="text-xs">Chave DataJud</Label>
                      <Input className="mt-1 font-mono text-xs" placeholder="cDQH..." value={datajudInput}
                        onChange={e => setDatajudInput(e.target.value)} autoFocus />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDatajudOpen(false)}>Cancelar</Button>
                    <Button disabled={datajudInput.trim().length < 10 || savingDatajud}
                      onClick={async () => {
                        setSavingDatajud(true);
                        try {
                          await supabase.from("user_integrations").upsert(
                            { user_id: user?.id!, provider: "datajud", config: { api_key: datajudInput.trim() } },
                            { onConflict: "user_id,provider" }
                          );
                          setDatajudKey(datajudInput.trim());
                          setDatajudSaved(true);
                          setDatajudOpen(false);
                          toast.success("Chave DataJud salva!");
                        } catch (e: any) { toast.error(e.message); }
                        finally { setSavingDatajud(false); }
                      }}>
                      {savingDatajud ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={elevenOpen} onOpenChange={setElevenOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>API Key ElevenLabs</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Label className="text-xs">Cole a chave (começa com sk_...)</Label>
                    <Input type="password" placeholder="sk_..." value={elevenInput}
                      onChange={(e) => setElevenInput(e.target.value)} autoFocus />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setElevenOpen(false)}>Cancelar</Button>
                    <Button disabled={elevenInput.trim().length < 6 || savingEleven}
                      onClick={async () => {
                        setSavingEleven(true);
                        try {
                          await saveElevenFn({ data: { token: elevenInput.trim() } } as any);
                          toast.success("Token salvo");
                          setElevenOpen(false);
                          loadElevenInfo();
                        } catch (e: any) { toast.error(e.message); }
                        finally { setSavingEleven(false); }
                      }}>
                      {savingEleven ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* EQUIPE */}
          {tab === "equipe" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-primary" /> Membros da equipe
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Convide colaboradores para acessar o CRM com diferentes permissões.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowInviteForm(!showInviteForm)} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Convidar
                  </Button>
                </div>

                {showInviteForm && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">Novo convite</p>
                    <div>
                      <Label className="text-xs">E-mail *</Label>
                      <Input
                        className="mt-1" type="email" placeholder="colega@escritorio.com.br"
                        value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Papel</Label>
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="secretaria">Secretária</option>
                        <option value="estagiario">Estagiário</option>
                        <option value="advogado">Advogado</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowInviteForm(false)}>Cancelar</Button>
                      <Button size="sm" onClick={handleInvite} disabled={!inviteEmail.trim()}>
                        <Mail className="h-3.5 w-3.5 mr-1" /> Enviar convite
                      </Button>
                    </div>
                  </div>
                )}

                {teamLoading && <p className="text-sm text-muted-foreground text-center py-4">Carregando…</p>}

                {!teamLoading && teamMembers.length === 0 && (
                  <div className="text-center py-6">
                    <Users2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">Nenhum membro convidado ainda.</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Clique em "Convidar" para adicionar colaboradores.</p>
                  </div>
                )}

                {!teamLoading && teamMembers.length > 0 && (
                  <div className="divide-y divide-border">
                    {teamMembers.map(member => {
                      const RoleIcon = ROLE_ICONS[member.role] ?? Briefcase;
                      return (
                        <div key={member.id} className="flex items-center gap-3 py-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {member.member_email[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{member.member_email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <RoleIcon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                              {member.status === "pendente" && (
                                <span className="text-[10px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-700 border border-amber-200">aguardando aceite</span>
                              )}
                              {member.status === "ativo" && (
                                <span className="text-[10px] px-1.5 py-0 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                                  <Check className="h-2.5 w-2.5" /> ativo
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={member.role}
                              onChange={e => handleUpdateRole(member.id, e.target.value as any)}
                              className="text-xs rounded border border-input bg-background px-2 py-1 outline-none"
                            >
                              <option value="secretaria">Secretária</option>
                              <option value="estagiario">Estagiário</option>
                              <option value="advogado">Advogado</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => handleRemoveMember(member.id)}
                              className="text-muted-foreground hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                              <UserX className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
