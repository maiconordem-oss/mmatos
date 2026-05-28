import type { FormEvent } from "react";
import { useState } from "react";

export type LeadMagnetLandingConfig = {
  slug: string;
  title: string;
  metaTitle: string;
  badge: string;
  heroLines: [string, string, string];
  heroSub: string;
  painTitle: string;
  pains: string[];
  sectionLabel: string;
  sectionTitle: string;
  sectionHighlight: string;
  items: string[];
  questions: Array<{ question: string; options: string[] }>;
  whatsappTitle: string;
  keyword: string;
  footerProduct: string;
};

export const leadMagnetLandings: Record<string, LeadMagnetLandingConfig> = {
  "manual-pericia": {
    slug: "manual-pericia",
    title: "Manual da Perícia Médica Previdenciária",
    metaTitle: "Manual da Perícia Médica | Maicon Matos",
    badge: "Material Gratuito - Perícia Médica",
    heroLines: ["Manual da", "Perícia Médica", "Previdenciária"],
    heroSub: "O guia que o INSS não quer que você leia antes de entrar na sala de perícia.",
    painTitle: "Você está nessa situação?",
    pains: [
      "Sua perícia já está marcada e você não sabe o que levar ou como se comportar",
      "O INSS negou seu benefício após uma perícia que durou menos de 5 minutos",
      "Você não sabe quais são seus direitos dentro da sala de perícia",
      "Não sabe o que fazer depois da negativa e tem medo de perder o prazo",
    ],
    sectionLabel: "O que está dentro do material",
    sectionTitle: "Conteúdo que o INSS",
    sectionHighlight: "não te conta.",
    items: [
      "Antes da perícia: documentos, laudos e preparação",
      "Durante a perícia: como responder sem se prejudicar",
      "Depois da perícia: aprovado, negado e próximos passos",
      "Seus direitos dentro da sala de perícia",
    ],
    questions: [
      { question: "Sua perícia já está marcada?", options: ["Sim, já tenho data", "Ainda não marquei", "Já fiz e fui negado"] },
      { question: "Qual é sua maior dúvida sobre a perícia?", options: ["O que levar", "Como me comportar", "O que fazer se negar"] },
    ],
    whatsappTitle: "Para qual WhatsApp envio seu Manual da Perícia?",
    keyword: "BOA SORTE",
    footerProduct: "este manual",
  },
  "guia-recurso": {
    slug: "guia-recurso",
    title: "Guia do Recurso - Benefício Negado",
    metaTitle: "Guia do Recurso - Benefício Negado | Maicon Matos",
    badge: "Material Gratuito - Benefício Negado",
    heroLines: ["Guia do", "Recurso", "Benefício Negado"],
    heroSub: "O INSS disse não. Mas a última palavra ainda não foi dada.",
    painTitle: "Você está nessa situação?",
    pains: [
      "O INSS negou seu benefício e você não sabe o que fazer",
      "Tem medo de perder o prazo sem saber como contar",
      "Recebeu uma carta cheia de juridiquês que não entendeu nada",
      "Não sabe se vale recorrer ou já ir direto pra Justiça",
    ],
    sectionLabel: "O que está dentro do material",
    sectionTitle: "Conteúdo que o INSS",
    sectionHighlight: "não te conta.",
    items: [
      "Por que negaram: o motivo real que a carta esconde",
      "O prazo e o erro que faz a maioria perder o direito",
      "Recurso ou Justiça: qual vale mais no seu caso",
      "O passo a passo do zero até o protocolo",
    ],
    questions: [
      { question: "Quando o INSS negou seu benefício?", options: ["Nos últimos 30 dias", "Há mais de 30 dias", "Ainda não fui negado"] },
      { question: "Qual benefício foi negado?", options: ["Auxílio-doença", "Aposentadoria", "BPC/LOAS", "Outro"] },
    ],
    whatsappTitle: "Para qual WhatsApp envio seu Guia do Recurso?",
    keyword: "NEGADO",
    footerProduct: "este guia",
  },
  "guia-aposentadoria": {
    slug: "guia-aposentadoria",
    title: "Guia da Aposentadoria 2026",
    metaTitle: "Guia da Aposentadoria 2026 | Maicon Matos",
    badge: "Material Gratuito - Aposentadoria",
    heroLines: ["Guia da", "Aposentadoria", "2026"],
    heroSub: "Antes de dar entrada, leia isso. Muita gente perde centenas de reais por mês por não saber.",
    painTitle: "Você está nessa situação?",
    pains: [
      "Não sabe se já tem direito ou quanto tempo ainda falta",
      "Tem medo de escolher a regra errada e receber menos do que merece",
      "Não sabe o que juntar ou como dar entrada pelo Meu INSS",
      "Acha que já tem direito mas ainda não deu entrada e está perdendo dinheiro",
    ],
    sectionLabel: "O que está dentro do material",
    sectionTitle: "Conteúdo que o INSS",
    sectionHighlight: "não te conta.",
    items: [
      "Sua regra: qual das 4 te dá o maior benefício",
      "Quanto você vai receber e o cálculo que o INSS não explica",
      "O que juntar e o erro que atrasa o pedido por meses",
      "Como dar entrada sem sair de casa e sem perder tempo",
      "O que não fazer: erros que custam dinheiro todo mês",
    ],
    questions: [
      { question: "Qual é sua situação hoje?", options: ["Acho que já tenho direito", "Falta pouco tempo", "Quero me planejar"] },
      { question: "Você é...", options: ["Empregado CLT", "Autônomo / MEI", "Já aposentado parcialmente"] },
    ],
    whatsappTitle: "Para qual WhatsApp envio seu Guia da Aposentadoria?",
    keyword: "APOSENTADORIA",
    footerProduct: "este guia",
  },
  "guia-auxilio": {
    slug: "guia-auxilio",
    title: "Guia do Auxílio-Doença INSS",
    metaTitle: "Guia do Auxílio-Doença | Maicon Matos",
    badge: "Material Gratuito - Auxílio-Doença",
    heroLines: ["Guia do", "Auxílio-Doença", "INSS"],
    heroSub: "O que o seu médico precisa escrever no laudo para o INSS não ter como negar.",
    painTitle: "Você está nessa situação?",
    pains: [
      "Está doente ou acidentado e não sabe se tem direito ao auxílio",
      "O médico fez um laudo mas o INSS negou assim mesmo",
      "Tem medo de ir à perícia sem saber o que vai acontecer",
      "O benefício foi cortado do nada e você não sabe o motivo",
    ],
    sectionLabel: "O que está dentro do material",
    sectionTitle: "Conteúdo que o INSS",
    sectionHighlight: "não te conta.",
    items: [
      "Quem tem direito e o detalhe do laudo que o INSS usa para negar",
      "O que pedir ao médico: a frase que muda tudo no laudo",
      "Como solicitar sem fila e sem sair de casa",
      "Se for negado: o prazo e o caminho para reverter",
    ],
    questions: [
      { question: "Qual é sua situação hoje?", options: ["Ainda não pedi o auxílio", "Estou aguardando análise", "Fui negado ou cortado"] },
      { question: "Você tem laudo médico atualizado?", options: ["Sim, tenho", "Não tenho ainda", "Tenho mas foi negado assim mesmo"] },
    ],
    whatsappTitle: "Para qual WhatsApp envio seu Guia do Auxílio-Doença?",
    keyword: "AUXILIO",
    footerProduct: "este guia",
  },
  "bpc-loas": {
    slug: "bpc-loas",
    title: "Guia do BPC/LOAS",
    metaTitle: "Guia do BPC/LOAS | Maicon Matos",
    badge: "Material Gratuito - BPC/LOAS",
    heroLines: ["Guia do", "BPC/LOAS", "INSS"],
    heroSub: "Entenda quem tem direito, quais documentos importam e por que tantos pedidos são negados pelo INSS.",
    painTitle: "Você está nessa situação?",
    pains: [
      "Tem idoso com 65 anos ou mais na família e não sabe se ele pode receber o BPC",
      "A pessoa tem deficiência ou doença grave, mas o INSS negou o pedido",
      "A renda da casa é baixa e você não sabe como provar isso corretamente",
      "O CadÚnico está desatualizado ou você não sabe quais documentos juntar",
    ],
    sectionLabel: "O que está dentro do material",
    sectionTitle: "O caminho do BPC",
    sectionHighlight: "sem enrolação.",
    items: [
      "Quem pode receber BPC: idoso, pessoa com deficiência e baixa renda",
      "CadÚnico, NIS e renda familiar: o que realmente precisa estar certo",
      "Documentos médicos e sociais que fortalecem o pedido",
      "O que fazer quando o INSS nega ou corta o benefício",
      "Erros comuns que atrasam ou prejudicam a análise",
    ],
    questions: [
      { question: "O BPC seria para quem?", options: ["Pessoa idosa 65+", "Pessoa com deficiência/doença", "Ainda não sei"] },
      { question: "Qual é a situação hoje?", options: ["Ainda não pedi", "Está em análise", "Foi negado ou cortado"] },
      { question: "A família tem CadÚnico atualizado?", options: ["Sim", "Não", "Não sei"] },
    ],
    whatsappTitle: "Para qual WhatsApp envio seu Guia do BPC/LOAS?",
    keyword: "BPC",
    footerProduct: "este guia",
  },
};

export function LeadMagnetLanding({ config }: { config: LeadMagnetLandingConfig }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const isWhatsappStep = step >= config.questions.length;

  const selectOption = (index: number, option: string) => {
    const next = [...answers];
    next[index] = option;
    setAnswers(next);
    setTimeout(() => setStep(index + 1), 180);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nums = whatsapp.replace(/\D/g, "");
    setError("");
    if (!nome.trim()) return setError("Informe seu nome para liberar o material.");
    if (nums.length < 10) return setError("Informe um WhatsApp válido com DDD.");

    setSending(true);
    try {
      const res = await fetch("/api/public/instagram-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          name: nome.trim(),
          phone: `55${nums}`,
          ref: `${config.slug}: ${answers.filter(Boolean).join(" | ")}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível enviar agora.");
      setSuccess(data?.message ?? "Material enviado no seu WhatsApp.");
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="magnet-page">
      <style>{landingCss}</style>
      <section className="hero">
        <div className="badge">{config.badge}</div>
        <div className="hero-key">PDF</div>
        <h1>{config.heroLines[0]}<br /><span>{config.heroLines[1]}</span><br />{config.heroLines[2]}</h1>
        <p className="hero-sub">{config.heroSub}</p>
        <div className="hero-cta"><a href="#receber">QUERO O MATERIAL GRATUITO</a></div>
      </section>

      <section className="pain">
        <h2>{config.painTitle}</h2>
        <div className="pain-grid">
          {config.pains.map((pain, index) => <div className="pain-item" key={pain}><div className="icon">{index + 1}</div><p>{pain}</p></div>)}
        </div>
      </section>

      <section className="teaser">
        <div className="teaser-inner">
          <p className="section-label">{config.sectionLabel}</p>
          <h2 className="section-title">{config.sectionTitle}<br /><span>{config.sectionHighlight}</span></h2>
          <div className="items-list">
            {config.items.map((item, index) => (
              <div className="item-row" key={item}>
                <div className="item-num">{index + 1}</div>
                <div className="item-text">{item}</div>
                <div className="item-lock">LOCK</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="form-section" id="receber">
        <div className="form-wrap">
          {success ? (
            <div className="success-box active">
              <div className="success-icon">OK</div>
              <h3>Material liberado!</h3>
              <p>Obrigado, <strong>{nome.trim().split(" ")[0]}</strong>.<br />{success}</p>
              <p className="success-note">Dúvidas? <a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a></p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="step-indicator">
                {config.questions.map((_, index) => <div key={index} className={`step-dot ${index < step ? "done" : index === step ? "active" : ""}`} />)}
                <div className={`step-dot ${isWhatsappStep ? "active" : ""}`} />
              </div>

              {!isWhatsappStep ? (
                <div className="step active">
                  <h3 className="step-question">{config.questions[step].question}</h3>
                  <div className="options-grid">
                    {config.questions[step].options.map((option, index) => (
                      <button className="option-btn" type="button" key={option} onClick={() => selectOption(step, option)}>
                        <span className="opt-icon">{index + 1}</span>{option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="step active">
                  <div className="whatsapp-badge">Quase lá - só falta o WhatsApp</div>
                  <h3 className="step-question">{config.whatsappTitle}</h3>
                  <div className="summary-box">
                    <p>Suas respostas:</p>
                    {answers.filter(Boolean).map((answer) => <div className="summary-item" key={answer}><span>OK</span>{answer}</div>)}
                  </div>
                  <div className="form-group">
                    <label htmlFor="nome">Seu nome</label>
                    <input id="nome" className="nome-input" type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como posso te chamar?" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="whatsapp">WhatsApp</label>
                    <div className="phone-wrap">
                      <div className="ddi">BR +55</div>
                      <input id="whatsapp" className="phone-input" type="tel" value={formatPhone(whatsapp)} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(51) 99999-9999" />
                    </div>
                  </div>
                  {error && <p className="error-box">{error}</p>}
                  <button className="btn-whatsapp" type="submit" disabled={sending}>{sending ? "ENVIANDO..." : "ENVIAR MEU MATERIAL AGORA"}</button>
                  <p className="form-note">Sem spam. Seus dados são protegidos e nunca serão compartilhados.</p>
                </div>
              )}
            </form>
          )}
        </div>
      </section>

      <section className="author-band">
        <div className="author">
          <div className="author-avatar">MM</div>
          <div className="author-info">
            <span className="oab">OAB/RS 136.221</span>
            <h3>Maicon Matos</h3>
            <p>Advogado previdenciário com atuação em INSS, aposentadoria, auxílio-doença e recursos administrativos.</p>
            <p className="author-link"><a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a></p>
          </div>
        </div>
      </section>

      <footer>
        <p><strong>Maicon Matos</strong> - Advogado Previdenciário | OAB/RS 136.221<br />
        Comenta <b>{config.keyword}</b> no Instagram e receba {config.footerProduct} gratuitamente.<br />
        Material educativo e informativo. Não substitui orientação jurídica individualizada.<br />
        <a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a></p>
      </footer>
    </main>
  );
}

function formatPhone(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 11);
  if (clean.length <= 10) return clean.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
  return clean.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
}

const landingCss = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Barlow+Condensed:wght@800&family=Bebas+Neue&family=Caveat+Brush&display=swap');
  .magnet-page, .magnet-page * { box-sizing:border-box; }
  .magnet-page { --red:#C90000; --red-dark:#8B0000; --red-soft:#FF6B6B; --ink:#101010; --paper:#FFF8F1; --white:#fff; --muted:#D7D0C7; --green:#25D366; font-family:'Barlow',Arial,sans-serif; background:var(--ink); color:var(--white); min-height:100vh; overflow-x:hidden; }
  .hero { min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:60px 24px 80px; position:relative; overflow:hidden; background:#101010; }
  .hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 80% 60% at 50% 0%, rgba(201,0,0,.32) 0%, transparent 70%); pointer-events:none; }
  .hero::after { content:''; position:absolute; inset:24px; border:1px solid rgba(255,248,241,.08); pointer-events:none; }
  .hero > * { position:relative; z-index:1; }
  .badge { display:inline-block; background:rgba(201,0,0,.18); border:1px solid rgba(255,248,241,.22); color:var(--paper); font-weight:800; font-size:11px; letter-spacing:2px; text-transform:uppercase; padding:7px 18px; border-radius:100px; margin-bottom:28px; }
  .hero-key { font-family:'Barlow Condensed','Bebas Neue',sans-serif; font-size:clamp(44px,12vw,88px); color:var(--paper); background:var(--red); border-radius:8px; padding:0 20px 4px; margin-bottom:18px; box-shadow:0 0 40px rgba(201,0,0,.45); line-height:1.02; text-transform:uppercase; }
  .hero h1 { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:clamp(40px,9vw,75px); line-height:.95; color:var(--paper); max-width:800px; text-shadow:0 2px 20px rgba(0,0,0,.8); font-weight:400; }
  .hero h1 span { color:var(--red); }
  .hero-sub { font-size:clamp(15px,2.5vw,19px); color:var(--muted); max-width:560px; margin:20px auto 0; line-height:1.6; font-style:italic; }
  .hero-cta { margin-top:36px; }
  .hero-cta a { display:inline-block; background:var(--red); color:var(--paper); text-decoration:none; padding:16px 36px; border-radius:8px; font-family:'Barlow Condensed','Bebas Neue',sans-serif; font-size:21px; letter-spacing:2px; box-shadow:0 4px 20px rgba(201,0,0,.35); }
  .pain { background:var(--red-dark); padding:60px 24px; text-align:center; }
  .pain h2 { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:clamp(26px,5vw,44px); margin-bottom:36px; font-weight:400; }
  .pain-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; max-width:860px; margin:0 auto; }
  .pain-item { background:rgba(0,0,0,.3); border:1px solid rgba(255,248,241,.1); border-radius:8px; padding:22px; text-align:left; }
  .pain-item .icon { display:inline-flex; width:30px; height:30px; align-items:center; justify-content:center; border-radius:8px; background:rgba(255,255,255,.12); color:#fff; font-weight:800; font-size:13px; margin-bottom:10px; }
  .pain-item p { font-size:14px; color:#FECACA; line-height:1.5; }
  .teaser { background:var(--ink); padding:80px 24px; }
  .teaser-inner { max-width:860px; margin:0 auto; }
  .section-label { font-family:'Caveat Brush','Barlow',sans-serif; font-size:22px; color:var(--red-soft); margin-bottom:10px; }
  .section-title { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:clamp(30px,6vw,50px); line-height:1; margin-bottom:32px; font-weight:400; }
  .section-title span { color:var(--red); }
  .items-list { display:flex; flex-direction:column; gap:10px; }
  .item-row { display:flex; align-items:center; gap:16px; background:#1A1A1A; border:1px solid #2A2A2A; border-radius:8px; padding:18px 20px; }
  .item-num { background:var(--red); color:var(--paper); font-family:'Barlow Condensed','Bebas Neue',sans-serif; font-size:18px; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .item-lock { font-size:10px; margin-left:auto; opacity:.45; color:#9CA3AF; }
  .item-text { font-size:15px; font-weight:600; color:var(--white); }
  .form-section { background:#0D0D0D; border-top:1px solid #1F1F1F; border-bottom:1px solid #1F1F1F; padding:80px 24px; }
  .form-wrap { max-width:500px; margin:0 auto; text-align:center; }
  .step-indicator { display:flex; justify-content:center; gap:8px; margin-bottom:32px; }
  .step-dot { width:8px; height:8px; border-radius:50%; background:#333; }
  .step-dot.active { background:var(--red); transform:scale(1.3); }
  .step-dot.done { background:#555; }
  .step-question { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:clamp(24px,5vw,34px); color:var(--paper); margin-bottom:24px; line-height:1.1; font-weight:400; }
  .options-grid { display:flex; flex-direction:column; gap:10px; margin-bottom:8px; }
  .option-btn { background:#1A1A1A; border:1.5px solid #333; border-radius:8px; padding:16px 20px; color:var(--white); font-family:'Barlow',Arial,sans-serif; font-size:15px; font-weight:600; cursor:pointer; text-align:left; display:flex; align-items:center; gap:12px; }
  .option-btn:hover { border-color:var(--red); background:rgba(204,0,0,.08); }
  .opt-icon { width:28px; height:28px; border-radius:6px; background:#2A2A2A; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
  .whatsapp-badge { display:inline-flex; background:rgba(37,211,102,.12); border:1px solid rgba(37,211,102,.3); color:#4ADE80; font-size:12px; font-weight:700; padding:7px 16px; border-radius:100px; margin-bottom:24px; }
  .summary-box { background:#1A1A1A; border:1px solid #2A2A2A; border-radius:8px; padding:16px 20px; margin-bottom:24px; text-align:left; }
  .summary-box p { font-size:13px; color:#9CA3AF; margin-bottom:6px; }
  .summary-item { display:flex; align-items:center; gap:8px; font-size:14px; color:#D1D5DB; margin-bottom:4px; }
  .summary-item span { color:var(--red); font-size:11px; font-weight:800; }
  .form-group { margin-bottom:16px; text-align:left; }
  .form-group label { display:block; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#9CA3AF; margin-bottom:8px; }
  .phone-wrap { display:flex; }
  .ddi { background:#1A1A1A; border:1px solid #333; border-right:none; border-radius:10px 0 0 10px; padding:14px 12px; font-size:15px; color:#9CA3AF; display:flex; align-items:center; white-space:nowrap; }
  .phone-input { flex:1; background:#1A1A1A; border:1px solid #333; border-radius:0 8px 8px 0; padding:14px 16px; font-family:'Barlow',Arial,sans-serif; font-size:16px; color:var(--white); outline:none; }
  .nome-input { width:100%; background:#1A1A1A; border:1px solid #333; border-radius:8px; padding:14px 18px; font-family:'Barlow',Arial,sans-serif; font-size:16px; color:var(--white); outline:none; }
  .btn-whatsapp { width:100%; background:var(--green); color:#000; border:none; border-radius:8px; padding:18px; font-family:'Barlow Condensed','Bebas Neue',sans-serif; font-size:22px; letter-spacing:2px; cursor:pointer; margin-top:8px; }
  .btn-whatsapp:disabled { opacity:.7; cursor:wait; }
  .form-note { font-size:11px; color:#555; margin-top:12px; line-height:1.5; }
  .error-box { margin:0 0 14px; border:1px solid rgba(204,0,0,.45); background:rgba(204,0,0,.12); color:#FCA5A5; border-radius:10px; padding:12px; font-size:14px; text-align:left; }
  .success-box { text-align:center; }
  .success-icon { width:56px; height:56px; margin:0 auto 16px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#16A34A; color:#041604; font-weight:900; }
  .success-box h3 { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:34px; color:#4ADE80; margin-bottom:12px; font-weight:400; }
  .success-box p { color:#9CA3AF; font-size:15px; line-height:1.6; margin-bottom:28px; }
  .success-note a, footer a, .author-link a { color:var(--red); font-weight:700; text-decoration:none; }
  .author-band { background:var(--ink); }
  .author { padding:60px 24px; max-width:700px; margin:0 auto; display:flex; align-items:center; gap:24px; flex-wrap:wrap; }
  .author-avatar { width:72px; height:72px; border-radius:50%; background:linear-gradient(135deg,var(--red-dark),var(--red)); display:flex; align-items:center; justify-content:center; font-size:24px; font-family:'Bebas Neue','Barlow Condensed',sans-serif; flex-shrink:0; border:3px solid var(--red); }
  .author-info h3 { font-family:'Bebas Neue','Barlow Condensed',sans-serif; font-size:24px; color:var(--paper); margin-bottom:4px; font-weight:400; }
  .author-info p { font-size:14px; color:#9CA3AF; line-height:1.5; }
  .oab { display:inline-block; background:rgba(204,0,0,.15); border:1px solid rgba(204,0,0,.3); color:#ff8080; font-size:10px; font-weight:700; letter-spacing:1px; padding:3px 10px; border-radius:100px; margin-bottom:6px; }
  footer { background:#080808; border-top:1px solid #1A1A1A; padding:28px 24px; text-align:center; }
  footer p { color:#555; font-size:12px; line-height:1.7; }
  footer strong { color:#9CA3AF; }
  footer b { color:#CC0000; }
  @media (max-width:600px) { .author { flex-direction:column; text-align:center; } .pain-grid { grid-template-columns:1fr; } }
`;
