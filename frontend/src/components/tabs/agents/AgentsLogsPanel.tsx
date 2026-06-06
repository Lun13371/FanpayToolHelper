import { useEffect, useRef } from 'react';
import { TerminalSquare } from 'lucide-react';
import type { AgentLog } from '../../../types';

interface AgentsLogsPanelProps { logs: AgentLog[]; }

const AGENT_COLORS: Record<string, string> = {
  CategorySelector: 'text-fuchsia-400', ListingAnalyzer: 'text-brand-cyan',
  LotGenerator: 'text-amber-400', Memory: 'text-violet-400', Publisher: 'text-slate-400',
};

export function AgentsLogsPanel({ logs }: AgentsLogsPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  return (
    <div className="rounded-3xl glow-card relative overflow-hidden">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10 flex items-center justify-between border-b border-white/[0.04] bg-black/20 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <TerminalSquare className="w-3.5 h-3.5 text-brand-cyan" />
          <span className="text-xs font-semibold text-white">Логи агентов</span>
        </div>
        <span className="rounded-full bg-slate-950/40 border border-white/5 px-2.5 py-0.5 text-[10px] text-slate-500">{logs.length} строк</span>
      </div>
      <div className="relative z-10 max-h-[340px] overflow-y-auto bg-black/10 p-4 font-mono text-[11px] leading-5">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-600">
            <TerminalSquare className="w-6 h-6 opacity-30" />
            <span className="text-xs">Логи появятся после запуска анализа</span>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map(log => (
              <div key={log.id} className={`border-l-2 pl-2.5 ${log.level === 'error' ? 'border-rose-400/50' : log.level === 'warning' ? 'border-amber-400/40' : 'border-brand-cyan/20'}`}>
                <span className="text-slate-700">[{new Date(log.created_at).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}]</span>
                {' '}<span className={`font-semibold ${AGENT_COLORS[log.agent_name] ?? 'text-slate-400'}`}>{log.agent_name}</span>
                {' '}<span className={`uppercase text-[9px] tracking-widest ${log.level === 'error' ? 'text-rose-400' : log.level === 'warning' ? 'text-amber-400' : 'text-slate-600'}`}>{log.level}</span>
                <div className={`${log.level === 'error' ? 'text-rose-300' : log.level === 'warning' ? 'text-amber-300' : 'text-slate-300'}`}>{log.message}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
