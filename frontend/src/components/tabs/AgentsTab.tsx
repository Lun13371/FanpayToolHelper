import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppContext, API_URL } from '../../context/AppContext';
import type { AgentCardTab, LaunchMode } from './agents/types';
import type { AgentLog, AgentRun, AgentState, GeneratedLot } from '../../types';
import { INITIAL_AGENT_STATES } from './agents/constants';
import { AgentsHero } from './agents/AgentsHero';
import { LaunchSettingsPanel } from './agents/LaunchSettingsPanel';
import { AgentsPipeline } from './agents/AgentsPipeline';
import { AgentsLogsPanel } from './agents/AgentsLogsPanel';
import { AgentsUniverse } from './agents/AgentsUniverse';
import { MemoryInsightsPanel } from './agents/MemoryInsightsPanel';
import { RunHistoryPanel } from './agents/RunHistoryPanel';
import { GeneratedLotsPanel } from './agents/GeneratedLotsPanel';
import { ToastStack } from './agents/ToastStack';

export interface RealInsight {
  id: number;
  run_id: number;
  game_name: string;
  subcategory_name: string;
  insight_type: string;
  content: string;
  created_at: string;
}

export interface LotsFilter {
  game_name: string;
  sort_by: 'game_name' | 'price' | 'amount' | 'revenue';
  sort_dir: 'asc' | 'desc';
}

export default function AgentsTab() {
  const { token, accounts } = useAppContext();

  const [mode, setMode] = useState<LaunchMode>('auto');
  const [limit, setLimit] = useState<number>(5);
  const [tavilyKey, setTavilyKey] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<number | null>(null);
  const [manualNodeIds, setManualNodeIds] = useState<string[]>([]);

  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>(INITIAL_AGENT_STATES);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [generatedLots, setGeneratedLots] = useState<GeneratedLot[]>([]);
  const [pastRuns, setPastRuns] = useState<AgentRun[]>([]);
  const [realInsights, setRealInsights] = useState<RealInsight[]>([]);

  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(true);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [selectedPastRunId, setSelectedPastRunId] = useState<number | null>(null);
  const [expandedLotId, setExpandedLotId] = useState<number | null>(null);
  const [activeLotCardTabs, setActiveLotCardTabs] = useState<Record<number, AgentCardTab>>({});
  const [exportingId, setExportingId] = useState<number | null>(null);

  const [lotsFilter, setLotsFilter] = useState<LotsFilter>({ game_name: '', sort_by: 'game_name', sort_dir: 'asc' });

  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetchActiveRun();
    fetchPastRuns();
    fetchInsights();

    if (accounts.length > 0 && targetAccountId == null) {
      setTargetAccountId(accounts[0].id);
    }

    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [accounts]);

  const fetchActiveRun = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.active && data.run) {
        setActiveRun(data.run);
        if (data.agent_states) setAgentStates((prev) => ({ ...prev, ...data.agent_states }));
        connectSSE(data.run.id);
      }
    } catch (err) {
      console.error('Ошибка получения активной сессии:', err);
    }
  };

  const fetchPastRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPastRuns(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchInsights = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/insights?limit=40`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRealInsights(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchLotsForRun = async (runId: number, filter?: LotsFilter) => {
    try {
      const f = filter ?? lotsFilter;
      const params = new URLSearchParams();
      if (f.game_name) params.set('game_name', f.game_name);
      params.set('sort_by', f.sort_by);
      params.set('sort_dir', f.sort_dir);
      const res = await fetch(`${API_URL}/api/v1/agents/runs/${runId}/lots?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setGeneratedLots(await res.json());
    } catch (err) { console.error(err); }
  };

  const connectSSE = (runId: number) => {
    if (sseRef.current) sseRef.current.close();
    const url = `${API_URL}/api/v1/agents/runs/${runId}/stream?token=${token}`;
    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs((prev) => (prev.some((item) => item.id === data.id) ? prev : [...prev, data]));
        } else if (data.type === 'state') {
          if (data.agent_states) setAgentStates((prev) => ({ ...prev, ...data.agent_states }));
          setActiveRun((prev) => {
            if (!prev) return null;
            return { ...prev, status: data.run_status, total_cost_tokens: data.total_cost_tokens };
          });
        } else if (data.type === 'done') {
          sse.close();
          fetchLotsForRun(runId);
          fetchPastRuns();
          fetchInsights();
          showToast(`Анализ завершён. Создано ${data.lots_count ?? 0} лотов.`);
        } else if (data.type === 'error') {
          sse.close();
          showError(data.message || 'Произошла ошибка сессии.');
        }
      } catch (err) { console.error('Ошибка парсинга SSE:', err); }
    };

    sse.onerror = (err) => { console.error('SSE сбой:', err); };
  };

  const handleStartAnalysis = async () => {
    setIsStarting(true);
    setLogs([]);
    setGeneratedLots([]);
    setExpandedLotId(null);
    setAgentStates(INITIAL_AGENT_STATES);

    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode,
          limit_categories: limit,
          tavily_api_key: tavilyKey || undefined,
          target_account_id: targetAccountId,
          manual_node_ids: mode === 'manual' && manualNodeIds.length > 0 ? manualNodeIds : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRun(data);
        setShowSettings(false);
        setSelectedPastRunId(data.id);
        connectSSE(data.id);
        showToast('Анализ запущен.');
      } else {
        const errData = await res.json();
        showError(errData.detail || 'Не удалось запустить агентов.');
      }
    } catch { showError('Сбой соединения при запуске.'); }
    finally { setIsStarting(false); }
  };

  const handleStopAnalysis = async () => {
    if (!activeRun) return;
    setIsStopping(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs/${activeRun.id}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (sseRef.current) sseRef.current.close();
        handleResetSession();
        showToast('Анализ остановлен.');
        fetchPastRuns();
      } else {
        const err = await res.json();
        showError(err.detail || 'Ошибка при остановке.');
      }
    } catch { showError('Сбой при остановке.'); }
    finally { setIsStopping(false); }
  };

  const handleExportLot = async (lotId: number) => {
    setExportingId(lotId);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/lots/${lotId}/export-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Лот экспортирован.');
      } else {
        const err = await res.json();
        showError(err.detail || 'Ошибка экспорта.');
      }
    } catch { showError('Сбой сети при экспорте.'); }
    finally { setExportingId(null); }
  };

  const showToast  = (msg: string) => { setSuccessToast(msg); setTimeout(() => setSuccessToast(null), 3500); };
  const showError  = (msg: string) => { setErrorToast(msg);   setTimeout(() => setErrorToast(null),   3500); };

  const handleSelectPastRun = (run: AgentRun) => {
    setSelectedPastRunId(run.id);
    fetchLotsForRun(run.id);
    setLogs([]);
    const s = run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : 'pending';
    setAgentStates({
      CategorySelector: { status: s, tokens_used: 0 },
      Memory:           { status: s, tokens_used: 0 },
      ListingAnalyzer:  { status: s, tokens_used: 0 },
      LotGenerator:     { status: s, tokens_used: 0 },
      Publisher:        { status: s, tokens_used: 0 },
    });
  };

  const handleResetSession = () => {
    setActiveRun(null);
    setLogs([]);
    setGeneratedLots([]);
    setExpandedLotId(null);
    setAgentStates(INITIAL_AGENT_STATES);
    if (sseRef.current) sseRef.current.close();
  };

  const handleLotsFilterChange = (newFilter: LotsFilter) => {
    setLotsFilter(newFilter);
    const runId = selectedPastRunId ?? activeRun?.id;
    if (runId) fetchLotsForRun(runId, newFilter);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6 text-slate-300"
    >
      <ToastStack successToast={successToast} errorToast={errorToast} />

      <AgentsHero
        activeRun={activeRun}
        generatedLots={generatedLots}
        totalTokens={activeRun?.total_cost_tokens ?? 0}
        onToggleSettings={() => setShowSettings((prev) => !prev)}
        onResetSession={handleResetSession}
        onStopAnalysis={handleStopAnalysis}
        isStopping={isStopping}
        showSettings={showSettings}
      />

      <LaunchSettingsPanel
        visible={showSettings && !activeRun}
        mode={mode}
        limit={limit}
        tavilyKey={tavilyKey}
        targetAccountId={targetAccountId}
        accounts={accounts}
        isStarting={isStarting}
        manualNodeIds={manualNodeIds}
        onModeChange={setMode}
        onLimitChange={(value) => setLimit(Math.min(12, Math.max(2, value)))}
        onTavilyKeyChange={setTavilyKey}
        onTargetAccountChange={setTargetAccountId}
        onManualNodeIdsChange={setManualNodeIds}
        onSubmit={handleStartAnalysis}
      />

      <AgentsPipeline agentStates={agentStates} />

      <AgentsUniverse
        activeRun={activeRun}
        agentStates={agentStates}
        logs={logs}
        generatedLots={generatedLots}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <AgentsLogsPanel logs={logs} />
        <MemoryInsightsPanel realInsights={realInsights} />
      </div>

      <RunHistoryPanel
        runs={pastRuns}
        selectedRunId={selectedPastRunId}
        activeRunId={activeRun?.id}
        onSelectRun={handleSelectPastRun}
      />

      <GeneratedLotsPanel
        lots={generatedLots}
        expandedLotId={expandedLotId}
        activeLotCardTabs={activeLotCardTabs}
        exportingId={exportingId}
        filter={lotsFilter}
        onFilterChange={handleLotsFilterChange}
        onToggleExpanded={(lotId) => setExpandedLotId((prev) => (prev === lotId ? null : lotId))}
        onChangeTab={(lotId, tab) => setActiveLotCardTabs((prev) => ({ ...prev, [lotId]: tab }))}
        onExport={(lot) => handleExportLot(lot.id)}
      />
    </motion.div>
  );
}
