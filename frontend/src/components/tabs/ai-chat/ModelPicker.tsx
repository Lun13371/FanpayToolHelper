import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, Check } from 'lucide-react';
import { ChatModelInfo } from '../../../types';

interface Props {
  models: ChatModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
  loading?: boolean;
}

export default function ModelPicker({ models, value, onChange, loading }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = models.find((m) => m.id === value);
  const label = current?.display_name || current?.id || value || 'Модель не выбрана';

  const priceHint = (m: ChatModelInfo): string | null => {
    const p: any = m.pricing;
    if (!p) return null;
    const c = p.completion ?? p.output ?? p.price;
    return typeof c === 'number' ? `$${c}/M tok` : null;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-all"
        title="Выбор модели"
      >
        <Cpu className="w-3.5 h-3.5 text-brand-cyan" />
        <span className="max-w-[160px] truncate font-medium">{loading ? 'Загрузка…' : label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto z-50 rounded-2xl border border-white/10 bg-[#0B0D13]/95 backdrop-blur-xl shadow-2xl p-1.5">
          {models.length === 0 && (
            <div className="px-3 py-4 text-xs text-slate-500 text-center">
              Нет доступных моделей. Проверьте AI-ключи.
            </div>
          )}
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-start gap-2 ${
                m.id === value ? 'bg-brand-cyan/10 border border-brand-cyan/20' : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {m.display_name || m.id}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] text-slate-500 font-mono truncate">{m.id}</span>
                  {m.supports_tools && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase tracking-wide">
                      tools
                    </span>
                  )}
                  {priceHint(m) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10">
                      {priceHint(m)}
                    </span>
                  )}
                </div>
              </div>
              {m.id === value && <Check className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
