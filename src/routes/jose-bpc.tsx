import type { FormEvent } from "react";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { leadMagnetHead } from "@/lib/lead-magnet-head";
import { leadMagnetLandings } from "@/components/LeadMagnetLanding";

const config = leadMagnetLandings["jose-bpc"];

const questions = [
  {
    title: "Você se chama José ou está ajudando um José?",
    options: ["Eu sou o José", "Sou familiar/cuidador", "É para outra pessoa"],
  },
  {
    title: "Qual situação parece mais próxima?",
    options: ["Idoso com 65 anos ou mais", "Pessoa com deficiência ou doença", "Ainda não sei"],
  },
  {
    title: "A renda da casa é baixa?",
    options: ["Sim, a renda é baixa", "Não tenho certeza", "Não"],
  },
  {
    title: "O CadÚnico está atualizado?",
    options: ["Sim", "Não", "Não sei"],
  },
  {
    title: "Como está o pedido no INSS?",
    options: ["Ainda não pediu", "Está em análise", "Foi negado ou cortado"],
  },
];

export const Route = createFileRoute("/jose-bpc")({
  head: () => leadMagnetHead(config, "/jose-bpc"),
  component: JoseBpcLanding,
});

function JoseBpcLanding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const formStep = step >= questions.length;

  const choose = (option: string) => {
    const next = [...answers];
    next[step] = option;
    setAnswers(next);
    setTimeout(() => setStep(step + 1), 180);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nums = phone.replace(/\D/g, "");
    setError("");
    if (!name.trim()) return setError("Informe o nome para liberar a triagem.");
    if (nums.length < 10) return setError("Informe um WhatsApp válido com DDD.");
    setSending(true);
    try {
      const res = await fetch("/api/public/instagram-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "jose-bpc",
          name: name.trim(),
          phone: `55${nums}`,
          ref: `jose-bpc: ${answers.filter(Boolean).join(" | ")}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível enviar agora.");
      setSuccess(data?.message ?? "Recebemos seus dados. Vamos seguir pelo WhatsApp.");
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="jose-page">
      <style>{css}</style>
      <section className="hero">
        <div className="topline">Triagem gratuita BPC/LOAS</div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">IBGE + BPC/LOAS</p>
            <h1>José, você ou alguém da sua família pode ter direito ao BPC?</h1>
            <p className="lead">
              Segundo o IBGE, havia mais de <strong>5,7 milhões</strong> de pessoas chamadas Jose no Censo 2010.
              Em 2022, <strong>10,9%</strong> da população brasileira tinha 65 anos ou mais. O nome não dá direito ao benefício,
              mas se existe idade, deficiência, baixa renda e CadÚnico, vale conferir.
            </p>
            <a className="cta" href="#triagem">Fazer triagem agora</a>
          </div>
          <div className="stat-card">
            <span className="stat-number">5,7 mi</span>
            <span className="stat-label">pessoas com nome Jose no Censo 2010</span>
            <div className="mini-grid">
              <div><strong>65+</strong><span>BPC idoso</span></div>
              <div><strong>PCD</strong><span>BPC deficiência</span></div>
              <div><strong>10,9%</strong><span>brasileiros 65+</span></div>
              <div><strong>CadÚnico</strong><span>cadastro atualizado</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="explain">
        <div>
          <p className="eyebrow">O que é BPC/LOAS?</p>
          <h2>É um benefício assistencial de um salário mínimo por mês.</h2>
        </div>
        <div className="cards">
          <article><strong>Não é aposentadoria</strong><p>Não precisa ter contribuído para o INSS, mas precisa cumprir os requisitos.</p></article>
          <article><strong>Para idoso ou pessoa com deficiência</strong><p>Idoso com 65 anos ou mais, ou pessoa com deficiência de qualquer idade.</p></article>
          <article><strong>Depende da renda familiar</strong><p>A análise olha quem mora na casa, renda por pessoa, CadÚnico e documentos.</p></article>
        </div>
      </section>

      <section className="quiz" id="triagem">
        <div className="quiz-box">
          {success ? (
            <div className="success">
              <span>OK</span>
              <h2>Triagem recebida.</h2>
              <p>{success}</p>
            </div>
          ) : (
            <>
              <div className="progress">
                {[...questions, { title: "Contato", options: [] }].map((_, index) => (
                  <i key={index} className={index < step ? "done" : index === step ? "active" : ""} />
                ))}
              </div>
              {!formStep ? (
                <div>
                  <p className="step-label">Pergunta {step + 1} de {questions.length}</p>
                  <h2>{questions[step].title}</h2>
                  <div className="options">
                    {questions[step].options.map(option => (
                      <button key={option} type="button" onClick={() => choose(option)}>{option}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <p className="step-label">Último passo</p>
                  <h2>Agora deixe nome e WhatsApp para continuar a triagem.</h2>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp com DDD" />
                  {error && <p className="error">{error}</p>}
                  <button className="submit" disabled={sending}>{sending ? "Enviando..." : "Enviar triagem pelo WhatsApp"}</button>
                </form>
              )}
            </>
          )}
        </div>
      </section>

      <footer>
        <p>Fonte: IBGE, Nomes no Brasil/Censo 2010; MDS, Benefício de Prestação Continuada.</p>
        <p>Esta triagem não garante concessão. A análise depende dos documentos e dos critérios legais do BPC/LOAS.</p>
      </footer>
    </main>
  );
}

const css = `
  .jose-page{min-height:100vh;background:#f6f1e8;color:#17120c;font-family:Barlow,Arial,sans-serif}
  .hero{padding:34px 20px 56px;background:linear-gradient(135deg,#1f2a25 0%,#0f1714 68%);color:#fff}
  .topline{max-width:1120px;margin:0 auto 28px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d8b56d}
  .hero-grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
  .eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b58b45;margin:0 0 12px}
  h1{font-family:"Barlow Condensed",Barlow,sans-serif;font-size:clamp(46px,7vw,92px);line-height:.9;margin:0 0 20px;text-transform:uppercase;letter-spacing:0}
  .lead{font-size:20px;line-height:1.55;color:#f2e7d2;max-width:760px;margin:0 0 28px}.lead strong{color:#e7c46b}
  .cta,.submit{display:inline-flex;align-items:center;justify-content:center;border:0;background:#d8b56d;color:#18120a;font-weight:900;text-transform:uppercase;letter-spacing:.04em;padding:15px 22px;border-radius:8px;text-decoration:none;cursor:pointer}
  .stat-card{background:#fff;color:#18120a;border-radius:14px;padding:28px;border:1px solid #ead8b6;box-shadow:0 24px 80px rgba(0,0,0,.28)}
  .stat-number{display:block;font-family:"Barlow Condensed",Barlow,sans-serif;font-size:84px;line-height:.9;font-weight:800;color:#9b6a20}.stat-label{font-size:16px;font-weight:700}
  .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:24px}.mini-grid div{border:1px solid #ead8b6;background:#fbf8f0;border-radius:10px;padding:12px}.mini-grid strong{display:block}.mini-grid span{font-size:12px;color:#6d6253}
  .explain{max-width:1120px;margin:0 auto;padding:48px 20px;display:grid;grid-template-columns:.8fr 1.2fr;gap:28px}.explain h2{font-size:34px;line-height:1.05;margin:0}.cards{display:grid;gap:12px}.cards article{background:#fff;border:1px solid #ead8b6;border-radius:12px;padding:18px}.cards p{margin:8px 0 0;color:#5f5547;line-height:1.55}
  .quiz{padding:16px 20px 56px}.quiz-box{max-width:760px;margin:0 auto;background:#fff;border:1px solid #ead8b6;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(68,43,11,.12)}
  .progress{display:flex;gap:8px;margin-bottom:24px}.progress i{height:8px;flex:1;border-radius:20px;background:#ead8b6}.progress i.done,.progress i.active{background:#b58b45}
  .step-label{font-size:12px;font-weight:800;letter-spacing:.12em;color:#9b6a20;text-transform:uppercase;margin:0 0 8px}.quiz h2{font-size:30px;line-height:1.1;margin:0 0 22px}
  .options{display:grid;gap:10px}.options button{border:1px solid #ead8b6;background:#fbf8f0;border-radius:10px;padding:16px;text-align:left;font:inherit;font-weight:800;cursor:pointer}.options button:hover{border-color:#b58b45;background:#fff7df}
  input{width:100%;box-sizing:border-box;border:1px solid #d8c59f;border-radius:10px;padding:15px 14px;font:inherit;margin:0 0 10px;background:#fffdf8}.error{color:#b42318;font-weight:700}.submit{width:100%;margin-top:8px}
  .success{text-align:center;padding:24px}.success span{display:inline-flex;width:58px;height:58px;align-items:center;justify-content:center;background:#1f7a4d;color:#fff;border-radius:50%;font-weight:900}
  footer{max-width:1120px;margin:0 auto;padding:0 20px 36px;color:#6d6253;font-size:13px;line-height:1.5}
  @media(max-width:760px){.hero-grid,.explain{grid-template-columns:1fr}.hero{padding-top:24px}.mini-grid{grid-template-columns:1fr}.quiz h2{font-size:24px}}
`;
