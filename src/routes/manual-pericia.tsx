import { createFileRoute } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";

export const Route = createFileRoute("/manual-pericia")({
  head: () => ({
    meta: [
      { title: "Manual da Pericia Medica Previdenciaria | Maicon Matos" },
      { name: "description", content: "Receba gratuitamente o Manual da Pericia Medica Previdenciaria no WhatsApp." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:ital,wght@0,400;0,600;0,700;1,400&display=swap" },
    ],
  }),
  component: ManualPericiaPage,
});

function ManualPericiaPage() {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const firstName = nome.trim().split(" ")[0] || "tudo bem";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const numeros = whatsapp.replace(/\D/g, "");
    setError("");

    if (!nome.trim()) {
      setError("Informe seu nome para liberar o manual.");
      return;
    }
    if (numeros.length < 10) {
      setError("Informe um WhatsApp valido com DDD.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/public/instagram-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "manual-pericia",
          name: nome.trim(),
          phone: `55${numeros}`,
          ref: "manual-pericia",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Nao foi possivel enviar agora.");
      setSuccess(data?.message ?? "Manual enviado no seu WhatsApp.");
    } catch (e: any) {
      setError(e?.message ?? "Nao foi possivel enviar agora.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="manual-page">
      <style>{css}</style>

      <section className="hero">
        <div className="badge">Material Gratuito - Direito Previdenciario</div>
        <div className="hero-key">PDF</div>
        <h1>Manual da<br /><span>Pericia Medica</span><br />Previdenciaria</h1>
        <p className="hero-sub">Tudo que voce precisa saber antes, durante e depois da pericia do INSS, em linguagem simples.</p>
        <a href="#baixar" className="scroll-hint"><span>↓</span>BAIXAR GRATIS</a>
      </section>

      <section className="pain">
        <h2>Voce esta nessa situacao?</h2>
        <div className="pain-grid">
          <PainItem icon="!" text="Sua pericia esta marcada e voce nao sabe o que levar ou como se comportar" />
          <PainItem icon="PDF" text="O INSS negou seu beneficio apos uma pericia que durou menos de 5 minutos" />
          <PainItem icon="?" text="Voce nao sabe quais sao seus direitos dentro da sala de pericia" />
          <PainItem icon="24h" text="Nao sabe o que fazer depois da negativa e tem medo de perder o prazo" />
        </div>
      </section>

      <section className="content-band">
        <div className="content-section">
          <p className="section-label">O que voce vai receber</p>
          <h2 className="section-title">4 capitulos para<br />nao entrar<br /><span>despreparado.</span></h2>
          <div className="items-list">
            <Item num="1" title="Antes da Pericia - Preparacao" text="Checklist completo de documentos, o que pedir ao seu medico e como organizar tudo" />
            <Item num="2" title="Durante a Pericia - Como se Comportar" text="O que dizer, o que nunca fazer e a dica de ouro que pode definir o resultado" />
            <Item num="3" title="Depois da Pericia - O que Fazer" text="Beneficio aprovado ou negado: proximos passos e prazos que voce nao pode perder" />
            <Item num="4" title="Seus Direitos na Pericia" text="O que o INSS e obrigado a respeitar e como usar isso a seu favor" />
          </div>
        </div>
      </section>

      <section className="form-section" id="baixar">
        <div className="form-wrap">
          <p className="section-label">Acesso gratuito</p>
          <h2 className="section-title">Receba agora<br />o manual</h2>
          <div className="whatsapp-badge">Receba direto no WhatsApp</div>
          <p className="form-sub">Digite seu nome e WhatsApp e receba o manual em PDF <strong>gratuitamente.</strong></p>

          {success ? (
            <div className="success-box">
              <div className="success-icon">OK</div>
              <h3>Acesso Liberado!</h3>
              <p>Obrigado, <strong>{firstName}</strong>.<br />{success}</p>
              <p className="success-note">
                Duvidas sobre seu caso?<br />
                <a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nome">Seu nome</label>
                <input id="nome" type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como posso te chamar?" autoComplete="name" />
              </div>
              <div className="form-group">
                <label htmlFor="whatsapp">Seu WhatsApp</label>
                <div className="phone-input-wrap">
                  <div className="ddi">BR +55</div>
                  <input id="whatsapp" type="tel" value={formatPhone(whatsapp)} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(51) 99999-9999" autoComplete="tel" />
                </div>
              </div>
              {error && <p className="error-box">{error}</p>}
              <button className="btn-main" type="submit" disabled={sending}>
                {sending ? "ENVIANDO..." : "QUERO O MANUAL GRATUITO"}
              </button>
              <p className="form-note">Sem spam. Voce pode sair quando quiser.<br />Seus dados sao protegidos e nunca serao compartilhados.</p>
            </form>
          )}
        </div>
      </section>

      <section className="content-band">
        <div className="author-section">
          <div className="author-avatar">MM</div>
          <div className="author-info">
            <span className="oab">OAB/RS 136.221</span>
            <h3>Maicon Matos</h3>
            <p>Advogado Previdenciario com atuacao em INSS, aposentadoria, auxilio-doenca e recursos administrativos.</p>
            <p className="author-link"><a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a></p>
          </div>
        </div>
      </section>

      <footer>
        <p>
          <strong>Maicon Matos</strong> - Advogado Previdenciario | OAB/RS 136.221<br />
          Material educativo e informativo gratuito. Nao substitui orientacao juridica individualizada.<br />
          <a href="https://instagram.com/maiconmatos.adv" target="_blank" rel="noreferrer">@maiconmatos.adv</a>
        </p>
      </footer>
    </main>
  );
}

function PainItem({ icon, text }: { icon: string; text: string }) {
  return <div className="pain-item"><div className="icon">{icon}</div><p>{text}</p></div>;
}

function Item({ num, title, text }: { num: string; title: string; text: string }) {
  return (
    <div className="item-row">
      <div className="item-num">{num}</div>
      <div className="item-text"><strong>{title}</strong><span>{text}</span></div>
    </div>
  );
}

function formatPhone(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 11);
  if (clean.length <= 10) return clean.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
  return clean.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
}

const css = `
  .manual-page, .manual-page * { box-sizing: border-box; }
  .manual-page { --red:#CC0000; --red-dark:#8B0000; --black:#111111; --white:#FFFFFF; color:var(--white); background:var(--black); min-height:100vh; overflow-x:hidden; font-family:'Barlow',sans-serif; }
  .manual-page a { color: inherit; }
  .hero { min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:60px 24px 80px; position:relative; overflow:hidden; background:#111; }
  .hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 80% 60% at 50% 0%, rgba(204,0,0,.25) 0%, transparent 70%); pointer-events:none; }
  .hero > * { position:relative; z-index:1; }
  .badge { display:inline-block; background:rgba(204,0,0,.2); border:1px solid rgba(204,0,0,.5); color:#ff8080; font-weight:700; font-size:11px; letter-spacing:2px; text-transform:uppercase; padding:6px 16px; border-radius:100px; margin-bottom:28px; }
  .hero-key { font-family:'Bebas Neue',sans-serif; font-size:clamp(44px,12vw,88px); color:#fff; background:var(--red); border-radius:18px; padding:0 20px; margin-bottom:18px; box-shadow:0 0 40px rgba(204,0,0,.45); line-height:1.05; }
  .hero h1 { font-family:'Bebas Neue',sans-serif; font-size:clamp(42px,10vw,80px); line-height:.95; letter-spacing:1px; color:#fff; max-width:800px; text-shadow:0 2px 20px rgba(0,0,0,.8); }
  .hero h1 span { color:var(--red); display:block; }
  .hero-sub { font-size:clamp(16px,3vw,20px); color:#D1D5DB; max-width:540px; margin:20px auto 0; line-height:1.6; }
  .scroll-hint { position:absolute; bottom:32px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; color:#9CA3AF; font-size:12px; letter-spacing:1px; text-decoration:none; }
  .pain { background:var(--red-dark); padding:60px 24px; text-align:center; }
  .pain h2 { font-family:'Bebas Neue',sans-serif; font-size:clamp(28px,6vw,48px); letter-spacing:1px; margin-bottom:40px; }
  .pain-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; max-width:900px; margin:0 auto; }
  .pain-item { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:24px; text-align:left; }
  .pain-item .icon { display:inline-flex; min-width:34px; height:34px; align-items:center; justify-content:center; border-radius:8px; background:rgba(255,255,255,.12); color:#fff; font-weight:800; font-size:13px; margin-bottom:10px; }
  .pain-item p { font-size:15px; color:#FECACA; line-height:1.5; }
  .content-band { background:var(--black); }
  .content-section { max-width:900px; margin:0 auto; padding:80px 24px; }
  .section-label { font-weight:700; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:var(--red); margin-bottom:12px; }
  .section-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(32px,7vw,52px); letter-spacing:1px; color:var(--white); margin-bottom:40px; line-height:1; }
  .section-title span { color:var(--red); }
  .items-list { display:flex; flex-direction:column; gap:12px; }
  .item-row { display:flex; align-items:flex-start; gap:16px; background:#1A1A1A; border:1px solid #2A2A2A; border-radius:12px; padding:18px 20px; transition:border-color .2s, transform .2s; }
  .item-row:hover { border-color:rgba(204,0,0,.4); transform:translateX(4px); }
  .item-num { background:var(--red); color:var(--white); font-family:'Bebas Neue',sans-serif; font-size:18px; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .item-text strong { display:block; font-size:15px; font-weight:700; color:var(--white); margin-bottom:2px; }
  .item-text span { font-size:14px; color:#9CA3AF; line-height:1.4; }
  .form-section { background:#0D0D0D; border-top:1px solid #1F1F1F; border-bottom:1px solid #1F1F1F; padding:80px 24px; }
  .form-wrap { max-width:520px; margin:0 auto; text-align:center; }
  .form-sub { color:#9CA3AF; font-size:16px; margin-bottom:36px; line-height:1.6; }
  .form-sub strong { color:var(--white); }
  .whatsapp-badge { display:inline-flex; align-items:center; gap:8px; background:rgba(37,211,102,.12); border:1px solid rgba(37,211,102,.3); color:#4ADE80; font-size:13px; font-weight:700; padding:8px 16px; border-radius:100px; margin-bottom:28px; }
  .form-group { margin-bottom:16px; text-align:left; }
  .form-group label { display:block; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#9CA3AF; margin-bottom:8px; }
  .phone-input-wrap { display:flex; gap:0; }
  .ddi { background:#1A1A1A; border:1px solid #333; border-right:none; border-radius:10px 0 0 10px; padding:14px; font-size:16px; color:#9CA3AF; white-space:nowrap; display:flex; align-items:center; }
  .form-group input { width:100%; background:#1A1A1A; border:1px solid #333; border-radius:10px; padding:14px 18px; font-family:'Barlow',sans-serif; font-size:16px; color:var(--white); outline:none; transition:border-color .2s, box-shadow .2s; }
  .phone-input-wrap input { border-radius:0 10px 10px 0; }
  .form-group input::placeholder { color:#555; }
  .form-group input:focus { border-color:#25D366; box-shadow:0 0 0 3px rgba(37,211,102,.12); }
  .btn-main { width:100%; background:#25D366; color:var(--black); border:none; border-radius:10px; padding:18px; font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:2px; cursor:pointer; margin-top:8px; transition:background .2s, transform .15s, box-shadow .2s; display:flex; align-items:center; justify-content:center; }
  .btn-main:hover { background:#1ebe5a; transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,211,102,.3); }
  .btn-main:disabled { opacity:.7; cursor:wait; transform:none; }
  .form-note { font-size:12px; color:#555; margin-top:14px; line-height:1.5; }
  .error-box { margin:0 0 14px; border:1px solid rgba(204,0,0,.45); background:rgba(204,0,0,.12); color:#FCA5A5; border-radius:10px; padding:12px; font-size:14px; text-align:left; }
  .success-box { background:#0A1F0A; border:1px solid #16A34A; border-radius:16px; padding:40px 32px; text-align:center; }
  .success-icon { width:48px; height:48px; margin:0 auto 16px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#16A34A; color:#041604; font-weight:900; }
  .success-box h3 { font-family:'Bebas Neue',sans-serif; font-size:32px; color:#4ADE80; margin-bottom:12px; }
  .success-box p { color:#9CA3AF; font-size:15px; line-height:1.6; margin-bottom:24px; }
  .success-note { margin-top:20px; font-size:13px; color:#6B7280; }
  .success-note a, footer a, .author-link a { color:var(--red); font-weight:700; text-decoration:none; }
  .author-section { padding:60px 24px; max-width:700px; margin:0 auto; display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
  .author-avatar { width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,var(--red-dark),var(--red)); display:flex; align-items:center; justify-content:center; font-size:24px; font-family:'Bebas Neue',sans-serif; flex-shrink:0; border:3px solid var(--red); }
  .author-info h3 { font-family:'Bebas Neue',sans-serif; font-size:26px; letter-spacing:1px; color:var(--white); margin-bottom:4px; }
  .author-info p { font-size:14px; color:#9CA3AF; line-height:1.6; }
  .oab { display:inline-block; background:rgba(204,0,0,.15); border:1px solid rgba(204,0,0,.3); color:#ff6b6b; font-size:11px; font-weight:700; letter-spacing:1px; padding:3px 10px; border-radius:100px; margin-bottom:8px; }
  footer { background:#080808; border-top:1px solid #1A1A1A; padding:32px 24px; text-align:center; }
  footer p { color:#555; font-size:13px; line-height:1.7; }
  footer strong { color:#9CA3AF; }
  @media (max-width:600px) { .author-section { flex-direction:column; text-align:center; } .pain-grid { grid-template-columns:1fr; } }
`;
