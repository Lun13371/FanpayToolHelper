import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpDown, ChevronDown, ChevronUp, Download, FileText, Layers, Search, SlidersHorizontal } from 'lucide-react';
import type { GeneratedLot } from '../../../types';
import type { AgentCardTab } from './types';
import type { LotsFilter } from '../AgentsTab';
import { formatCurrency } from './utils';

interface GeneratedLotsPanelProps {
  lots: GeneratedLot[];
  expandedLotId: number | null;
  activeLotCardTabs: Record<number, AgentCardTab>;
  exportingId: number | null;
  filter: LotsFilter;
  onFilterChange: (f: LotsFilter) => void;
  onToggleExpanded: (lotId: number) => void;
  onChangeTab: (lotId: number, tab: AgentCardTab) => void;
  onExport: (lot: GeneratedLot) => void;
}

const SORT_OPTIONS: { value: LotsFilter['sort_by']; label: string }[] = [
  { value: 'game_name', label: 'По игре' },
  { value: 'price',     label: 'По цене' },
  { value: 'amount',    label: 'По кол-ву' },
  { value: 'revenue',   label: 'По выручке' },
];

export function GeneratedLotsPanel({
  lots, expandedLotId, activeLotCardTabs, exportingId, filter, onFilterChange,
  onToggleExpanded, onChangeTab, onExport,
}: GeneratedLotsPanelProps) {
  const [localSearch, setLocalSearch] = useState('');

  const games = Array.from(new Set(lots.map((l) => l.game_name)));

  const displayed = lots.filter(l => {
    const q = localSearch.toLowerCase();
    return !q || l.title.toLowerCase().includes(q) || l.game_name.toLowerCase().includes(q);
  });

  if (lots.length === 0) return null;

  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-brand-cyan" />
          <h2 className="text-md font-bold text-white">Сгенерированные лоты</h2>
          <span className="ml-auto rounded-full bg-brand-cyan/10 border border-brand-cyan/20 px-2.5 py-0.5 text-[10px] font-semibold text-brand-cyan">
            {lots.length} лотов
          </span>
        </div>

        {/* Фильтр-строка */}
        <div className="flex flex-col gap-2 sm:flex-row mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              placeholder="Поиск по названию или игре…"
              className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 pl-9 pr-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <select
              value={filter.game_name}
              onChange={e => onFilterChange({ ...filter, game_name: e.target.value })}
              className="h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
            >
              <option value="">Все игры</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <select
              value={filter.sort_by}
              onChange={e => onFilterChange({ ...filter, sort_by: e.target.value as LotsFilter['sort_by'] })}
              className="h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <button
              onClick={() => onFilterChange({ ...filter, sort_dir: filter.sort_dir === 'asc' ? 'desc' : 'asc' })}
              title={filter.sort_dir === 'asc' ? 'По убыванию' : 'По возрастанию'}
              className="h-9 w-9 flex items-center justify-center rounded-2xl bg-slate-950/40 border border-white/5 text-slate-400 hover:text-white hover:border-white/10 transition"
            >
              <ArrowUpDown className={`w-3.5 h-3.5 transition ${filter.sort_dir === 'desc' ? 'text-brand-cyan rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {displayed.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-600">Ничего не найдено</div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {displayed.map((lot) => {
            const isOpen = expandedLotId === lot.id;
            const activeTab = activeLotCardTabs[lot.id] ?? 'preview';
            return (
              <motion.article
                key={lot.id}
                layout
                className={`rounded-2xl bg-slate-950/40 border transition ${isOpen ? 'border-brand-cyan/20 col-span-1' : 'border-white/5 hover:border-white/10'}`}
              >
                <button
                  onClick={() => onToggleExpanded(lot.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/10 text-brand-cyan">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{lot.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {lot.game_name} · {lot.subcategory_name}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-emerald-400">{formatCurrency(lot.price)}</span>
                      <span className="text-[10px] text-slate-600">×{lot.amount} = {formatCurrency(lot.price * lot.amount)}</span>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-white/[0.04]"
                    >
                      <div className="p-3">
                        {/* Tabs */}
                        <div className="mb-3 flex gap-1 rounded-xl bg-black/20 p-1">
                          {(['preview', 'params', 'ai'] as AgentCardTab[]).map(tab => (
                            <button
                              key={tab}
                              onClick={() => onChangeTab(lot.id, tab)}
                              className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold transition ${activeTab === tab ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              {tab === 'preview' ? 'Описание' : tab === 'params' ? 'Параметры' : 'AI-вывод'}
                            </button>
                          ))}
                        </div>

                        {activeTab === 'preview' && (
                          <p className="text-[11px] leading-5 text-slate-300 whitespace-pre-line line-clamp-6">
                            {lot.description}
                          </p>
                        )}
                        {activeTab === 'params' && lot.fields_json && (
                          <div className="space-y-1">
                            {Object.entries(lot.fields_json).map(([k, v]) => (
                              <div key={k} className="flex gap-2 rounded-xl bg-black/20 px-2.5 py-1.5 text-[10px]">
                                <span className="shrink-0 font-mono text-slate-600">{k}</span>
                                <span className="truncate text-slate-300">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeTab === 'ai' && (
                          <p className="text-[11px] leading-5 text-slate-400 italic">{lot.ai_reasoning}</p>
                        )}

                        <button
                          onClick={() => onExport(lot)}
                          disabled={exportingId === lot.id}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 transition disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {exportingId === lot.id ? 'Экспорт…' : 'Экспорт в шаблон'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
