import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Filter, Info, TerminalSquare, X } from 'lucide-react';
import type { AgentLog } from '../../../types';

interface AgentsLogsPanelProps { logs: AgentLog[]; }

const AGENT_COLORS: Record<string, { text: string; dot: string }> = {
  CategorySelector: { text: 'text-fuchsia-400',   dot: 'bg-fuchsia-400' },
  ListingAnalyzer:  { text: 'text-brand-cyan',     dot: 'bg-brand-cyan' },
  LotGenerator:     { text: 'text-amber-400',      dot: 'bg-amber-400' },
  Memory:           { text: 'text-violet-400',     dot: 'bg-violet-400' },
  Publisher:        { text: 'text-slate-300',      dot: 'bg-slate-300' },
};
const FALLBACK_COLOR = { text: 'text-slate-400', dot: 'bg-slate-500' };

const LEVEL_STYLE: Record<string, { border: string; bg: string; icon: React.FC<{className?: string}>; labelColor: string }> = {
  error:   { border: 'border-l-rose-500/60',   bg: 'bg-rose-500/5',   icon: AlertTriangle,  labelColor: 'text-rose-400' },
  warning: { border: 'border-l-amber-400/50',  bg: 'bg-amber-400/5',  icon: AlertTriangle,  labelColor: 'text-amber-400' },
  success: { border: 'border-l-emerald-400/50',bg: 'bg-emerald-400/5',icon: CheckCircle2,   labelColor: 'text-emerald-400' },
  info:    { border: 'border-l-brand-cyan/25', bg: '',                 icon: Info,           labelColor: 'text-slate-600' },
};
const LEVEL_MSG_COLOR: Record<string, string> = {
  error: 'text-rose-200', warning: 'text-amber-200', success: 'text-emerald-200', info: 'text-slate-300',
};

export function AgentsLogsPanel({ logs }: AgentsLogsPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [showFilter, setShowFilter] = useState(false);

  const agents = useMemo(() => Array.from(new Set(logs.map(l => l.agent_name))), [logs]);

  const filtered = useMemo(() => logs.filter(l =>
    (agentFilter === 'all' || l.agent_name === agentFilter) &&
    (levelFilter === 'all' || l.level === levelFilter)
  ), [logs, agentFilter, levelFilter]);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const handleExport = () => {
    const txt = filtered.map(l =>
      `[${new Date(l.created_at).toLocaleTimeString('ru-RU')}] ${l.agent_name} ${l.level.toUpperCase()} ${l.message}`
    ).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agent-logs-${Date.now()}.txt`;
    a.click();
  };

  const errCount  = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warning').length;

  return (
    <div className="rounded-3xl glow-card relative overflow-hidden flex flex-col" style={{ minHeight: 360 }}>
      <div className="glow-bg rounded-3xl" />

      {/* ── Header bar ── */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/[0.05] bg-black/25 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* macOS traffic dots */}
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <TerminalSquare className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
          <span className="text-xs font-semibold text-white">Логи агентов</span>
          {errCount > 0 && (
            <span className="rounded-full bg-rose-400/15 border border-rose-400/25 px-2 py-0.5 text-[9px] font-bold text-rose-300">
              {errCount} ошибок
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-full bg-amber-400/15 border border-amber-400/25 px-2 py-0.5 text-[9px] font-bold text-amber-300">
              {warnCount} предупр.
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-slate-950/40 border border-white/5 px-2.5 py-0.5 text-[10px] text-slate-500">{logs.length} строк</span>

          {/* Filter toggle */}
          <button onClick={() => setShowFilter(p => !p)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-semibold transition ${showFilter ? 'bg-brand-cyan/10 border-brand-cyan/25 text-brand-cyan' : 'bg-slate-950/30 border-white/5 text-slate-400 hover:text-white'}`}
          >
            <Filter className="w-3 h-3" />
            Фильтр
          </button>

          {/* Export */}
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-950/30 border border-white/5 text-slate-500 hover:text-white transition disabled:opacity-30"
          >
            <Download className="w-3 h-3" />
          </button>

          {/* Auto-scroll indicator */}
          <button onClick={() => setAutoScroll(p => !p)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] transition ${autoScroll ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-300' : 'bg-slate-950/30 border-white/5 text-slate-500 hover:text-white'}`}
          >
            <ChevronDown className="w-3 h-3" />
            {autoScroll ? 'Live' : 'Пауза'}
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      {showFilter && (
        <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-white/[0.04] bg-black/15 px-4 py-2.5 shrink-0">
          <span className="text-[9px] uppercase tracking-widest text-slate-600">Агент:</span>
          {['all', ...agents].map(a => (
            <button key={a} onClick={() => setAgentFilter(a)}
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold transition ${agentFilter === a ? 'bg-brand-cyan/10 border-brand-cyan/25 text-brand-cyan' : 'border-white/5 text-slate-500 hover:text-white'}`}
            >
              {a === 'all' ? 'Все' : a}
            </button>
          ))}
          <span className="ml-2 text-[9px] uppercase tracking-widest text-slate-600">Уровень:</span>
          {['all', 'info', 'success', 'warning', 'error'].map(lv => (
            <button key={lv} onClick={() => setLevelFilter(lv)}
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold transition ${levelFilter === lv ? 'bg-brand-cyan/10 border-brand-cyan/25 text-brand-cyan' : 'border-white/5 text-slate-500 hover:text-white'}`}
            >
              {lv === 'all' ? 'Все' : lv}
            </button>
          ))}
          <button onClick={() => { setAgentFilter('all'); setLevelFilter('all'); }}
            className="ml-auto flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-300 transition"
          >
            <X className="w-3 h-3" /> Сбросить
          </button>
        </div>
      )}

      {/* ── Log body ── */}
      <div
        className="relative z-10 flex-1 overflow-y-auto bg-black/10 p-3 font-mono text-[11px] leading-[1.6]"
        style={{ maxHeight: 380 }}
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-slate-600">
            <TerminalSquare className="w-7 h-7 opacity-20" />
            <span className="text-xs">
              {logs.length === 0 ? 'Логи появятся после запуска анализа' : 'Нет строк по фильтру'}
            </span>
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map(log => {
              const ls   = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info;
              const ac   = AGENT_COLORS[log.agent_name] ?? FALLBACK_COLOR;
              const mc   = LEVEL_MSG_COLOR[log.level] ?? 'text-slate-300';
              const Icon = ls.icon;
              const time = new Date(log.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={log.id} className={`flex items-start gap-2 rounded-lg border-l-2 px-2 py-1.5 ${ls.border} ${ls.bg}`}>
                  <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${ls.labelColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] text-slate-700 tabular-nums">{time}</span>
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${ac.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ac.dot} opacity-70`} />
                        {log.agent_name}
                      </span>
                      {log.category_context && (
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-slate-600">
                          {log.category_context}
                        </span>
                      )}
                    </div>
                    <div className={`mt-0.5 break-words text-[11px] leading-5 ${mc}`}>{log.message}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
