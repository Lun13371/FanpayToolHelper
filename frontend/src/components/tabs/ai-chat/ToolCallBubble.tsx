import { useState } from 'react';
import { Wrench, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ChatItem } from './types';

const TOOL_LABELS: Record<string, string> = {
  search_categories: 'Поиск категорий Funpay',
  get_category_form_fields: 'Загрузка полей формы',
  propose_lot_template: 'Подготовка черновика шаблона',
  list_lot_templates: 'Список шаблонов',
  delete_lot_template: 'Удаление шаблона',
  list_accounts: 'Список аккаунтов',
};

export default function ToolCallBubble({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[item.name] || item.name;
  const isError = item.result && typeof item.result === 'object' && 'error' in (item.result as any);

  const resultPreview = (() => {
    if (!item.result) return '';
    try {
      return JSON.stringify(item.result, null, 2);
    } catch {
      return String(item.result);
    }
  })();

  const argsPreview = (() => {
    try {
      return JSON.stringify(item.args, null, 2);
    } catch {
      return String(item.args);
    }
  })();

  return (
    <div className="flex justify-start">
      <div className="max-w-xl w-full rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
        >
          {item.running ? (
            <Loader2 className="w-3.5 h-3.5 text-brand-cyan animate-spin shrink-0" />
          ) : isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <Wrench className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-300 font-medium flex-1 truncate">{label}</span>
          <span className="text-[10px] text-slate-600 font-mono">{item.name}</span>
          <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {open && (
          <div className="border-t border-white/5 px-3 py-2 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Аргументы</div>
              <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-black/20 rounded-lg p-2 max-h-40 overflow-y-auto">
                {argsPreview}
              </pre>
            </div>
            {item.result !== undefined && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Результат</div>
                <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-black/20 rounded-lg p-2 max-h-60 overflow-y-auto">
                  {resultPreview}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
