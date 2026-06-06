import { Brain, CheckCircle2, Cpu, FileStack, Globe, Loader2, Share2, XCircle } from 'lucide-react';
import type { AgentState } from '../../../types';

const STEPS: { key: string; label: string; desc: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'CategorySelector', label: 'Selecto',  desc: 'Отбор топ-категорий', Icon: Globe     },
  { key: 'Memory',           label: 'Memory',   desc: 'Семантическая память', Icon: Brain     },
  { key: 'ListingAnalyzer',  label: 'Analyzer', desc: 'Парсинг конкурентов',  Icon: Cpu       },
  { key: 'LotGenerator',     label: 'Generator',desc: 'Генерация каталога',   Icon: FileStack },
  { key: 'Publisher',        label: 'Publisher',desc: 'Финализация лотов',    Icon: Share2    },
];

interface AgentsPipelineProps { agentStates: Record<string, AgentState>; }

export function AgentsPipeline({ agentStates }: AgentsPipelineProps) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl glow-card relative overflow-hidden">
      <div className="glow-bg rounded-3xl" />
      <div className="relative z-10">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Пайплайн агентов</p>
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => {
            const state = agentStates[step.key];
            const status = state?.status ?? 'pending';
            const isLast = idx === STEPS.length - 1;

            const nodeStyle =
              status === 'running'   ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan shadow-[0_0_12px_rgba(0,245,255,0.15)]' :
              status === 'completed' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' :
              status === 'failed'    ? 'border-rose-400/30 bg-rose-400/10 text-rose-300' :
                                       'border-white/5 bg-slate-950/40 text-slate-600';

            const lineStyle =
              status === 'completed' ? 'bg-emerald-400/40' :
              status === 'running'   ? 'bg-brand-cyan/40'  :
                                       'bg-white/5';

            return (
              <div key={step.key} className="flex flex-1 items-center">
                {/* Node */}
                <div className="flex flex-col items-center min-w-0 flex-shrink-0">
                  <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl border transition-all duration-300 ${nodeStyle}`}>
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
                  <div className="mt-1.5 text-center">
                    <p className="text-[9px] font-semibold text-white hidden sm:block">{step.label}</p>
                    <p className="text-[8px] text-slate-600 hidden sm:block max-w-[80px] truncate">{step.desc}</p>
                    {status === 'running' && state?.current_task && (
                      <p className="text-[7px] text-brand-cyan max-w-[80px] truncate hidden lg:block mt-0.5">
                        {state.current_task}
                      </p>
                    )}
                    {state?.tokens_used ? (
                      <p className="text-[7px] text-slate-700 hidden sm:block">{state.tokens_used.toLocaleString()} tk</p>
                    ) : null}
                  </div>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div className={`flex-1 h-px mx-1 sm:mx-2 transition-all duration-500 ${lineStyle}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
