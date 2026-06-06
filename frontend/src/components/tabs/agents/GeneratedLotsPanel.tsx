import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownUp, Calendar, ChevronDown, ChevronUp, Clock, Download,
  ExternalLink, FileText, Layers, RefreshCw, Search, SlidersHorizontal,
  Tag, TrendingUp, Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { GeneratedLot } from '../../../types';
import type { AgentCardTab } from './types';
import type { LotsFilter } from '../AgentsTab';
import { formatCurrency } from './utils';
import { getLotTypeMeta } from './constants';

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

const STRATEGY_COLORS: Record<string, string> = {
  aggressive:    'bg-rose-400/10 text-rose-300 border-rose-400/20',
  balanced:      'bg-sky-400/10 text-sky-300 border-sky-400/20',
  premium:       'bg-violet-400/10 text-violet-300 border-violet-400/20',
  undercut:      'bg-amber-400/10 text-amber-300 border-amber-400/20',
  median:        'bg-slate-400/10 text-slate-300 border-slate-400/20',
  resell_margin: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
};

const DIFFICULTY_MAP = {
  easy:   { label: 'Лёгкий', cls: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20' },
  medium: { label: 'Средний', cls: 'bg-amber-400/10 text-amber-300 border-amber-400/20' },
  hard:   { label: 'Сложный', cls: 'bg-rose-400/10 text-rose-300 border-rose-400/20' },
};

type LotsTypeFilter = 'all' | 'classic' | 'digital' | 'resell' | 'service';

export function GeneratedLotsPanel({
  lots, expandedLotId, activeLotCardTabs, exportingId, filter, onFilterChange,
  onToggleExpanded, onChangeTab, onExport,
}: GeneratedLotsPanelProps) {
  const [localSearch, setLocalSearch]     = useState('');
  const [typeFilter, setTypeFilter]       = useState<LotsTypeFilter>('all');

  const games = useMemo(() => Array.from(new Set(lots.map(l => l.game_name))), [lots]);

  const displayed = useMemo(() => lots.filter(l => {
    const q = localSearch.toLowerCase();
    const matchSearch = !q || l.title.toLowerCase().includes(q) || l.game_name.toLowerCase().includes(q);
    const matchType   = typeFilter === 'all' || (l.lot_type ?? 'classic') === typeFilter;
    return matchSearch && matchType;
  }), [lots, localSearch, typeFilter]);

  const totalRevenue = useMemo(() => displayed.reduce((sum, l) => sum + l.price * l.amount, 0), [displayed]);

  // Кол-во лотов по типу
  const typeCounts = useMemo(() => {
    const acc: Record<string, number> = { classic: 0, digital: 0, resell: 0, service: 0 };
    lots.forEach(l => { const t = l.lot_type ?? 'classic'; acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, [lots]);

  if (lots.length === 0) return null;

  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-cyan" />
            <h2 className="text-md font-bold text-white">Сгенерированные лоты</h2>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-cyan/10 border border-brand-cyan/20 px-2.5 py-0.5 text-[10px] font-semibold text-brand-cyan">
              {lots.length} лотов
            </span>
            <span className="rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {formatCurrency(totalRevenue)} потенциал
            </span>
          </div>
        </div>

        {/* Тип-фильтры (пилюли) */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(['all', 'classic', 'digital', 'resell', 'service'] as LotsTypeFilter[]).map(t => {
            const meta = t === 'all' ? null : getLotTypeMeta(t);
            const isActive = typeFilter === t;
            const count = t === 'all' ? lots.length : (typeCounts[t] ?? 0);
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition
                  ${isActive
                    ? meta ? meta.badgeCls : 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30'
                    : 'bg-white/[0.03] text-slate-500 border-white/5 hover:text-slate-300 hover:border-white/10'
                  }`}
              >
                {meta ? meta.emoji : '🗂'} {t === 'all' ? 'Все' : meta!.label}
                <span className="opacity-60 ml-0.5">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Filter row */}
        <div className="flex flex-col gap-2 sm:flex-row mb-5">
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
            <select value={filter.game_name} onChange={e => onFilterChange({ ...filter, game_name: e.target.value })}
              className="h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
            >
              <option value="">Все игры</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={filter.sort_by} onChange={e => onFilterChange({ ...filter, sort_by: e.target.value as LotsFilter['sort_by'] })}
              className="h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => onFilterChange({ ...filter, sort_dir: filter.sort_dir === 'asc' ? 'desc' : 'asc' })}
              className="h-9 w-9 flex items-center justify-center rounded-2xl bg-slate-950/40 border border-white/5 text-slate-400 hover:text-white hover:border-white/10 transition"
            >
              <ArrowDownUp className={`w-3.5 h-3.5 transition ${filter.sort_dir === 'desc' ? 'text-brand-cyan rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {displayed.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-600">Ничего не найдено</div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {displayed.map(lot => {
            const isOpen    = expandedLotId === lot.id;
            const activeTab = activeLotCardTabs[lot.id] ?? 'preview';
            const revenue   = lot.price * lot.amount;
            const stratCls  = STRATEGY_COLORS[lot.price_strategy ?? ''] ?? 'bg-white/[0.04] text-slate-500 border-white/5';
            const meta      = getLotTypeMeta(lot.lot_type);

            return (
              <motion.article
                key={lot.id}
                layout
                className={`rounded-2xl border transition ${isOpen ? `${meta.borderActive} sm:col-span-1` : 'border-white/5 hover:border-white/10'}`}
              >
                {/* Card header */}
                <button
                  onClick={() => onToggleExpanded(lot.id)}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  {/* Иконка с цветом по типу */}
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg ${meta.iconBg}`}>
                    {meta.emoji}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Бейдж типа + заголовок */}
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold leading-none ${meta.badgeCls}`}>
                        {meta.label.toUpperCase()}
                      </span>
                      <p className="truncate text-xs font-semibold text-white">{lot.title}</p>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {lot.game_name} <span className="text-slate-700">·</span> {lot.subcategory_name}
                    </p>

                    {/* Price row */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-400">{formatCurrency(lot.price)}</span>
                      <span className="text-[10px] text-slate-600">×{lot.amount} = </span>
                      <span className="text-[10px] font-semibold text-slate-300">{formatCurrency(revenue)}</span>
                      {lot.price_strategy && (
                        <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${stratCls}`}>
                          {lot.price_strategy}
                        </span>
                      )}
                    </div>

                    {/* Специфичная строка по типу */}
                    {lot.lot_type === 'resell' && lot.resell_margin_pct != null && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-amber-400/80">
                        <RefreshCw className="w-2.5 h-2.5 shrink-0" />
                        Маржа {lot.resell_margin_pct.toFixed(1)}%
                        {lot.resell_source_price != null && (
                          <span className="text-slate-600 ml-1">закуп {formatCurrency(lot.resell_source_price)}</span>
                        )}
                      </div>
                    )}
                    {lot.lot_type === 'digital' && lot.digital_difficulty && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-violet-400/80">
                        <Zap className="w-2.5 h-2.5 shrink-0" />
                        Сложность: {DIFFICULTY_MAP[lot.digital_difficulty]?.label ?? lot.digital_difficulty}
                      </div>
                    )}

                    {/* Market range */}
                    {lot.price_min_market != null && lot.price_max_market != null && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-600">
                        <Tag className="w-2.5 h-2.5" />
                        рынок: {formatCurrency(lot.price_min_market)} – {formatCurrency(lot.price_max_market)}
                        {lot.price_avg_market != null && (
                          <span className="ml-1 text-slate-700">ср. {formatCurrency(lot.price_avg_market)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {isOpen
                    ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  }
                </button>

                {/* Expanded body */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-white/[0.05]"
                    >
                      <div className="p-3.5">
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

                        {/* Описание */}
                        {activeTab === 'preview' && (
                          <div className="space-y-2">
                            <p className="text-[11px] leading-5 text-slate-300 whitespace-pre-line line-clamp-8">{lot.description}</p>

                            {/* Блок цифрового контента */}
                            {lot.lot_type === 'digital' && lot.digital_content_idea && (
                              <div className="rounded-xl bg-violet-500/5 border border-violet-400/10 p-2.5">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <FileText className="w-3 h-3 text-violet-400" />
                                  <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wide">Идея цифрового товара</span>
                                  {lot.digital_difficulty && (
                                    <span className={`ml-auto rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${DIFFICULTY_MAP[lot.digital_difficulty]?.cls ?? ''}`}>
                                      {DIFFICULTY_MAP[lot.digital_difficulty]?.label}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-violet-300 leading-4">{lot.digital_content_idea}</p>
                              </div>
                            )}

                            {/* Блок перепродажи */}
                            {lot.lot_type === 'resell' && (lot.resell_source_url || lot.resell_source_price != null) && (
                              <div className="rounded-xl bg-amber-500/5 border border-amber-400/10 p-2.5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <RefreshCw className="w-3 h-3 text-amber-400" />
                                  <span className="text-[9px] font-semibold text-amber-400 uppercase tracking-wide">Источник перепродажи</span>
                                </div>
                                <div className="space-y-0.5">
                                  {lot.resell_source_price != null && (
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <span className="text-slate-500 w-16 shrink-0">Закупка:</span>
                                      <span className="text-amber-300 font-semibold">{formatCurrency(lot.resell_source_price)}</span>
                                    </div>
                                  )}
                                  {lot.resell_margin_pct != null && (
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <span className="text-slate-500 w-16 shrink-0">Маржа:</span>
                                      <span className={`font-semibold ${lot.resell_margin_pct >= 15 ? 'text-emerald-400' : lot.resell_margin_pct >= 5 ? 'text-amber-300' : 'text-rose-400'}`}>
                                        {lot.resell_margin_pct.toFixed(1)}%
                                      </span>
                                      <span className="text-[9px] text-slate-700">(после комиссии 7%)</span>
                                    </div>
                                  )}
                                  {lot.resell_source_url && (
                                    <a
                                      href={lot.resell_source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-1 text-[9px] text-amber-400/70 hover:text-amber-300 transition mt-1"
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      Открыть лот поставщика
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Параметры */}
                        {activeTab === 'params' && lot.fields_json && (
                          <div className="space-y-1">
                            {lot.created_at && (
                              <div className="flex gap-2 items-center rounded-xl bg-black/20 px-2.5 py-1.5 text-[10px]">
                                <Calendar className="w-3 h-3 shrink-0 text-slate-600" />
                                <span className="text-slate-600">Создан:</span>
                                <span className="text-slate-300">{new Date(lot.created_at).toLocaleString('ru-RU')}</span>
                              </div>
                            )}
                            {/* Тип лота */}
                            <div className="flex gap-2 rounded-xl bg-black/20 px-2.5 py-1.5 text-[10px]">
                              <span className="shrink-0 font-mono text-slate-600 min-w-[80px]">lot_type</span>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${meta.badgeCls}`}>
                                {meta.emoji} {meta.label}
                              </span>
                            </div>
                            {Object.entries(lot.fields_json)
                              .filter(([k]) => !['lot_type', 'seo_keywords'].includes(k))
                              .map(([k, v]) => (
                                <div key={k} className="flex gap-2 rounded-xl bg-black/20 px-2.5 py-1.5 text-[10px]">
                                  <span className="shrink-0 font-mono text-slate-600 min-w-[80px]">{k}</span>
                                  <span className="truncate text-slate-300">{String(v)}</span>
                                </div>
                              ))
                            }
                            {/* SEO ключи */}
                            {Array.isArray(lot.fields_json?.seo_keywords) && lot.fields_json.seo_keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(lot.fields_json.seo_keywords as string[]).map((kw, i) => (
                                  <span key={i} className="rounded-full bg-white/[0.04] border border-white/5 px-2 py-0.5 text-[9px] text-slate-500">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* AI-вывод */}
                        {activeTab === 'ai' && (
                          <div className="space-y-2">
                            {lot.price_strategy && (
                              <div className="flex items-center gap-2 rounded-xl bg-black/20 px-2.5 py-2">
                                <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                                <span className="text-[10px] text-slate-500">Стратегия:</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${stratCls}`}>
                                  {lot.price_strategy}
                                </span>
                              </div>
                            )}
                            <p className="text-[11px] leading-5 text-slate-400 italic">{lot.ai_reasoning}</p>
                          </div>
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
