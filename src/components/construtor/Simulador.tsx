import { useState, useCallback, useRef, useEffect } from "react";
import {
  Bot, X, Video, Mic, FileSignature, Users, ArrowRight, FileText, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Fase, type SimMsg, CAMPOS } from "@/lib/construtor-data";

const previewDelayMs = (seconds?: number) => Math.min(Math.max(seconds ?? 2, 0) * 80, 5000);

export function Simulador({ fases, nomeDr, onClose }: { fases: Fase[]; nomeDr: string; onClose: () => void }) {
  const [msgs, setMsgs]         = useState<SimMsg[]>([]);
  const [input, setInput]       = useState("");
  const [faseIdx, setFaseIdx]   = useState(0);
  const [pergIdx, setPergIdx]   = useState(0);
  const [campoIdx, setCampoIdx] = useState(0);
  const [etapa, setEtapa]       = useState<"midia"|"pergunta"|"coleta"|"acao"|"fim">("midia");
  const [typing, setTyping]     = useState(false);
  const [dados, setDados]       = useState<Record<string, string>>({});
  const [log, setLog]           = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fase = fases[faseIdx];

  const addLog = (msg: string) => setLog(p => [...p, msg]);

  const iaFala = useCallback((texto: string, tipo?: string) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs(p => [...p, { de: "ia", texto, tipo }]);
    }, 800 + Math.random() * 400);
  }, []);

  const processarAcao = useCallback((f: Fase, idx: number, avancar: (i: number) => void) => {
    if (f.acao === "contrato") {
      addLog("⚡ Gerando contrato ZapSign...");
      iaFala("Perfeito! Gerando o seu contrato agora... 📄");
      setTimeout(() => {
        setMsgs(p => [...p, { de: "ia", texto: "✅ Contrato gerado! Você receberá o link no seu e-mail para assinar com o dedo.", tipo: "contrato" }]);
        addLog("✅ Contrato ZapSign gerado");
        setTimeout(() => avancar(idx + 1), 1500);
      }, 2000);
    } else if (f.acao === "agendamento") {
      addLog("📅 Buscando horários...");
      iaFala("Verificando minha agenda... 📅");
      setTimeout(() => {
        iaFala("Tenho estes horários disponíveis:\n\n• Amanhã às 14h\n• Quinta às 10h\n• Sexta às 16h\n\nQual prefere?");
        addLog("📅 3 horários oferecidos");
        setEtapa("pergunta");
      }, 1500);
    } else if (f.acao === "criar_grupo") {
      addLog("👥 Criando grupo WhatsApp...");
      iaFala("Criando um grupo para acompanharmos juntos o seu caso... 👥");
      setTimeout(() => {
        setMsgs(p => [...p, { de: "ia", texto: "✅ Grupo criado! Você já recebeu o convite. Lá enviaremos todas as atualizações do processo.", tipo: "grupo" }]);
        addLog("✅ Grupo WhatsApp criado");
        setTimeout(() => avancar(idx + 1), 1500);
      }, 2000);
    } else if (f.acao === "handoff") {
      addLog("👤 Transferindo para humano...");
      setMsgs(p => [...p, { de: "ia", texto: "Vou acionar minha equipe agora. Em breve alguém fala diretamente com você! 👤", tipo: "handoff" }]);
      setEtapa("fim");
      addLog("🔚 IA pausada — atendimento humano");
    } else {
      avancar(idx + 1);
    }
  }, [iaFala]);

  const avancarFase = useCallback((idx: number) => {
    const f = fases[idx];
    if (!f) { setEtapa("fim"); addLog("🏁 Simulação concluída!"); return; }
    setFaseIdx(idx); setPergIdx(0); setCampoIdx(0);
    addLog(`→ Fase: ${f.emoji} ${f.label}`);

    const temMidia   = f.midias.length > 0;
    const temPerg    = f.perguntas.length > 0;
    const temColeta  = f.camposColeta.length > 0;

    if (temMidia) {
      setEtapa("midia");
      f.midias.forEach((m, i) => {
        setTimeout(() => {
          const tipo = m.chave.startsWith("audio_") ? "audio" : "video";
          setMsgs(p => [...p, { de: "ia", texto: `[${tipo.toUpperCase()}: ${m.chave}]`, tipo }]);
          addLog(`📤 Enviado: ${m.chave}`);
        }, i * 1400);
      });
      const delayAposMidias = f.midias.reduce((total, m) => total + previewDelayMs(m.delayAposSegundos), 0);
      setTimeout(() => {
        if (f.textoAposMidia) {
          iaFala(f.textoAposMidia);
          setTimeout(() => {
            if (temPerg)   { setEtapa("pergunta"); setTimeout(() => iaFala(f.perguntas[0]), 900); }
            else if (temColeta) { setEtapa("coleta"); const c = CAMPOS.find(x => x.key === f.camposColeta[0]); setTimeout(() => iaFala(`Preciso de alguns dados. Qual é o seu ${c?.label ?? f.camposColeta[0]}?`), 900); }
            else { setEtapa("acao"); setTimeout(() => processarAcao(f, idx, avancarFase), 600); }
          }, 1200);
        } else if (temPerg)  { setEtapa("pergunta"); setTimeout(() => iaFala(f.perguntas[0]), 600); }
        else if (temColeta) { setEtapa("coleta"); const c = CAMPOS.find(x => x.key === f.camposColeta[0]); setTimeout(() => iaFala(`Qual é o seu ${c?.label ?? f.camposColeta[0]}?`), 600); }
        else { setEtapa("acao"); setTimeout(() => processarAcao(f, idx, avancarFase), 600); }
      }, f.midias.length * 1400 + delayAposMidias + 200);
    } else if (temPerg) {
      setEtapa("pergunta");
      setTimeout(() => iaFala(f.perguntas[0]), 600);
    } else if (temColeta) {
      setEtapa("coleta");
      const c = CAMPOS.find(x => x.key === f.camposColeta[0]);
      setTimeout(() => iaFala(`Qual é o seu ${c?.label ?? f.camposColeta[0]}?`), 600);
    } else {
      setEtapa("acao");
      setTimeout(() => processarAcao(f, idx, avancarFase), 600);
    }
  }, [fases, iaFala, processarAcao]);

  useEffect(() => {
    setMsgs([{ de: "ia", texto: `Olá! Sou o ${nomeDr || "Dr. Maicon"}. Como posso ajudar?` }]);
    addLog("🟢 Simulação iniciada");
    setTimeout(() => avancarFase(0), 800);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const responder = () => {
    if (!input.trim() || typing || etapa === "fim") return;
    const resp = input.trim(); setInput("");
    setMsgs(p => [...p, { de: "lead", texto: resp }]);

    const excl = fase.exclusoes.find(e => e.condicao && resp.toLowerCase().includes(e.condicao.toLowerCase().split(" ")[0]));
    if (excl) {
      addLog(`❌ Exclusão: ${excl.condicao}`);
      setTimeout(() => { iaFala(`Entendo. Infelizmente, ${excl.motivo}. Obrigado pelo contato!`); setEtapa("fim"); }, 600);
      return;
    }

    if (etapa === "pergunta") {
      const prox = pergIdx + 1;
      if (prox < fase.perguntas.length) { setPergIdx(prox); setTimeout(() => iaFala(fase.perguntas[prox]), 700); }
      else if (fase.camposColeta.length > 0) { setEtapa("coleta"); const c = CAMPOS.find(x => x.key === fase.camposColeta[0]); setTimeout(() => iaFala(`Agora preciso de alguns dados. Qual é o seu ${c?.label ?? fase.camposColeta[0]}?`), 700); }
      else { setEtapa("acao"); setTimeout(() => processarAcao(fase, faseIdx, avancarFase), 700); }
    } else if (etapa === "coleta") {
      const campo = fase.camposColeta[campoIdx];
      setDados(p => ({ ...p, [campo]: resp }));
      addLog(`📝 ${campo}: ${resp}`);
      const prox = campoIdx + 1;
      if (prox < fase.camposColeta.length) {
        setCampoIdx(prox);
        const c = CAMPOS.find(x => x.key === fase.camposColeta[prox]);
        setTimeout(() => iaFala(`Obrigado! E o seu ${c?.label ?? fase.camposColeta[prox]}?`), 700);
      } else { setEtapa("acao"); setTimeout(() => processarAcao(fase, faseIdx, avancarFase), 700); }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-5xl h-[88vh] flex gap-3 overflow-hidden">
        {/* Chat */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ background: "#0b141a" }}>
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#1f2c34" }}>
            <div className="h-9 w-9 rounded-full bg-[#25d366]/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-[#25d366]" />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">{nomeDr || "Dr. Maicon"}</p>
              <p className="text-[#8696a0] text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#25d366] animate-pulse inline-block" />
                Simulando — fase: {fase?.emoji} {fase?.label}
              </p>
            </div>
            <button onClick={onClose} className="text-[#8696a0] hover:text-white p-1 rounded-full hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" style={{ background: "#0b141a" }}>
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex items-end gap-2", m.de === "ia" ? "justify-start" : "justify-end")}>
                {m.de === "ia" && (
                  <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center mb-0.5" style={{ background: "#1f2c34" }}>
                    <Bot className="h-3 w-3 text-[#25d366]" />
                  </div>
                )}
                <div className={cn("max-w-[72%] px-3 py-2 rounded-2xl text-sm leading-relaxed",
                  m.de === "ia" ? "rounded-bl-none" : "rounded-br-none")}
                  style={{ background: m.de === "ia" ? "#1f2c34" : "#005c4b" }}>
                  {m.tipo === "video"    && <div className="flex items-center gap-1.5 mb-1 text-blue-400 text-xs font-medium"><Video className="h-3.5 w-3.5" />Vídeo</div>}
                  {m.tipo === "audio"    && <div className="flex items-center gap-1.5 mb-1 text-violet-400 text-xs font-medium"><Mic className="h-3.5 w-3.5" />Áudio</div>}
                  {m.tipo === "contrato" && <div className="flex items-center gap-1.5 mb-1 text-emerald-400 text-xs font-medium"><FileSignature className="h-3.5 w-3.5" />Contrato gerado</div>}
                  {m.tipo === "grupo"    && <div className="flex items-center gap-1.5 mb-1 text-cyan-400 text-xs font-medium"><Users className="h-3.5 w-3.5" />Grupo criado</div>}
                  <p className="text-white whitespace-pre-line text-sm">{m.texto}</p>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-end gap-2 justify-start">
                <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center" style={{ background: "#1f2c34" }}>
                  <Bot className="h-3 w-3 text-[#25d366]" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-none" style={{ background: "#1f2c34" }}>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-2 w-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="px-4 py-3 shrink-0" style={{ background: "#1f2c34" }}>
            {etapa === "fim"
              ? <p className="text-center text-[#8696a0] text-sm py-1">Simulação concluída ✅</p>
              : (
                <div className="flex gap-2">
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && responder()}
                    placeholder="Digite a resposta do lead e pressione Enter..."
                    className="flex-1 rounded-xl px-4 py-2 text-sm text-white placeholder-[#8696a0] outline-none border-0"
                    style={{ background: "#2a3942" }} disabled={typing} />
                  <button onClick={responder} disabled={typing || !input.trim()}
                    className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
                    style={{ background: "#25d366" }}>
                    <ArrowRight className="h-4 w-4 text-black" />
                  </button>
                </div>
              )
            }
          </div>
        </div>

        {/* Painel lateral */}
        <div className="w-60 shrink-0 flex flex-col gap-3">
          <div className="flex-1 flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5 text-primary" />Log de ações
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {log.map((l, i) => (
                <p key={i} className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-2">{l}</p>
              ))}
              {log.length === 0 && <p className="text-[11px] text-muted-foreground italic">Aguardando...</p>}
            </div>
          </div>
          {Object.keys(dados).length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />Dados coletados
              </p>
              {Object.entries(dados).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[11px] mb-1 gap-2">
                  <span className="text-muted-foreground capitalize shrink-0">{k}:</span>
                  <span className="text-foreground font-medium truncate">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
