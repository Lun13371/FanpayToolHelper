import { Bot, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatItem } from './types';
import ToolCallBubble from './ToolCallBubble';
import TemplateDraftCard from './TemplateDraftCard';
import ConfirmCard from './ConfirmCard';
import { FanpayAccount } from '../../../types';

interface Props {
  items: ChatItem[];
  accounts: FanpayAccount[];
  token: string;
}

/** Кастомные компоненты markdown под стиль панели */
const mdComponents = {
  // Ссылки открываем в новой вкладке
  a: ({ node, ...props }: any) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="text-brand-cyan underline decoration-brand-cyan/40 hover:decoration-brand-cyan break-all"
    />
  ),
  table: ({ node, ...props }: any) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-white/10">
      <table {...props} className="w-full text-xs border-collapse" />
    </div>
  ),
  th: ({ node, ...props }: any) => (
    <th
      {...props}
      className="px-2.5 py-1.5 bg-white/[0.06] border-b border-white/10 text-left font-semibold text-slate-200 whitespace-nowrap"
    />
  ),
  td: ({ node, ...props }: any) => (
    <td {...props} className="px-2.5 py-1.5 border-b border-white/5 text-slate-300 align-top" />
  ),
  ul: ({ node, ...props }: any) => <ul {...props} className="list-disc pl-5 my-1.5 space-y-0.5" />,
  ol: ({ node, ...props }: any) => <ol {...props} className="list-decimal pl-5 my-1.5 space-y-0.5" />,
  li: ({ node, ...props }: any) => <li {...props} className="leading-relaxed" />,
  p: ({ node, ...props }: any) => <p {...props} className="my-1 first:mt-0 last:mb-0 leading-relaxed" />,
  h1: ({ node, ...props }: any) => (
    <h1 {...props} className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0" />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 {...props} className="text-sm font-bold text-white mt-3 mb-1 first:mt-0" />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 {...props} className="text-sm font-semibold text-white mt-2.5 mb-1 first:mt-0" />
  ),
  hr: ({ node, ...props }: any) => <hr {...props} className="my-3 border-white/10" />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote
      {...props}
      className="my-2 pl-3 border-l-2 border-brand-cyan/30 text-slate-400 italic"
    />
  ),
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code
        {...props}
        className="px-1.5 py-0.5 rounded-md bg-black/30 text-[11px] font-mono text-brand-cyan/90"
      />
    ) : (
      <code
        {...props}
        className="block my-2 p-2.5 rounded-lg bg-black/30 border border-white/10 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre"
      />
    ),
  pre: ({ node, ...props }: any) => <pre {...props} className="bg-transparent m-0 p-0" />,
  strong: ({ node, ...props }: any) => <strong {...props} className="font-semibold text-white" />,
};

export default function ChatMessages({ items, accounts, token }: Props) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        if (item.kind === 'tool') {
          return <ToolCallBubble key={item.id} item={item} />;
        }
        if (item.kind === 'draft') {
          return <TemplateDraftCard key={item.id} draft={item.draft} token={token} accounts={accounts} />;
        }
        if (item.kind === 'confirm') {
          return <ConfirmCard key={item.id} request={item.request} token={token} accounts={accounts} />;
        }
        // text
        const isUser = item.role === 'user';
        return (
          <div key={item.id} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
              <div className="w-8 h-8 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-brand-cyan" />
              </div>
            )}
            <div
              className={`max-w-2xl rounded-2xl px-4 py-2.5 text-sm break-words ${
                isUser
                  ? 'bg-brand-cyan/10 border border-brand-cyan/20 text-white rounded-br-md whitespace-pre-wrap'
                  : 'bg-white/[0.04] border border-white/10 text-slate-200 rounded-bl-md'
              }`}
            >
              {isUser ? (
                item.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {item.content}
                </ReactMarkdown>
              )}
              {item.streaming && (
                <span className="inline-block w-1.5 h-4 bg-brand-cyan rounded-sm ml-1 align-middle animate-pulse" />
              )}
            </div>
            {isUser && (
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
