import { History } from 'lucide-react';
import type { AgentRun } from '../../../types';
import { formatDateTime, formatNumber, getRunDuration, getStatusLabel } from './utils';

interface RunHistoryPanelProps { runs: AgentRun[]; selectedRunId: number | null; activeRunId?: number; onSelectRun: (run: AgentRun) => void; }

const STATUS_BADGE: Record<AgentRun['status'], string> = {
  idle:      'bg-slate-800/60 text-slate-400 border-white/5',
  running:   'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20',
  completed: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  failed:    'bg-rose-400/10 text-rose-300 border-rose-400/20',
};

export function RunHistoryPanel({ runs, selectedRunId, activeRunId, onSelectRun }: RunHistoryPanelProps) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-md font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-brand-cyan" />
            История запусков
          </h2>
          {runs.length > 0 && (
            <span className="rounded-full bg-slate-950/40 border border-white/5 px-2.5 py-0.5 text-[10px] text-slate-500">{runs.length} сессий</span>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-950/30 border border-dashed border-white/5 py-10 text-center">
            <History className="w-6 h-6 text-slate-700" />
            <p className="text-xs text-slate-600">История пустая. Запустите первый анализ.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/5">
            <div className="hidden grid-cols-[70px_1fr_100px_100px_80px_80px] gap-3 border-b border-white/[0.04] bg-black/10 px-4 py-2.5 text-[9px] uppercase tracking-[0.16em] text-slate-600 sm:grid">
              <span>ID</span><span>Дата</span><span>Статус</span><span>Токены</span><span>Время</span><span>Лотов</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {runs.map(run => {
                const sel = selectedRunId === run.id || activeRunId === run.id;
                return (
                  <button key={run.id} onClick={() => onSelectRun(run)}
                    className={`grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition sm:grid-cols-[70px_1fr_100px_100px_80px_80px] sm:gap-3 ${sel ? 'bg-brand-cyan/[0.04]' : 'hover:bg-white/[0.02]'}`}
                  >
                    <span className="font-mono text-xs font-bold text-white">#{run.id}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(run.created_at)}</span>
                    <span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[run.status] ?? STATUS_BADGE.idle}`}>
                        {getStatusLabel(run.status)}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">{formatNumber(run.total_cost_tokens)}</span>
                    <span className="text-xs text-slate-400">{getRunDuration(run.created_at, run.completed_at)}</span>
                    <span className="text-xs font-semibold text-emerald-400">{run.lots_count ?? '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
