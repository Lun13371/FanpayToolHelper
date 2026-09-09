import { useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
}

export default function ChatInput({ onSend, onStop, streaming }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!streaming) ref.current?.focus();
  }, [streaming]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const value = ref.current?.value.trim();
    if (!value || streaming) return;
    if (ref.current) ref.current.value = '';
    onSend(value);
  };

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 focus-within:border-brand-cyan/30 transition-colors">
      <textarea
        ref={ref}
        rows={1}
        placeholder="Опишите лот: например, «создай шаблон продажи аккаунтов Brawl Stars с ценой 350₽»…"
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none resize-none px-2 py-1.5 max-h-40 min-h-[38px]"
        style={{ height: 'auto' }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 160) + 'px';
        }}
      />
      {streaming ? (
        <button
          onClick={onStop}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all shrink-0"
          title="Остановить генерацию"
        >
          <Square className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={submit}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/20 transition-all shrink-0"
          title="Отправить (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
