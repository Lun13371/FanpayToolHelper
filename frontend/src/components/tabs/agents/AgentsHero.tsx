import { motion } from 'framer-motion';
import { Activity, Bot, CheckCircle2, Coins, Loader2, PlayCircle, RefreshCw, Settings2, Square, Timer } from 'lucide-react';
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
  const isRunning   = activeRun?.status === 'running';
  const isDone      = activeRun?.status === 'completed';
  const isFailed    = activeRun?.status === 'failed';

  const catsDone    = activeRun?.categories_done   ?? 0;
  const catsTotal   = activeRun?.categories_total  ?? 0;
  const catProgress = catsTotal > 0 ? Math.round((catsDone / catsTotal) * 100) : 0;

  const stats = [
    { label: 'Статус',       value: activeRun ? getStatusLabel(activeRun.status) : 'Ожидание',                          icon: Activity,      color: 'text-brand-cyan',   dot: isRunning ? 'bg-brand-cyan animate-ping' : isDone ? 'bg-emerald-400' : isFailed ? 'bg-rose-400' : 'bg-slate-600' },
    { label: 'Лотов',        value: String(generatedLots.length),                                                        icon: Bot,           color: 'text-emerald-400',  dot: '' },
    { label: 'Токены',       value: formatNumber(totalTokens),                                                           icon: Coins,         color: 'text-violet-400',   dot: '' },
    { label: 'Длительность', value: activeRun ? getRunDuration(activeRun.created_at, activeRun.completed_at) : '—',     icon: Timer,         color: 'text-amber-400',    dot: '' },
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

        {/* Top row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-cyan mb-2">
              <PlayCircle className="w-3 h-3" />
              AI Agents Workspace
            </div>
            <h1 className="text-lg font-bold text-white sm:text-xl">AI-агенты · генерация лотов</h1>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              Пайплайн из 5 агентов: поиск ниш → анализ рынка → генерация описаний и цен → экспорт в шаблоны.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <button onClick={onToggleSettings}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/40 border border-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-white/10 transition"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {showSettings ? 'Скрыть' : 'Настройки'}
            </button>

            {isRunning && (
              <button onClick={onStopAnalysis} disabled={isStopping}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
              >
                {isStopping
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Square className="w-3 h-3 fill-current" />
                }
                {isStopping ? 'Останавливаем…' : 'Остановить'}
              </button>
            )}

            {activeRun && !isRunning && (
              <button onClick={onResetSession}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/40 border border-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl bg-slate-950/40 border border-white/5 px-3 py-3">
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${s.color}`}>
                {s.dot && (
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    {s.dot.includes('animate-ping') && (
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${s.dot.replace('animate-ping', '')}`} />
                    )}
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.dot.includes('animate-ping') ? 'bg-brand-cyan' : s.dot}`} />
                  </span>
                )}
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <div className="mt-1.5 text-base font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Live run status bar */}
        {activeRun && (
          <div className={`mt-3 rounded-2xl border px-3 py-2.5 ${isRunning ? 'bg-brand-cyan/[0.06] border-brand-cyan/15' : isDone ? 'bg-emerald-400/[0.05] border-emerald-400/15' : isFailed ? 'bg-rose-400/[0.05] border-rose-400/15' : 'bg-white/[0.02] border-white/5'}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {isRunning && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cyan opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-cyan" />
                  </span>
                )}
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {isFailed && <Square className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                <span className={`text-xs font-medium ${isRunning ? 'text-brand-cyan' : isDone ? 'text-emerald-300' : isFailed ? 'text-rose-300' : 'text-slate-400'}`}>
                  Run <b>#{activeRun.id}</b> · режим <b>{activeRun.mode}</b>
                  {isRunning && catsTotal > 0 && <span className="ml-2 text-slate-400">— категорий: {catsDone}/{catsTotal}</span>}
                </span>
              </div>

              {isRunning && catsTotal > 0 && (
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <div className="flex justify-between text-[9px] uppercase tracking-[0.14em] text-slate-600">
                    <span>прогресс</span><span>{catProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-cyan via-sky-400 to-emerald-400 transition-all duration-500"
                      style={{ width: `${catProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
