import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock, History, Layers, Loader2, TrendingUp } from 'lucide-react';
import type { AgentRun } from '../../../types';
import { formatDateTime, formatNumber, getRunDuration, getStatusLabel } from './utils';

interface RunHistoryPanelProps {
  runs: AgentRun[];
  selectedRunId: number | null;
  activeRunId?: number;
  onSelectRun: (run: AgentRun) => void;
}

const STATUS_BADGE: Record<AgentRun['status'], string> = {
  idle:      'bg-slate-800/60 text-slate-400 border-white/5',
  running:   'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20',
  completed: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  failed:    'bg-rose-400/10 text-rose-300 border-rose-400/20',
};

const STATUS_ICON: Record<AgentRun['status'], React.FC<{className?: string}>> = {
  idle:      Clock,
  running:   Loader2,
  completed: CheckCircle2,
  failed:    Clock,
};

import React from 'react';

export function RunHistoryPanel({ runs, selectedRunId, activeRunId, onSelectRun }: RunHistoryPanelProps) {
  const best = runs.reduce<AgentRun | null>((prev, r) => {
    if (r.status !== 'completed') return prev;
    if (!prev || (r.lots_count ?? 0) > (prev.lots_count ?? 0)) return r;
    return prev;
  }, null);

  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-md font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-brand-cyan" />
            История запусков
          </h2>
          <div className="flex items-center gap-2">
            {runs.length > 0 && (
              <span className="rounded-full bg-slate-950/40 border border-white/5 px-2.5 py-0.5 text-[10px] text-slate-500">
                {runs.length} сессий
              </span>
            )}
          </div>
        </div>

        {/* Summary stats */}
        {runs.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              { label: 'Запусков',   val: runs.length,                                                          color: 'text-slate-300', icon: Layers },
              { label: 'Завершено',  val: runs.filter(r => r.status === 'completed').length,                    color: 'text-emerald-400', icon: CheckCircle2 },
              { label: 'Лучший рез',  val: best ? String(best.lots_count ?? 0) + ' лотов' : '—',              color: 'text-amber-400', icon: TrendingUp },
            ].map(s => (
              <div key={s.label} className="rounded-2xl bg-slate-950/30 border border-white/5 px-3 py-2.5">
                <div className={`flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] ${s.color}`}>
                  <s.icon className="w-3 h-3" /> {s.label}
                </div>
                <div className="mt-1.5 text-sm font-bold text-white">{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-950/30 border border-dashed border-white/5 py-10 text-center">
            <History className="w-6 h-6 text-slate-700" />
            <p className="text-xs text-slate-600">История пустая. Запустите первый анализ.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/5">
            {/* Table header */}
            <div className="hidden grid-cols-[64px_1fr_100px_90px_72px_72px] gap-2 border-b border-white/[0.04] bg-black/10 px-4 py-2 text-[9px] uppercase tracking-[0.16em] text-slate-600 sm:grid">
              <span>ID</span>
              <span>Дата</span>
              <span>Статус</span>
              <span>Токены</span>
              <span>Время</span>
              <span>Лотов</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {runs.map(run => {
                const sel   = selectedRunId === run.id || activeRunId === run.id;
                const Icon  = STATUS_ICON[run.status] ?? Clock;
                const isBest = best?.id === run.id;
                return (
                  <button key={run.id} onClick={() => onSelectRun(run)}
                    className={`grid w-full grid-cols-1 gap-1 px-4 py-3 text-left transition sm:grid-cols-[64px_1fr_100px_90px_72px_72px] sm:gap-2 ${sel ? 'bg-brand-cyan/[0.05] border-l-2 border-l-brand-cyan/40' : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'}`}
                  >
                    <span className="font-mono text-xs font-bold text-white flex items-center gap-1">
                      #{run.id}
                      {isBest && <span className="rounded-full bg-amber-400/15 border border-amber-400/20 px-1 text-[7px] font-bold text-amber-300">BEST</span>}
                    </span>
                    <span className="text-xs text-slate-400">{formatDateTime(run.created_at)}</span>
                    <span>
                      <AnimatePresence mode="wait">
                        <motion.span key={run.status} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[run.status] ?? STATUS_BADGE.idle}`}
                        >
                          <Icon className={`w-2.5 h-2.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                          {getStatusLabel(run.status)}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">{formatNumber(run.total_cost_tokens)}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{getRunDuration(run.created_at, run.completed_at)}</span>
                    <span className={`text-xs font-bold tabular-nums ${(run.lots_count ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {run.lots_count ?? '—'}
                    </span>
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
