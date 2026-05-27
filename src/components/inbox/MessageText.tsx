/**
 * Renderização moderna do corpo de mensagem.
 * - Suporta markdown (negrito, listas, links, code) — comum em respostas da IA.
 * - Detecta links automaticamente em texto puro.
 * - Mantém quebras de linha do WhatsApp (whitespace-pre-wrap).
 */
import ReactMarkdown from "react-markdown";
import { memo } from "react";

type Props = {
  content: string;
  isOutbound: boolean;
};

// Heurística leve: só ativa markdown se houver sintaxe relevante.
// Evita quebrar mensagens curtas do tipo "Oi" ou texto puro.
function looksLikeMarkdown(s: string): boolean {
  return /(\*\*|__|^[-*]\s|\[[^\]]+\]\(|\n#+\s|`)/m.test(s);
}

export const MessageText = memo(function MessageText({ content, isOutbound }: Props) {
  const cls = isOutbound
    ? "prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-a:text-[#0a6e6a] prose-strong:text-[#111b21] text-[#111b21] px-4 py-2.5 break-words"
    : "prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-a:text-[#0a6e6a] prose-strong:text-[#111b21] text-[#111b21] px-4 py-2.5 break-words";

  if (!looksLikeMarkdown(content)) {
    return (
      <p className="text-[#111b21] leading-relaxed whitespace-pre-wrap break-words px-4 py-2.5">
        {content}
      </p>
    );
  }

  return (
    <div className={cls}>
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" className="text-[#0a6e6a] underline hover:opacity-80" />
          ),
          p: ({ node, ...props }) => <p {...props} className="my-1" />,
          ul: ({ node, ...props }) => <ul {...props} className="my-1 pl-4 list-disc" />,
          ol: ({ node, ...props }) => <ol {...props} className="my-1 pl-4 list-decimal" />,
          code: ({ node, ...props }) => (
            <code {...props} className="px-1 py-0.5 rounded bg-black/5 text-[0.92em] font-mono" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
