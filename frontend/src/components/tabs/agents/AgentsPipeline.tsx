import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, CheckCircle2, ChevronDown, ChevronRight, Cpu, FileStack, Globe, Loader2, Share2, Sparkles, XCircle } from 'lucide-react';
import type { AgentState } from '../../../types';

const STEPS: { key: string; label: string; desc: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'CategorySelector', label: 'Selector', desc: 'Отбор топ-категорий', Icon: Globe },
  { key: 'Memory', label: 'Memory', desc: 'Семантическая память', Icon: Brain },
  { key: 'ListingAnalyzer', label: 'Analyzer', desc: 'Парсинг конкурентов', Icon: Cpu },
  { key: 'LotGenerator', label: 'Generator', desc: 'Генерация каталога', Icon: FileStack },
  { key: 'Publisher', label: 'Publisher', desc: 'Финализация лотов', Icon: Share2 },
];

interface AgentsPipelineProps {
  agentStates: Record<string, AgentState>;
}

function getStatusTone(status: AgentState['status']) {
  switch (status) {
    case 'running':
      return {
        node: 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan shadow-[0_0_18px_rgba(0,245,255,0.18)]',
        line: 'bg-brand-cyan/40',
        badge: 'bg-brand-cyan/10 border-brand-cyan/20 text-brand-cyan',
      };
    case 'completed':
      return {
        node: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
        line: 'bg-emerald-400/40',
        badge: 'bg-emerald-400/10 border-emerald-400/20 text-emerald-300',
      };
    case 'failed':
      return {
        node: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
        line: 'bg-rose-400/35',
        badge: 'bg-rose-400/10 border-rose-400/20 text-rose-300',
      };
    case 'skipped':
      return {
        node: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
        line: 'bg-amber-400/35',
        badge: 'bg-amber-400/10 border-amber-400/20 text-amber-300',
      };
    default:
      return {
        node: 'border-white/5 bg-slate-950/40 text-slate-600',
        line: 'bg-white/5',
        badge: 'bg-slate-950/40 border-white/5 text-slate-500',
      };
  }
}

function getStatusLabel(status: AgentState['status']) {
  switch (status) {
    case 'running': return 'в работе';
    case 'completed': return 'готово';
    case 'failed': return 'ошибка';
    case 'skipped': return 'пропущено';
    default: return 'ожидание';
  }
}

export function AgentsPipeline({ agentStates }: AgentsPipelineProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const groupedSubagents = useMemo(() => {
    const baseKeys = new Set(STEPS.map((step) => step.key));
    const groups: Record<string, AgentState[]> = {};

    Object.entries(agentStates).forEach(([key, state]) => {
      if (!state || baseKeys.has(key)) return;
      const parent = state.parent_agent ?? key.split(':')[0] ?? 'Other';
      if (!groups[parent]) groups[parent] = [];
      groups[parent].push({ ...state, agent_name: state.agent_name || key });
    });

    Object.values(groups).forEach((items) => {
      items.sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      });
    });

    return groups;
  }, [agentStates]);

  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative overflow-hidden">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Пайплайн агентов</p>
            <h3 className="mt-1 text-sm font-bold text-white">Основные стадии + вложенные суб-агенты</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span className="rounded-full border border-white/5 bg-slate-950/40 px-2.5 py-1">{Object.keys(agentStates).length} узлов</span>
            <span className="rounded-full border border-white/5 bg-slate-950/40 px-2.5 py-1">{Object.values(groupedSubagents).reduce((sum, items) => sum + items.length, 0)} суб-агентов</span>
          </div>
        </div>

        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STEPS.map((step, idx) => {
            const state = agentStates[step.key] ?? { agent_name: step.key, status: 'pending', tokens_used: 0 };
            const status = state.status ?? 'pending';
            const isLast = idx === STEPS.length - 1;
            const tone = getStatusTone(status);
            const subagents = groupedSubagents[step.key] ?? [];
            const progress = typeof state.progress === 'number' ? Math.max(0, Math.min(100, state.progress)) : null;
            const isOpen = expandedStep === step.key;

            return (
              <div key={step.key} className="flex min-w-[170px] flex-1 items-start">
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedStep((prev) => (prev === step.key ? null : step.key))}
                    className="group flex flex-col items-center"
                  >
                    <div className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl border transition-all duration-300 ${tone.node}`}>
                      {status === 'running' ? (
                        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      ) : status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : status === 'failed' ? (
                        <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : (
                        <step.Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <p className="text-[10px] font-semibold text-white">{step.label}</p>
                      <p className="mt-0.5 max-w-[120px] text-[9px] text-slate-500">{step.desc}</p>
                      <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${tone.badge}`}>
                        {subagents.length > 0 ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <Sparkles className="h-3 w-3" />}
                        {getStatusLabel(status)}
                      </div>
                      {state.tokens_used ? (
                        <p className="mt-1 text-[8px] text-slate-600">{state.tokens_used.toLocaleString('ru-RU')} tk</p>
                      ) : null}
                    </div>
                  </button>

                  {progress !== null && (
                    <div className="mt-3 w-full max-w-[140px]">
                      <div className="mb-1 flex items-center justify-between text-[8px] uppercase tracking-[0.14em] text-slate-600">
                        <span>progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-cyan via-sky-400 to-emerald-400" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}

                  {state.current_task && (
                    <p className="mt-2 max-w-[140px] text-center text-[8px] leading-4 text-brand-cyan/80">
                      {state.current_task}
                    </p>
                  )}

                  <AnimatePresence initial={false}>
                    {isOpen && subagents.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 w-full overflow-hidden"
                      >
                        <div className="space-y-2 rounded-2xl border border-white/[0.05] bg-black/15 p-2.5">
                          {subagents.map((subagent, subIdx) => {
                            const subTone = getStatusTone(subagent.status ?? 'pending');
                            const subProgress = typeof subagent.progress === 'number' ? Math.max(0, Math.min(100, subagent.progress)) : null;
                            return (
                              <div key={`${subagent.agent_name}-${subIdx}`} className="rounded-xl border border-white/[0.04] bg-slate-950/35 p-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[10px] font-semibold text-white">{subagent.agent_name}</div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[8px] text-slate-500">
                                      {subagent.category_context ? <span>{subagent.category_context}</span> : null}
                                      {typeof subagent.retry_count === 'number' && subagent.retry_count > 0 ? <span>retry {subagent.retry_count}</span> : null}
                                      {subagent.updated_at ? <span>{new Date(subagent.updated_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span> : null}
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] ${subTone.badge}`}>
                                    {getStatusLabel(subagent.status ?? 'pending')}
                                  </span>
                                </div>

                                {subagent.current_task && (
                                  <p className="mt-2 text-[9px] leading-4 text-slate-300">{subagent.current_task}</p>
                                )}
                                {subagent.error_message && (
                                  <p className="mt-2 text-[9px] leading-4 text-rose-300">{subagent.error_message}</p>
                                )}
                                <div className="mt-2 flex items-center justify-between text-[8px] text-slate-500">
                                  <span>{(subagent.tokens_used ?? 0).toLocaleString('ru-RU')} tk</span>
                                  {subProgress !== null ? <span>{subProgress}%</span> : null}
                                </div>
                                {subProgress !== null && (
                                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                                    <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-brand-cyan to-emerald-400" style={{ width: `${subProgress}%` }} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {!isLast && (
                  <div className={`mt-5 h-px flex-1 mx-1 sm:mx-2 transition-all duration-500 ${tone.line}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
