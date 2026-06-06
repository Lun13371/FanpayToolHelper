import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bot, Coins, Cpu, Database, Gauge, Map, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { AgentLog, AgentRun, AgentState, GeneratedLot } from '../../../types';
import { handleMouseMove } from '../../../utils/mouseTracker';

type SpaceAgentKey = 'CategorySelector' | 'Memory' | 'ListingAnalyzer' | 'LotGenerator' | 'Publisher';

interface AgentsSpaceProps {
  activeRun: AgentRun | null;
  agentStates: Record<string, AgentState>;
  logs: AgentLog[];
  generatedLots: GeneratedLot[];
}

interface SpaceAgent {
  key: SpaceAgentKey;
  name: string;
  short: string;
  colorA: string; colorB: string; colorC: string;
  glowColor: string;
  x: number; y: number;
  description: string;
  details: string;
  metricsLabel: string;
  logNames: string[];
  fallbackTask: string;
}

const CANVAS_W = 1800;
const CANVAS_H = 1100;

const AGENTS: SpaceAgent[] = [
  {
    key: 'CategorySelector', name: 'Selector', short: 'SC',
    colorA: '#22d3ee', colorB: '#0ea5e9', colorC: '#3b82f6', glowColor: 'rgba(34,211,238,0.35)',
    x: 280, y: 260,
    description: 'Сканирует категории и находит перспективные ниши.',
    details: 'Анализирует доступные категории на FunPay, выявляет ниши с высоким спросом и формирует очередь задач для остальных агентов.',
    metricsLabel: 'Категорий в работе', logNames: ['CategorySelector', 'Selector'],
    fallbackTask: 'Подбирает категории для анализа',
  },
  {
    key: 'Memory', name: 'Memory', short: 'MM',
    colorA: '#e879f9', colorB: '#a855f7', colorC: '#6366f1', glowColor: 'rgba(168,85,247,0.35)',
    x: 720, y: 160,
    description: 'Хранит контекст из прошлых запусков.',
    details: 'Семантическая память пайплайна: хранит паттерны, удачные формулировки и рыночные сигналы из предыдущих запусков.',
    metricsLabel: 'Инсайтов в памяти', logNames: ['Memory', 'MemoryAgent'],
    fallbackTask: 'Сопоставляет данные с паттернами',
  },
  {
    key: 'ListingAnalyzer', name: 'Analyzer', short: 'AN',
    colorA: '#34d399', colorB: '#14b8a6', colorC: '#06b6d4', glowColor: 'rgba(52,211,153,0.35)',
    x: 1180, y: 290,
    description: 'Разбирает рынок, конкурентов и паттерны.',
    details: 'Парсит карточки конкурентов, структуру описаний, ценовые диапазоны и формирует практические ориентиры для генератора.',
    metricsLabel: 'Листингов проверено', logNames: ['ListingAnalyzer', 'Analyzer'],
    fallbackTask: 'Анализирует листинги',
  },
  {
    key: 'LotGenerator', name: 'Generator', short: 'LG',
    colorA: '#fbbf24', colorB: '#f97316', colorC: '#f43f5e', glowColor: 'rgba(251,146,60,0.38)',
    x: 960, y: 720,
    description: 'Генерирует title, description и цены.',
    details: 'Создаёт готовые карточки: заголовки, описания, ценовую стратегию и ai_reasoning для каждой найденной ниши.',
    metricsLabel: 'Лотов сгенерировано', logNames: ['LotGenerator', 'Generator'],
    fallbackTask: 'Собирает офферы под спрос',
  },
  {
    key: 'Publisher', name: 'Publisher', short: 'PB',
    colorA: '#94a3b8', colorB: '#64748b', colorC: '#475569', glowColor: 'rgba(148,163,184,0.28)',
    x: 1460, y: 640,
    description: 'Готовит результаты к экспорту.',
    details: 'Финальный этап: валидирует лоты, формирует шаблоны и записывает результаты для ручной проверки.',
    metricsLabel: 'Готово к экспорту', logNames: ['Publisher', 'Exporter', 'LotsNode'],
    fallbackTask: 'Готовит к сохранению',
  },
];

const SVG_LINKS = [
  { x1: 280, y1: 260, x2: 720, y2: 160 },
  { x1: 720, y1: 160, x2: 1180, y2: 290 },
  { x1: 1180, y1: 290, x2: 960, y2: 720 },
  { x1: 960, y1: 720, x2: 1460, y2: 640 },
  { x1: 280, y1: 260, x2: 960, y2: 720 },
];

const STATUS_CFG: Record<AgentState['status'], { label: string; color: string; badge: string }> = {
  pending:   { label: 'Ожидание', color: '#64748b', badge: 'bg-slate-800/60 text-slate-400 border-white/5' },
  running:   { label: 'Работает', color: '#22d3ee', badge: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20' },
  completed: { label: 'Готов',    color: '#34d399', badge: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20' },
  failed:    { label: 'Ошибка',   color: '#fb7185', badge: 'bg-rose-400/10 text-rose-300 border-rose-400/20' },
  skipped:   { label: 'Пропуск',  color: '#f59e0b', badge: 'bg-amber-400/10 text-amber-300 border-amber-400/20' },
};

function normStatus(s?: AgentState): AgentState['status'] { return s?.status ?? 'pending'; }
function filterLogs(logs: AgentLog[], names: string[]) {
  return logs.filter(l => names.some(n => (l.agent_name ?? '').toLowerCase().includes(n.toLowerCase())));
}

export function AgentsUniverse({ activeRun, agentStates, logs, generatedLots }: AgentsSpaceProps) {
  const [selectedKey, setSelectedKey] = useState<SpaceAgentKey | null>(null);
  const [showMap, setShowMap] = useState(true);

  /* ── Pan / Zoom (DOM-direct, no re-render) ── */
  const viewRef  = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tx = useRef(0);
  const ty = useRef(0);
  const sc = useRef(0.52);
  const dragging = useRef(false);
  const lastXY   = useRef({ x: 0, y: 0 });
  const pinchD   = useRef<number | null>(null);
  const didMove  = useRef(false);

  const applyT = useCallback(() => {
    if (innerRef.current) {
      innerRef.current.style.transform = `translate(${tx.current}px,${ty.current}px) scale(${sc.current})`;
    }
  }, []);

  const clamp = (v: number) => Math.min(3, Math.max(0.18, v));

  /* Centre on mount + non-passive wheel */
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    tx.current = (width  - CANVAS_W * sc.current) / 2;
    ty.current = (height - CANVAS_H * sc.current) / 2;
    applyT();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = sc.current;
      const next = clamp(prev * (e.deltaY < 0 ? 1.12 : 0.9));
      const r = next / prev;
      tx.current = mx - r * (mx - tx.current);
      ty.current = my - r * (my - ty.current);
      sc.current = next;
      applyT();
    };

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragging.current = true;
        didMove.current = false;
        lastXY.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        dragging.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchD.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      e.preventDefault(); // теперь работает — non-passive
      if (e.touches.length === 1 && dragging.current) {
        const dx = e.touches[0].clientX - lastXY.current.x;
        const dy = e.touches[0].clientY - lastXY.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove.current = true;
        tx.current += dx;
        ty.current += dy;
        lastXY.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        applyT();
      } else if (e.touches.length === 2 && pinchD.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const rect = el.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const next = clamp(sc.current * (d / pinchD.current));
        const r = next / sc.current;
        tx.current = cx - r * (cx - tx.current);
        ty.current = cy - r * (cy - ty.current);
        sc.current = next;
        pinchD.current = d;
        applyT();
      }
    };

    const onTouchEndNative = () => {
      dragging.current = false;
      pinchD.current = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStartNative, { passive: false });
    el.addEventListener('touchmove', onTouchMoveNative, { passive: false });
    el.addEventListener('touchend', onTouchEndNative);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStartNative);
      el.removeEventListener('touchmove', onTouchMoveNative);
      el.removeEventListener('touchend', onTouchEndNative);
    };
  }, [applyT]);

  const onMD = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    didMove.current = false;
    lastXY.current = { x: e.clientX, y: e.clientY };
    if (viewRef.current) viewRef.current.style.cursor = 'grabbing';
  }, []);

  const onMM = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastXY.current.x;
    const dy = e.clientY - lastXY.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove.current = true;
    tx.current += dx; ty.current += dy;
    lastXY.current = { x: e.clientX, y: e.clientY };
    applyT();
  }, [applyT]);

  const onMU = useCallback(() => {
    dragging.current = false;
    if (viewRef.current) viewRef.current.style.cursor = 'grab';
  }, []);

  const onTS = useCallback((_e: React.TouchEvent) => { /* handled natively */ }, []);
  const onTM = useCallback((_e: React.TouchEvent) => { /* handled natively */ }, []);
  const onTE = useCallback(() => { /* handled natively */ }, []);

  const zoomBtn = useCallback((factor: number) => {
    const el = viewRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const next = clamp(sc.current * factor);
    const r = next / sc.current;
    tx.current = width / 2 - r * (width / 2 - tx.current);
    ty.current = height / 2 - r * (height / 2 - ty.current);
    sc.current = next; applyT();
  }, [applyT]);

  const resetView = useCallback(() => {
    const el = viewRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    sc.current = 0.52;
    tx.current = (width  - CANVAS_W * sc.current) / 2;
    ty.current = (height - CANVAS_H * sc.current) / 2;
    applyT();
  }, [applyT]);

  /* Decorated agents */
  const decorated = useMemo(() => AGENTS.map((ag, idx) => {
    const state = agentStates[ag.key] ?? agentStates[ag.name] ?? { status: 'pending' as const, tokens_used: 0 };
    const relLogs = filterLogs(logs, ag.logNames);
    const lastLog = relLogs.length > 0 ? relLogs[relLogs.length - 1] : undefined;
    const metric  = (ag.key === 'LotGenerator' || ag.key === 'Publisher') ? generatedLots.length : relLogs.length;
    return { ...ag, idx, state, relLogs, lastLog, metric, currentTask: state.current_task ?? lastLog?.message ?? ag.fallbackTask };
  }), [agentStates, logs, generatedLots]);

  const selected   = decorated.find(a => a.key === selectedKey) ?? null;
  const liveCount  = decorated.filter(a => normStatus(a.state) === 'running').length;
  const doneCount  = decorated.filter(a => normStatus(a.state) === 'completed').length;
  const totalTok   = decorated.reduce((s, a) => s + (a.state.tokens_used ?? 0), 0);

  const mapS = 156 / CANVAS_W;
  const mapH = Math.round(CANVAS_H * mapS);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="p-5 sm:p-6 rounded-3xl glow-card relative"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />

        {/* Header — тот же стиль что в AIKeysTab */}
        <div className="relative z-10 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-md font-bold text-white flex items-center gap-2">
            <span className="text-brand-cyan">◈</span>
            Пространство агентов
          </h2>
          {/* Stats row */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Activity, label: 'Live',    val: liveCount,                       color: 'text-brand-cyan' },
              { icon: Bot,      label: 'Агентов', val: decorated.length,                 color: 'text-slate-400' },
              { icon: Gauge,    label: 'Готово',  val: doneCount,                        color: 'text-emerald-400' },
              { icon: Coins,    label: 'Tokens',  val: totalTok.toLocaleString('ru-RU'), color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5 rounded-xl bg-slate-950/40 border border-white/5 px-3 py-1.5">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-[10px] text-slate-400">{s.label}</span>
                <span className="text-[11px] font-bold text-white">{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas container */}
        <div className="relative z-10 overflow-hidden rounded-2xl border border-white/5" style={{ height: 460 }}>

          {/* Controls */}
          <div className="absolute left-2.5 bottom-2.5 z-20 flex flex-col gap-1.5">
            {([
              { icon: ZoomIn,    fn: () => zoomBtn(1.2),  title: '+' },
              { icon: ZoomOut,   fn: () => zoomBtn(0.83), title: '−' },
              { icon: RotateCcw, fn: resetView,           title: '↺' },
            ] as const).map(btn => (
              <button key={btn.title} onClick={btn.fn}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-950/70 border border-white/8 text-slate-400 hover:text-white hover:border-white/15 transition backdrop-blur-sm"
              >
                <btn.icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <button
              onClick={() => setShowMap(p => !p)}
              className={`w-7 h-7 flex items-center justify-center rounded-lg border transition backdrop-blur-sm ${showMap ? 'bg-brand-cyan/15 border-brand-cyan/25 text-brand-cyan' : 'bg-slate-950/70 border-white/8 text-slate-400 hover:text-white'}`}
            >
              <Map className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Minimap */}
          <AnimatePresence>
            {showMap && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}
                className="absolute bottom-2.5 right-2.5 z-20 overflow-hidden rounded-xl bg-slate-950/80 border border-white/8 backdrop-blur-sm"
                style={{ width: 156, height: mapH }}
              >
                <svg width={156} height={mapH} className="absolute inset-0">
                  {SVG_LINKS.map((l, i) => (
                    <line key={i} x1={l.x1*mapS} y1={l.y1*mapS} x2={l.x2*mapS} y2={l.y2*mapS}
                      stroke="rgba(99,102,241,0.3)" strokeWidth="1" strokeDasharray="3 3" />
                  ))}
                  {decorated.map(ag => {
                    const cols: Record<AgentState['status'], string> = { pending:'#475569', running:'#22d3ee', completed:'#34d399', failed:'#fb7185', skipped:'#f59e0b' };
                    return <circle key={ag.key} cx={ag.x*mapS} cy={ag.y*mapS} r={4} fill={cols[normStatus(ag.state)]} opacity={0.9} />;
                  })}
                </svg>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Viewport */}
          <div
            ref={viewRef}
            className="agents-space"
            onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
            onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
          >
            {/* Dot grid */}
            <div className="agents-space__grid" />

            {/* Ambient glows */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 1 }}>
              <div style={{ position:'absolute', top:'8%', left:'8%', width:360, height:240, background:'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)', filter:'blur(70px)', animation:'agents-glow-pulse 8s ease-in-out infinite' }} />
              <div style={{ position:'absolute', bottom:'10%', right:'8%', width:300, height:220, background:'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', filter:'blur(70px)', animation:'agents-glow-pulse 10s ease-in-out infinite 2s' }} />
            </div>

            {/* Canvas inner */}
            <div
              ref={innerRef}
              style={{ position:'absolute', width:CANVAS_W, height:CANVAS_H, transformOrigin:'0 0', willChange:'transform', zIndex:2 }}
            >
              {/* SVG links */}
              <svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={CANVAS_H}>
                <defs>
                  <linearGradient id="ag-link" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%"   stopColor="rgba(34,211,238,0.05)" />
                    <stop offset="50%"  stopColor="rgba(99,102,241,0.4)" />
                    <stop offset="100%" stopColor="rgba(244,114,182,0.05)" />
                  </linearGradient>
                </defs>
                {SVG_LINKS.map((l, i) => (
                  <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                    stroke="url(#ag-link)" strokeWidth="2" strokeDasharray="12 14" opacity="0.65" />
                ))}
              </svg>

              {/* Agents */}
              {decorated.map((ag, idx) => {
                const status = normStatus(ag.state);
                const sm = STATUS_CFG[status];
                const isRunning = status === 'running';

                return (
                  <button
                    key={ag.key}
                    type="button"
                    className="orb-btn group"
                    style={{
                      left: ag.x, top: ag.y,
                      animation: `ag-float ${4.2 + idx * 0.35}s ease-in-out infinite`,
                      animationDelay: `${idx * 0.28}s`,
                    }}
                    onClick={(e) => { e.stopPropagation(); if (!didMove.current) setSelectedKey(ag.key); }}
                  >
                    <div className="orb-wrap" style={{ filter: `drop-shadow(0 0 18px ${ag.glowColor})` }}>
                      {/* Gradient shell */}
                      <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0" style={{ pointerEvents:'none' }}>
                        <defs>
                          <linearGradient id={`og-${ag.key}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%"   stopColor={ag.colorA} />
                            <stop offset="55%"  stopColor={ag.colorB} />
                            <stop offset="100%" stopColor={ag.colorC} />
                          </linearGradient>
                        </defs>
                        <circle cx="40" cy="40" r="39" fill={`url(#og-${ag.key})`} />
                      </svg>
                      {/* Pulse ring */}
                      {isRunning && <div className="orb-ping" />}
                      {/* Glass core */}
                      <div className="orb-core">
                        <span className="text-xs font-bold tracking-[0.2em] text-white">{ag.short}</span>
                      </div>
                    </div>

                    {/* Label */}
                    <div className="mt-2 text-center" style={{ pointerEvents:'none' }}>
                      <div className="text-[12px] font-semibold text-white drop-shadow">{ag.name}</div>
                      <div className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] ${sm.badge}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.color }} />
                        {sm.label}
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div className="orb-tooltip">
                      <div className="text-xs font-semibold text-white mb-1">{ag.name}</div>
                      <div className="text-[11px] leading-4 text-slate-400">{ag.description}</div>
                      <div className="mt-2 text-[10px] text-slate-600">Нажмите для деталей →</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer stats */}
        <div className="relative z-10 mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { icon: Cpu,      label: 'Запуск',  val: activeRun ? `Run #${activeRun.id} · ${activeRun.status}` : 'Нет активного' },
            { icon: Database, label: 'События', val: `${logs.length} событий` },
            { icon: Gauge,    label: 'Лоты',    val: `${generatedLots.length} готово к экспорту` },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 rounded-xl bg-slate-950/30 border border-white/5 px-3 py-2">
              <s.icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wide shrink-0">{s.label}:</span>
              <span className="text-[11px] text-slate-300 truncate">{s.val}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="agent-modal-overlay"
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSelectedKey(null)}
          >
            <motion.div
              key="agent-modal-content"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-2xl overflow-hidden rounded-3xl glow-card"
              style={{ maxHeight: '86vh' }}
              onMouseMove={handleMouseMove}
            >
              <div className="glow-bg rounded-3xl" />
              <div className="relative z-10 overflow-y-auto" style={{ maxHeight: '86vh' }}>

                {/* Modal header */}
                <div className="flex items-start justify-between gap-4 p-5 pb-4 border-b border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    {/* Mini orb */}
                    <div className="relative w-12 h-12 shrink-0 rounded-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${selected.colorA}, ${selected.colorB}, ${selected.colorC})`, boxShadow: `0 0 20px ${selected.glowColor}` }}
                    >
                      <div className="absolute inset-[7px] rounded-full" style={{ background:'rgba(5,7,12,0.62)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.08)' }} />
                      <span className="relative z-10 text-[11px] font-bold tracking-[0.2em] text-white">{selected.short}</span>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Agent profile</div>
                      <h3 className="text-base font-bold text-white mt-0.5">{selected.name}</h3>
                    </div>
                  </div>
                  <button onClick={() => setSelectedKey(null)}
                    className="p-1.5 rounded-xl bg-slate-950/40 border border-white/5 text-slate-400 hover:text-white transition shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Description */}
                  <p className="text-xs leading-5 text-slate-400">{selected.details}</p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Статус',  val: STATUS_CFG[normStatus(selected.state)].label, dotColor: STATUS_CFG[normStatus(selected.state)].color },
                      { label: 'Токены',  val: (selected.state.tokens_used ?? 0).toLocaleString('ru-RU'), dotColor: null },
                      { label: selected.metricsLabel, val: String(selected.metric), dotColor: null },
                    ].map(s => (
                      <div key={s.label} className="rounded-2xl bg-slate-950/40 border border-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{s.label}</div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-lg font-bold text-white">
                          {s.dotColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dotColor }} />}
                          {s.val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tasks */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      {[
                        { label: 'Текущая задача', text: selected.currentTask },
                        { label: 'Последнее событие', text: selected.lastLog?.message ?? 'Агент в режиме ожидания.' },
                      ].map(item => (
                        <div key={item.label} className="rounded-2xl bg-slate-950/40 border border-white/5 p-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1.5">{item.label}</div>
                          <div className="text-xs leading-5 text-slate-300">{item.text}</div>
                        </div>
                      ))}
                    </div>

                    {/* Log feed */}
                    <div className="rounded-2xl bg-slate-950/40 border border-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">Лента событий</div>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {selected.relLogs.length > 0
                          ? selected.relLogs.slice(-7).reverse().map(log => (
                            <div key={log.id} className="rounded-xl bg-black/20 border border-white/[0.04] p-2.5">
                              <div className="flex justify-between text-[9px] uppercase tracking-[0.12em] mb-1">
                                <span style={{ color: log.level === 'error' ? '#fb7185' : log.level === 'warning' ? '#fbbf24' : '#475569' }}>{log.level}</span>
                                <span className="text-slate-600">{new Date(log.created_at).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
                              </div>
                              <div className="text-[11px] leading-4 text-slate-300">{log.message}</div>
                            </div>
                          ))
                          : <div className="text-xs text-slate-500 py-2">Событий ещё нет.</div>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
