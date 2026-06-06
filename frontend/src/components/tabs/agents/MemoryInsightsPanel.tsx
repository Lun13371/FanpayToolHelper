import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain, Calendar, ChevronDown, ChevronUp, Filter, Search, Sparkles, Tag, TrendingUp, X,
} from 'lucide-react';
import type { RealInsight } from '../AgentsTab';

interface MemoryInsightsPanelProps { realInsights: RealInsight[]; }

const TYPE_CFG: Record<string, { label: string; cls: string; icon: React.FC<{className?: string}> }> = {
  trend:                { label: 'Тренд',         cls: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20',       icon: TrendingUp },
  demand:               { label: 'Спрос',         cls: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',    icon: Sparkles   },
  automation_potential: { label: 'Авто',          cls: 'bg-violet-400/10 text-violet-300 border-violet-400/20',       icon: Sparkles   },
  competitor_strategy:  { label: 'Конкуренты',    cls: 'bg-amber-400/10 text-amber-300 border-amber-400/20',          icon: Tag        },
};
const DEFAULT_TYPE = { label: '?', cls: 'bg-white/5 text-slate-400 border-white/10', icon: Tag };

export function MemoryInsightsPanel({ realInsights }: MemoryInsightsPanelProps) {
  const [search, setSearch]           = useState('');
  const [filterGame, setFilterGame]   = useState('');
  const [filterType, setFilterType]   = useState('');
  const [showFilter, setShowFilter]   = useState(false);
  const [expanded, setExpanded]       = useState<number | null>(null);

  const games = useMemo(() => Array.from(new Set(realInsights.map(i => i.game_name))), [realInsights]);
  const types = useMemo(() => Array.from(new Set(realInsights.map(i => i.insight_type))), [realInsights]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return realInsights.filter(i =>
      (!q || i.game_name.toLowerCase().includes(q) || i.content.toLowerCase().includes(q) || i.subcategory_name.toLowerCase().includes(q)) &&
      (!filterGame || i.game_name === filterGame) &&
      (!filterType || i.insight_type === filterType)
    );
  }, [realInsights, search, filterGame, filterType]);

  const groupedByGame = useMemo(() => {
    const map: Record<string, RealInsight[]> = {};
    filtered.forEach(i => {
      if (!map[i.game_name]) map[i.game_name] = [];
      map[i.game_name].push(i);
    });
    return Object.entries(map).sort(([,a],[,b]) => b.length - a.length);
  }, [filtered]);

  return (
    <div className="rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10 p-5 sm:p-6">

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-amber-400" />
          <h2 className="text-md font-bold text-white">Семантическая память</h2>
          <span className="ml-auto rounded-full bg-amber-400/10 border border-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
            {realInsights.length} инсайтов
          </span>
          <button onClick={() => setShowFilter(p => !p)}
            className={`rounded-lg border px-2 py-1 text-[9px] font-semibold flex items-center gap-1 transition ${showFilter ? 'bg-amber-400/10 border-amber-400/25 text-amber-300' : 'border-white/5 text-slate-500 hover:text-white bg-slate-950/30'}`}
          >
            <Filter className="w-3 h-3" /> Фильтр
          </button>
        </div>

        {/* Filter bar */}
        <AnimatePresence initial={false}>
          {showFilter && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
              <div className="rounded-2xl border border-white/5 bg-black/15 p-3 space-y-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по играм и инсайтам…"
                    className="w-full h-8 rounded-xl bg-slate-950/40 border border-white/5 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-400/30 transition"
                  />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[9px] uppercase tracking-widest text-slate-600">Игра:</span>
                  {['', ...games].slice(0, 8).map(g => (
                    <button key={g || '__all__'} onClick={() => setFilterGame(g)}
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold transition ${filterGame === g ? 'bg-amber-400/10 border-amber-400/25 text-amber-300' : 'border-white/5 text-slate-500 hover:text-white'}`}
                    >{g || 'Все'}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[9px] uppercase tracking-widest text-slate-600">Тип:</span>
                  {['', ...types].map(t => (
                    <button key={t || '__all__'} onClick={() => setFilterType(t)}
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold transition ${filterType === t ? 'bg-amber-400/10 border-amber-400/25 text-amber-300' : 'border-white/5 text-slate-500 hover:text-white'}`}
                    >{t ? (TYPE_CFG[t]?.label ?? t) : 'Все'}</button>
                  ))}
                  {(search || filterGame || filterType) && (
                    <button onClick={() => { setSearch(''); setFilterGame(''); setFilterType(''); }}
                      className="ml-auto flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-300 transition">
                      <X className="w-3 h-3" /> Сбросить
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {realInsights.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-950/30 border border-dashed border-white/5 py-10 text-center">
            <Brain className="w-7 h-7 text-slate-700" />
            <p className="text-xs text-slate-600">Инсайты появятся после первого запуска анализа.</p>
            <p className="text-[10px] text-slate-700 max-w-xs leading-5">Агенты сохраняют выводы о трендах, спросе и стратегиях конкурентов в семантическую память.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Search className="w-6 h-6 text-slate-700" />
            <p className="text-xs text-slate-600">По фильтру ничего не найдено.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {groupedByGame.map(([game, items]) => (
              <div key={game} className="rounded-2xl border border-white/5 overflow-hidden">

                {/* Game header */}
                <button
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-950/30 hover:bg-slate-950/50 transition text-left"
                  onClick={() => setExpanded(expanded === items[0].id ? null : items[0].id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-white truncate">{game}</span>
                    <span className="rounded-full bg-white/[0.06] border border-white/5 px-2 py-0.5 text-[9px] text-slate-400 font-semibold shrink-0">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {Array.from(new Set(items.map(i => i.insight_type))).slice(0, 3).map(t => {
                      const cfg = TYPE_CFG[t] ?? DEFAULT_TYPE;
                      return (
                        <span key={t} className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      );
                    })}
                  </div>
                </button>

                {/* Insights list — always visible */}
                <div className="divide-y divide-white/[0.04]">
                  {items.slice(0, 5).map(ins => {
                    const cfg  = TYPE_CFG[ins.insight_type] ?? DEFAULT_TYPE;
                    const Icon = cfg.icon;
                    const isX  = expanded === ins.id;
                    return (
                      <div key={ins.id} className="px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.cls.split(' ')[1]}`} />
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <span>{ins.subcategory_name}</span>
                                <Calendar className="w-2.5 h-2.5" />
                                <span>{new Date(ins.created_at).toLocaleDateString('ru-RU')}</span>
                              </div>
                              <p className={`text-[11px] leading-4 text-slate-300 mt-0.5 ${isX ? '' : 'line-clamp-2'}`}>{ins.content}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
                            <button
                              onClick={() => setExpanded(isX ? null : ins.id)}
                              className="text-[8px] text-slate-600 hover:text-slate-300 flex items-center gap-0.5 transition"
                            >
                              {isX ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {items.length > 5 && (
                    <div className="px-3.5 py-2 text-[10px] text-slate-600 text-center">
                      + ещё {items.length - 5} инсайтов
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
