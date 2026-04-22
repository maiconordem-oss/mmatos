import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Mail, Phone, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <ClientesPage />
    </AuthGate>
  ),
});

type Client = {
  id: string;
  full_name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
};

function ClientesPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });

  const load = async () => {
    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data ?? []) as Client[]);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!user || !form.full_name) return;
    const { error } = await supabase.from("clients").insert({ user_id: user.id, ...form });
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente criado");
    setOpen(false);
    setForm({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    load();
  };

  const filtered = clients.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.document ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-8">
      <Toaster />
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Cadastro e ficha de clientes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome completo *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CPF/CNPJ</Label><Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>WhatsApp</Label><Input placeholder="+55..." value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
              </div>
              <div><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={handleCreate}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF ou e-mail..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold">{c.full_name}</h3>
                {c.document && <p className="text-xs text-muted-foreground mt-0.5">{c.document}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="space-y-1.5 text-sm">
              {c.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}
              {c.whatsapp && <div className="flex items-center gap-2 text-success"><MessageSquare className="h-3.5 w-3.5" />{c.whatsapp}</div>}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-12">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  );
}
