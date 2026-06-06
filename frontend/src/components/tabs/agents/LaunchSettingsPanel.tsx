import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Zap } from 'lucide-react';
import type { FanpayAccount } from '../../../types';
import type { LaunchMode } from './types';
import { API_URL } from '../../../context/AppContext';

interface Category { node_id: string; game_name: string; subcategory_name: string; category_type: string; }

interface LaunchSettingsPanelProps {
  visible: boolean; mode: LaunchMode; limit: number; tavilyKey: string;
  targetAccountId: number | null; accounts: FanpayAccount[];
  isStarting: boolean; manualNodeIds: string[];
  onModeChange: (m: LaunchMode) => void; onLimitChange: (v: number) => void;
  onTavilyKeyChange: (v: string) => void; onTargetAccountChange: (v: number | null) => void;
  onManualNodeIdsChange: (ids: string[]) => void; onSubmit: () => void;
}

export function LaunchSettingsPanel({ visible, mode, limit, tavilyKey, targetAccountId, accounts, isStarting, manualNodeIds, onModeChange, onLimitChange, onTavilyKeyChange, onTargetAccountChange, onManualNodeIdsChange, onSubmit }: LaunchSettingsPanelProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [showCatPicker, setShowCatPicker] = useState(false);

  useEffect(() => {
    if (mode !== 'manual') return;
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    fetch(`${API_URL}/api/v1/agents/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [mode]);

  const filtered = categories.filter(c =>
    !catSearch || c.game_name.toLowerCase().includes(catSearch.toLowerCase()) ||
    c.subcategory_name.toLowerCase().includes(catSearch.toLowerCase())
  );

  const toggleCat = (id: string) => {
    onManualNodeIdsChange(manualNodeIds.includes(id)
      ? manualNodeIds.filter(x => x !== id)
      : [...manualNodeIds, id]
    );
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
          className="p-5 sm:p-6 rounded-3xl glow-card relative"
        >
          <div className="glow-bg rounded-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-brand-cyan" />
              <h2 className="text-md font-bold text-white">Параметры запуска</h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Режим</label>
                <div className="flex gap-1 rounded-2xl bg-slate-950/40 border border-white/5 p-1">
                  {(['auto', 'manual'] as LaunchMode[]).map(m => (
                    <button key={m} onClick={() => onModeChange(m)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${mode === m ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20' : 'text-slate-400 hover:text-white'}`}
                    >{m === 'auto' ? 'Авто' : 'Ручной'}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Лимит категорий</label>
                <input type="number" min={2} max={12} value={limit}
                  onChange={e => onLimitChange(Number(e.target.value) || 5)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Аккаунт</label>
                <select value={targetAccountId ?? ''}
                  onChange={e => onTargetAccountChange(Number(e.target.value) || null)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                >
                  <option value="">— Без привязки —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tavily API Key</label>
                <input type="password" value={tavilyKey} placeholder="tvly-…"
                  onChange={e => onTavilyKeyChange(e.target.value)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                />
              </div>
            </div>

            {/* Ручной выбор категорий */}
            {mode === 'manual' && (
              <div className="mt-4">
                <button onClick={() => setShowCatPicker(p => !p)}
                  className="flex items-center gap-2 text-xs font-semibold text-brand-cyan mb-2 hover:text-cyan-300 transition"
                >
                  {showCatPicker ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Выбрать категории вручную
                  {manualNodeIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-brand-cyan/15 border border-brand-cyan/25 px-2 py-0.5 text-[9px] text-brand-cyan">
                      {manualNodeIds.length} выбрано
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showCatPicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl bg-slate-950/40 border border-white/5 p-3">
                        <input
                          value={catSearch} onChange={e => setCatSearch(e.target.value)}
                          placeholder="Поиск игры или категории…"
                          className="w-full h-8 rounded-xl bg-black/20 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 mb-3 transition"
                        />
                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {filtered.length === 0 && (
                            <div className="text-xs text-slate-600 py-4 text-center">
                              {categories.length === 0 ? 'Загрузка категорий…' : 'Ничего не найдено'}
                            </div>
                          )}
                          {filtered.slice(0, 80).map(cat => {
                            const selected = manualNodeIds.includes(cat.node_id);
                            return (
                              <button key={cat.node_id} onClick={() => toggleCat(cat.node_id)}
                                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition ${selected ? 'bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan' : 'bg-white/[0.02] border border-white/5 text-slate-300 hover:bg-white/[0.05]'}`}
                              >
                                <span>{cat.game_name} <span className="text-slate-500">→</span> {cat.subcategory_name}</span>
                                <span className={`shrink-0 text-[9px] font-mono ${selected ? 'text-brand-cyan' : 'text-slate-600'}`}>
                                  #{cat.node_id}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {manualNodeIds.length > 0 && (
                          <button onClick={() => onManualNodeIdsChange([])}
                            className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 transition"
                          >
                            Сбросить выбор
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button onClick={onSubmit} disabled={isStarting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 py-2.5 px-5 text-xs font-semibold transition disabled:opacity-50"
            >
              {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {isStarting ? 'Запускаем…' : 'Запустить анализ'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
