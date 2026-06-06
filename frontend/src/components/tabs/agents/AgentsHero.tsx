import { motion } from 'framer-motion';
import { Activity, Bot, Coins, PlayCircle, RefreshCw, Settings2, Square, Timer } from 'lucide-react';
import type { AgentRun, GeneratedLot } from '../../../types';
import { handleMouseMove } from '../../../utils/mouseTracker';
import { formatNumber, getRunDuration, getStatusLabel } from './utils';

interface AgentsHeroProps {
  activeRun: AgentRun | null;
  generatedLots: GeneratedLot[];
  totalTokens: number;
  onToggleSettings: () => void;
  onResetSession: () => void;
  onStopAnalysis: () => void;
  isStopping: boolean;
  showSettings: boolean;
}

export function AgentsHero({ activeRun, generatedLots, totalTokens, onToggleSettings, onResetSession, onStopAnalysis, isStopping, showSettings }: AgentsHeroProps) {
  const stats = [
    { label: 'Статус',       value: activeRun ? getStatusLabel(activeRun.status) : 'Ожидание', icon: Activity, color: 'text-brand-cyan' },
    { label: 'Лотов',        value: String(generatedLots.length),                               icon: Bot,      color: 'text-emerald-400' },
    { label: 'Токены',       value: formatNumber(totalTokens),                                  icon: Coins,    color: 'text-violet-400' },
    { label: 'Длительность', value: activeRun ? getRunDuration(activeRun.created_at, activeRun.completed_at) : '—', icon: Timer, color: 'text-amber-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-5 sm:p-6 rounded-3xl glow-card relative"
      onMouseMove={handleMouseMove}
    >
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-cyan mb-2">
              <PlayCircle className="w-3 h-3" />
              AI Agents Workspace
            </div>
            <h1 className="text-lg font-bold text-white sm:text-xl">AI-агенты и генерация лотов</h1>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              Запуск агентов, отслеживание пайплайна, просмотр логов и экспорт лотов.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <button onClick={onToggleSettings}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/40 border border-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-white/10 transition"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {showSettings ? 'Скрыть' : 'Настройки'}
            </button>

            {activeRun && activeRun.status === 'running' && (
              <button onClick={onStopAnalysis} disabled={isStopping}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
              >
                <Square className="w-3 h-3 fill-current" />
                {isStopping ? 'Останавливаем…' : 'Остановить'}
              </button>
            )}

            {activeRun && activeRun.status !== 'running' && (
              <button onClick={onResetSession}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/40 border border-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Сбросить
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl bg-slate-950/40 border border-white/5 px-3 py-3">
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${s.color}`}>
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <div className="mt-1.5 text-base font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {activeRun && activeRun.status === 'running' && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-cyan/[0.06] border border-brand-cyan/15 px-3 py-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cyan opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-cyan" />
            </span>
            <span className="text-xs text-brand-cyan">Run <b>#{activeRun.id}</b> · режим <b>{activeRun.mode}</b> · в работе</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
