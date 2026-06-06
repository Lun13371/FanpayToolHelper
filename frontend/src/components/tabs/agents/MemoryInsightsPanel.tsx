import { Brain, Search } from 'lucide-react';
import type { RealInsight } from '../AgentsTab';

interface MemoryInsightsPanelProps { realInsights: RealInsight[]; }

const TYPE_BADGE: Record<string, string> = {
  trend:                 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20',
  demand:                'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  automation_potential:  'bg-violet-400/10 text-violet-300 border-violet-400/20',
  competitor_strategy:   'bg-amber-400/10 text-amber-300 border-amber-400/20',
};
const TYPE_LABEL: Record<string, string> = {
  trend: 'Тренд', demand: 'Спрос', automation_potential: 'Автоматизация', competitor_strategy: 'Конкуренты',
};

export function MemoryInsightsPanel({ realInsights }: MemoryInsightsPanelProps) {
  const games = Array.from(new Set(realInsights.map(i => i.game_name)));
  const [search, setSearch] = React.useState('');
  const [filterGame, setFilterGame] = React.useState('');

  const filtered = realInsights.filter(i => {
    const q = search.toLowerCase();
    return (!q || i.game_name.toLowerCase().includes(q) || i.content.toLowerCase().includes(q))
      && (!filterGame || i.game_name === filterGame);
  });

  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-amber-400" />
          <h2 className="text-md font-bold text-white">Семантическая память</h2>
          {realInsights.length > 0 && (
            <span className="ml-auto rounded-full bg-slate-950/40 border border-white/5 px-2 py-0.5 text-[10px] text-slate-500">
              {realInsights.length} инсайтов
            </span>
          )}
        </div>

        {realInsights.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-950/30 border border-dashed border-white/5 py-10 text-center">
            <Brain className="w-7 h-7 text-slate-700" />
            <p className="text-xs text-slate-600">Инсайты появятся после первого запуска анализа.</p>
            <p className="text-[10px] text-slate-700">Агенты сохраняют выводы о трендах, спросе и автоматизации в семантическую память.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск по играм и инсайтам…"
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-400/30 transition"
                />
              </div>
              <select value={filterGame} onChange={e => setFilterGame(e.target.value)}
                className="h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-amber-400/30 transition"
              >
                <option value="">Все игры</option>
                {games.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.slice(0, 20).map(ins => (
                <article key={ins.id} className="rounded-2xl bg-slate-950/30 border border-white/5 p-3 hover:border-white/10 transition">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{ins.game_name}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{ins.subcategory_name} · {new Date(ins.created_at).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${TYPE_BADGE[ins.insight_type] ?? 'bg-white/5 text-slate-400 border-white/10'}`}>
                      {TYPE_LABEL[ins.insight_type] ?? ins.insight_type}
                    </span>
                  </div>
                  <p className="text-[11px] leading-4 text-slate-400 line-clamp-3">{ins.content}</p>
                </article>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-2 py-8 text-center text-xs text-slate-600">Ничего не найдено</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import React from 'react';
