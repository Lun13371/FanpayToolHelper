import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Settings, 
  Database, 
  Brain, 
  Search, 
  Sparkles, 
  TrendingUp, 
  Layers, 
  Cpu, 
  Layers2,
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  Info,
  X,
  Plus
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { AgentRun, AgentState, AgentLog, GeneratedLot } from '../../types';

export default function AgentsTab() {
  const { token, accounts } = useAppContext();
  
  // Конфигурация запуска
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [limit, setLimit] = useState<number>(5);
  const [tavilyKey, setTavilyKey] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<number | null>(null);
  
  // Состояния работы сессии
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({
    CategorySelector: { status: 'pending', tokens_used: 0 },
    ListingAnalyzer: { status: 'pending', tokens_used: 0 },
    LotGenerator: { status: 'pending', tokens_used: 0 }
  });
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [generatedLots, setGeneratedLots] = useState<GeneratedLot[]>([]);
  const [isStarting, setIsRunning] = useState<boolean>(false);
  
  // UI Состояния
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [expandedLotId, setExpandedLotId] = useState<number | null>(null);
  const [selectedPastRunId, setSelectedPastRunId] = useState<number | null>(null);
  const [pastRuns, setPastRuns] = useState<AgentRun[]>([]);
  const [showSettings, setShowSettings] = useState<boolean>(true);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Автопрокрутка логов
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Загрузка активного рана и прошлых запусков при монтировании
  useEffect(() => {
    fetchActiveRun();
    fetchPastRuns();
    
    if (accounts.length > 0) {
      setTargetAccountId(accounts[0].id);
    }
    
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [accounts]);

  // Получить активную сессию
  const fetchActiveRun = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.active && data.run) {
          setActiveRun(data.run);
          if (data.agent_states) {
            setAgentStates(prev => ({ ...prev, ...data.agent_states }));
          }
          // Подключаемся к SSE потоку
          connectSSE(data.run.id);
        }
      }
    } catch (err) {
      console.error("Ошибка получения активной сессии:", err);
    }
  };

  // Получить историю сессий
  const fetchPastRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPastRuns(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Получить лоты для сессии
  const fetchLotsForRun = async (runId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs/${runId}/lots`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLots(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Подключение к SSE логам
  const connectSSE = (runId: number) => {
    if (sseRef.current) sseRef.current.close();
    
    // Создаем SSE соединение
    const url = `${API_URL}/api/v1/agents/runs/${runId}/stream?token=${token}`;
    const sse = new EventSource(url);
    sseRef.current = sse;
    
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'log') {
          setLogs(prev => {
            // Предотвращаем дублирование логов
            if (prev.some(l => l.id === data.id)) return prev;
            return [...prev, data];
          });
        } 
        else if (data.type === 'state') {
          if (data.agent_states) {
            setAgentStates(prev => ({ ...prev, ...data.agent_states }));
          }
          setActiveRun(prev => {
            if (!prev) return null;
            return {
              ...prev,
              status: data.run_status,
              total_cost_tokens: data.total_cost_tokens
            };
          });
        }
        else if (data.type === 'done') {
          // Завершено! Выключаем стрим и тянем лоты
          sse.close();
          fetchLotsForRun(runId);
          fetchPastRuns();
          showToast("Анализ рынка успешно завершен! Сгенерирован прибыльный RMT-каталог.");
        }
        else if (data.type === 'error') {
          sse.close();
          showError(data.message || "Произошла ошибка сессии.");
        }
      } catch (err) {
        console.error("Ошибка парсинга SSE сообщения:", err);
      }
    };

    sse.onerror = (err) => {
      console.error("Сбой SSE соединения:", err);
      // При временных сбоях сети SSE сам пытается переподключиться.
    };
  };

  // Запустить новую сессию
  const handleStartAnalysis = async () => {
    setIsRunning(true);
    setLogs([]);
    setGeneratedLots([]);
    setAgentStates({
      CategorySelector: { status: 'pending', tokens_used: 0 },
      ListingAnalyzer: { status: 'pending', tokens_used: 0 },
      LotGenerator: { status: 'pending', tokens_used: 0 }
    });

    try {
      const res = await fetch(`${API_URL}/api/v1/agents/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mode,
          limit_categories: limit,
          tavily_api_key: tavilyKey || undefined,
          target_account_id: targetAccountId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setActiveRun(data);
        setShowSettings(false);
        // Сразу коннектим SSE по ID рана
        connectSSE(data.id);
      } else {
        const errData = await res.json();
        showError(errData.detail || "Не удалось запустить агентов.");
      }
    } catch (err) {
      showError("Сбой соединения при запуске.");
    } finally {
      setIsRunning(false);
    }
  };

  // Экспорт сгенерированного лота в рабочий шаблон
  const handleExportLot = async (lotId: number) => {
    setExportingId(lotId);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/lots/${lotId}/export-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message);
      } else {
        const err = await res.json();
        showError(err.detail || "Ошибка экспорта.");
      }
    } catch (err) {
      showError("Сбой сети при экспорте.");
    } finally {
      setExportingId(null);
    }
  };

  // Вспомогательные тосты
  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 4000);
  };

  // Клик по прошлому запуску из истории
  const handleSelectPastRun = (run: AgentRun) => {
    setSelectedPastRunId(run.id);
    fetchLotsForRun(run.id);
    
    // Заполняем логи и состояния статически
    setLogs([]);
    setAgentStates({
      CategorySelector: { status: run.status === 'completed' ? 'completed' : 'failed', tokens_used: 0 },
      ListingAnalyzer: { status: run.status === 'completed' ? 'completed' : 'failed', tokens_used: 0 },
      LotGenerator: { status: run.status === 'completed' ? 'completed' : 'failed', tokens_used: 0 }
    });
  };

  // Карточки статусов узлов на 2D-карте
  const getNodeDetails = (nodeName: string) => {
    switch (nodeName) {
      case 'Base':
        return {
          title: "База категорий FunPay",
          desc: "Хранилище всех существующих игр и RMT-разделов (аккаунты, золото, услуги). Синхронизируется автоматически каждые 3 дня.",
          color: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
          icon: <Database className="w-6 h-6" />
        };
      case 'Selector':
        return {
          title: "CategorySelector (Агент 1)",
          desc: "Сканирует веб-тренды (Tavily/DDG) и анализирует популярные направления RMT в текущем году. Избегает дублирования с семантической памятью прошлых раундов и на выходе выбирает 5-10 самых прибыльных категорий.",
          status: agentStates.CategorySelector?.status,
          task: agentStates.CategorySelector?.current_task || "Ожидание запуска",
          tokens: agentStates.CategorySelector?.tokens_used || 0,
          color: "border-purple-500/30 text-purple-400 bg-purple-500/5",
          icon: <Search className="w-6 h-6" />
        };
      case 'Memory':
        return {
          title: "Семантическая память инсайтов",
          desc: "Векторное хранилище СУБД (pgvector) с использованием модели 'qwen3-embedding-8b' (Fireworks, 8192-dim). Накапливает знания о трендах, маржинальности и источниках дешевой закупки товаров, делая агентов обучаемыми со временем.",
          color: "border-amber-500/30 text-amber-400 bg-amber-500/5",
          icon: <Brain className="w-6 h-6" />
        };
      case 'Analyzer':
        return {
          title: "ListingAnalyzer (Агент 2)",
          desc: "Глубоко парсит листинги лотов внутри выбранных разделов. Вычисляет ценообразование конкурентов, находит сторонние руководства по фарму и контакты оптовых дилеров, сохраняя выводы в векторную семантическую память.",
          status: agentStates.ListingAnalyzer?.status,
          task: agentStates.ListingAnalyzer?.current_task || "Ожидание запуска",
          tokens: agentStates.ListingAnalyzer?.tokens_used || 0,
          color: "border-cyan-500/30 text-cyan-400 bg-cyan-500/5",
          icon: <Cpu className="w-6 h-6" />
        };
      case 'Generator':
        return {
          title: "LotGenerator (Агент 3)",
          desc: "Принимает аналитические данные. Проектирует готовые карточки товаров с названиями, структурированными описаниями с эмодзи, автовыдачей, оптимальными ценами и AI-обоснованием маржинальности для публикации.",
          status: agentStates.LotGenerator?.status,
          task: agentStates.LotGenerator?.current_task || "Ожидание запуска",
          tokens: agentStates.LotGenerator?.tokens_used || 0,
          color: "border-indigo-500/30 text-indigo-400 bg-indigo-500/5",
          icon: <Sparkles className="w-6 h-6" />
        };
      case 'LotsNode':
        return {
          title: "RMT Каталог лотов (50+ позиций)",
          desc: "Результирующее хранилище сгенерированных AI товаров. Из него вы можете в один клик импортировать позиции в реальные шаблоны создания лотов FunPay.",
          color: "border-sky-500/30 text-sky-400 bg-sky-500/5",
          icon: <Layers className="w-6 h-6" />
        };
      default:
        return null;
    }
  };

  const selectedNodeInfo = selectedNode ? getNodeDetails(selectedNode) : null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 text-slate-300"
    >
      {/* Тосты */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs shadow-lg shadow-emerald-500/5 backdrop-blur-md"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successToast}</span>
          </motion.div>
        )}
        {errorToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs shadow-lg shadow-red-500/5 backdrop-blur-md"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Верхняя шапка */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0A0D14] p-6 border border-white/5 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-32 bg-brand-cyan/5 rounded-full blur-3xl -z-10" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20">
              Agentic Beta
            </span>
            <span className="text-xs text-slate-500 font-medium">| ИИ-Анализ рынка</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Когнитивные Агенты FunPay
          </h1>
          <p className="text-xs text-slate-400 max-w-xl">
            Комплексный искусственный интеллект для сканирования веба, парсинга конкурентов и автогенерации каталога прибыльных цифровых товаров с интеграцией в семантическую память.
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold transition-all border ${
              showSettings 
                ? 'bg-white/10 text-white border-white/15' 
                : 'bg-[#0E121E] text-slate-400 border-white/5 hover:text-white hover:border-white/10'
            }`}
          >
            <Settings className="w-4 h-4" />
            {showSettings ? 'Скрыть настройки' : 'Настройки'}
          </button>
          
          {activeRun && (
            <button
              onClick={() => {
                setActiveRun(null);
                setLogs([]);
                setGeneratedLots([]);
                if (sseRef.current) sseRef.current.close();
              }}
              className="py-2 px-4 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/15 hover:bg-red-500/15 transition-all"
            >
              Сбросить сессию
            </button>
          )}
        </div>
      </div>

      {/* Панель настроек запуска */}
      <AnimatePresence>
        {showSettings && !activeRun && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0A0D14] p-5 border border-white/5 rounded-2xl">
              {/* Режим */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">Режим Анализа</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0E121E] border border-white/5 rounded-xl">
                  <button
                    onClick={() => setMode('auto')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      mode === 'auto' ? 'bg-brand-cyan text-slate-950 font-bold shadow-md shadow-brand-cyan/10' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Автовыбор ИИ
                  </button>
                  <button
                    onClick={() => setMode('manual')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      mode === 'manual' ? 'bg-brand-cyan text-slate-950 font-bold shadow-md shadow-brand-cyan/10' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Популярные игры
                  </button>
                </div>
              </div>

              {/* Лимит категорий */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">Лимит Категорий (5 - 10)</label>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={limit}
                  onChange={(e) => setLimit(Math.min(12, Math.max(2, parseInt(e.target.value) || 5)))}
                  className="w-full bg-[#0E121E] border border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-brand-cyan/30 transition-all h-10"
                />
              </div>

              {/* Tavily API Key */}
              <div className="space-y-2 col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">Tavily API Key (Опционально)</label>
                  <span className="text-[9px] text-slate-500">Пусто = бесплатный DuckDuckGo</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="tvly-..."
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    className="flex-grow bg-[#0E121E] border border-white/5 rounded-xl px-3 py-2 text-xs font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-brand-cyan/30 transition-all h-10"
                  />
                  <button
                    onClick={handleStartAnalysis}
                    disabled={isStarting}
                    className="px-5 bg-gradient-to-r from-brand-cyan to-brand-blue hover:from-brand-cyan/90 hover:to-brand-blue/90 disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-500 hover:shadow-lg hover:shadow-brand-cyan/10 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 h-10 transition-all shrink-0 border border-brand-cyan/20"
                  >
                    {isStarting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-slate-950" />
                    )}
                    Запустить Анализ
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* КОГНИТИВНЫЙ ПРОГРЕСС АНАЛИЗА (ВРЕМЕННАЯ ШКАЛА ШАГОВ ИИ) */}
      {activeRun && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-[#0A0D14]/80 border border-white/5 rounded-2xl backdrop-blur-md"
        >
          {/* Шаг 1: CategorySelector */}
          <div className="flex items-center gap-3.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-all border ${
              agentStates.CategorySelector?.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              agentStates.CategorySelector?.status === 'running' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]' :
              'bg-[#0E121E] border-white/5 text-slate-500'
            }`}>
              {agentStates.CategorySelector?.status === 'completed' ? '✓' : '1'}
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">Шаг 1: CategorySelector</div>
              <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[200px]">
                {agentStates.CategorySelector?.status === 'running' ? (
                  <span className="text-purple-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> {agentStates.CategorySelector?.current_task || "Отбор трендов"}
                  </span>
                ) : agentStates.CategorySelector?.status === 'completed' ? (
                  <span className="text-emerald-400">Категории отобраны успешно</span>
                ) : (
                  "Ожидание анализа трендов"
                )}
              </p>
            </div>
          </div>

          {/* Шаг 2: ListingAnalyzer */}
          <div className="flex items-center gap-3.5 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-all border ${
              agentStates.ListingAnalyzer?.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              agentStates.ListingAnalyzer?.status === 'running' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]' :
              'bg-[#0E121E] border-white/5 text-slate-500'
            }`}>
              {agentStates.ListingAnalyzer?.status === 'completed' ? '✓' : '2'}
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">Шаг 2: ListingAnalyzer</div>
              <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[200px]">
                {agentStates.ListingAnalyzer?.status === 'running' ? (
                  <span className="text-cyan-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> {agentStates.ListingAnalyzer?.current_task || "Парсинг лотов"}
                  </span>
                ) : agentStates.ListingAnalyzer?.status === 'completed' ? (
                  <span className="text-emerald-400">Анализ листингов завершен</span>
                ) : (
                  "Ожидание парсинга"
                )}
              </p>
            </div>
          </div>

          {/* Шаг 3: LotGenerator */}
          <div className="flex items-center gap-3.5 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-all border ${
              agentStates.LotGenerator?.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              agentStates.LotGenerator?.status === 'running' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]' :
              'bg-[#0E121E] border-white/5 text-slate-500'
            }`}>
              {agentStates.LotGenerator?.status === 'completed' ? '✓' : '3'}
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">Шаг 3: LotGenerator</div>
              <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[200px]">
                {agentStates.LotGenerator?.status === 'running' ? (
                  <span className="text-indigo-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> {agentStates.LotGenerator?.current_task || "Синтез лотов"}
                  </span>
                ) : agentStates.LotGenerator?.status === 'completed' ? (
                  <span className="text-emerald-400">Генерация лотов завершена</span>
                ) : (
                  "Ожидание генерации"
                )}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* РАЗДЕЛ 1: 2D ИНТЕРАКТИВНЫЙ ХОЛСТ АГЕНТОВ (AGENT CANVAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0D14]/60 border border-white/5 rounded-2xl p-6 h-[440px] relative flex flex-col justify-between overflow-hidden backdrop-blur-sm">
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-cyan animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Интерактивный Холст Когнитивного Потока</span>
          </div>
          
          <div className="absolute top-3 right-4 text-[9px] text-slate-500 font-semibold">
            {activeRun ? `АКТИВНАЯ СЕССИЯ #${activeRun.id} (${activeRun.status})` : "СЕССИЯ НЕ ЗАПУЩЕНА"}
          </div>

          {/* SVG Линии связи между агентами */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none -z-10">
            {/* База -> Selector */}
            <path 
              d="M 60 220 Q 140 180 220 140" 
              fill="none" 
              stroke="rgba(168, 85, 247, 0.15)" 
              strokeWidth="2" 
            />
            {activeRun && agentStates.CategorySelector?.status === 'running' && (
              <path 
                d="M 60 220 Q 140 180 220 140" 
                fill="none" 
                stroke="#A855F7" 
                strokeWidth="2" 
                strokeDasharray="6, 6"
                className="animate-dash"
              />
            )}

            {/* Selector -> Analyzer */}
            <path 
              d="M 220 140 Q 310 180 400 220" 
              fill="none" 
              stroke="rgba(59, 130, 246, 0.15)" 
              strokeWidth="2" 
            />
            {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
              <path 
                d="M 220 140 Q 310 180 400 220" 
                fill="none" 
                stroke="#3B82F6" 
                strokeWidth="2" 
                strokeDasharray="6, 6"
                className="animate-dash"
              />
            )}

            {/* Selector -> Memory (Insight Storage) */}
            <path 
              d="M 220 140 Q 220 220 220 300" 
              fill="none" 
              stroke="rgba(245, 158, 11, 0.15)" 
              strokeWidth="2" 
            />

            {/* Analyzer -> Memory (Read/Write vector) */}
            <path 
              d="M 400 220 Q 310 260 220 300" 
              fill="none" 
              stroke="rgba(245, 158, 11, 0.15)" 
              strokeWidth="2" 
            />
            {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
              <path 
                d="M 400 220 Q 310 260 220 300" 
                fill="none" 
                stroke="#F59E0B" 
                strokeWidth="2" 
                strokeDasharray="6, 6"
                className="animate-dash"
              />
            )}

            {/* Analyzer -> Generator */}
            <path 
              d="M 400 220 Q 490 180 580 140" 
              fill="none" 
              stroke="rgba(99, 102, 241, 0.15)" 
              strokeWidth="2" 
            />
            {activeRun && agentStates.LotGenerator?.status === 'running' && (
              <path 
                d="M 400 220 Q 490 180 580 140" 
                fill="none" 
                stroke="#6366F1" 
                strokeWidth="2" 
                strokeDasharray="6, 6"
                className="animate-dash"
              />
            )}

            {/* Generator -> LotsNode (Save Lots) */}
            <path 
              d="M 580 140 Q 580 220 580 300" 
              fill="none" 
              stroke="rgba(14, 165, 233, 0.15)" 
              strokeWidth="2" 
            />
            {activeRun && agentStates.LotGenerator?.status === 'running' && (
              <path 
                d="M 580 140 Q 580 220 580 300" 
                fill="none" 
                stroke="#0EA5E9" 
                strokeWidth="2" 
                strokeDasharray="6, 6"
                className="animate-dash"
              />
            )}
          </svg>

          {/* Рабочая плоскость с узлами */}
          <div className="flex-grow relative w-full h-full">
            {/* 1. Base Node */}
            <button
              onClick={() => setSelectedNode('Base')}
              className={`absolute left-[5%] top-[45%] w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                selectedNode === 'Base' 
                  ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/20' 
                  : 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-400/40 text-emerald-400'
              }`}
            >
              <Database className="w-5 h-5" />
              <span className="text-[9px] font-bold block absolute -bottom-5 w-24 text-center text-emerald-400/80">Категории FunPay</span>
            </button>

            {/* 2. Selector Node */}
            {activeRun && agentStates.CategorySelector?.status === 'running' && (
              <span className="absolute left-[30%] top-[20%] w-16 h-14 rounded-full border border-purple-400/50 animate-ping opacity-30 pointer-events-none" />
            )}
            <button
              onClick={() => setSelectedNode('Selector')}
              className={`absolute left-[30%] top-[20%] w-16 h-14 rounded-full flex flex-col items-center justify-center border transition-all ${
                selectedNode === 'Selector' 
                  ? 'border-purple-400 bg-purple-500/10 shadow-lg shadow-purple-500/20' 
                  : 'border-purple-500/20 bg-purple-500/5 hover:border-purple-400/40 text-purple-400'
              } ${activeRun && agentStates.CategorySelector?.status === 'running' ? 'animate-pulse border-purple-400 shadow-md shadow-purple-500/10' : ''}`}
            >
              {activeRun && agentStates.CategorySelector?.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              <span className="text-[9px] font-bold block absolute -bottom-5 w-28 text-center text-purple-400/80">CategorySelector</span>
              {activeRun && agentStates.CategorySelector?.status === 'completed' && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center">✓</span>
              )}
            </button>

            {/* 3. Memory Node */}
            <button
              onClick={() => setSelectedNode('Memory')}
              className={`absolute left-[30%] top-[65%] w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                selectedNode === 'Memory' 
                  ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20' 
                  : 'border-amber-500/20 bg-amber-500/5 hover:border-amber-400/40 text-amber-400'
              }`}
            >
              <Brain className="w-5 h-5" />
              <span className="text-[9px] font-bold block absolute -bottom-5 w-24 text-center text-amber-400/80">Векторная Память</span>
            </button>

            {/* 4. Analyzer Node */}
            {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
              <span className="absolute left-[56%] top-[45%] w-16 h-14 rounded-full border border-cyan-400/50 animate-ping opacity-30 pointer-events-none" />
            )}
            <button
              onClick={() => setSelectedNode('Analyzer')}
              className={`absolute left-[56%] top-[45%] w-16 h-14 rounded-full flex flex-col items-center justify-center border transition-all ${
                selectedNode === 'Analyzer' 
                  ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
                  : 'border-cyan-500/20 bg-cyan-500/5 hover:border-cyan-400/40 text-cyan-400'
              } ${activeRun && agentStates.ListingAnalyzer?.status === 'running' ? 'animate-pulse border-cyan-400 shadow-md shadow-cyan-500/10' : ''}`}
            >
              {activeRun && agentStates.ListingAnalyzer?.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Cpu className="w-5 h-5" />
              )}
              <span className="text-[9px] font-bold block absolute -bottom-5 w-28 text-center text-cyan-400/80">ListingAnalyzer</span>
              {activeRun && agentStates.ListingAnalyzer?.status === 'completed' && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center">✓</span>
              )}
            </button>

            {/* 5. Generator Node */}
            {activeRun && agentStates.LotGenerator?.status === 'running' && (
              <span className="absolute left-[82%] top-[20%] w-16 h-14 rounded-full border border-indigo-400/50 animate-ping opacity-30 pointer-events-none" />
            )}
            <button
              onClick={() => setSelectedNode('Generator')}
              className={`absolute left-[82%] top-[20%] w-16 h-14 rounded-full flex flex-col items-center justify-center border transition-all ${
                selectedNode === 'Generator' 
                  ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/20' 
                  : 'border-indigo-500/20 bg-indigo-500/5 hover:border-indigo-400/40 text-indigo-400'
              } ${activeRun && agentStates.LotGenerator?.status === 'running' ? 'animate-pulse border-indigo-400 shadow-md shadow-indigo-500/10' : ''}`}
            >
              {activeRun && agentStates.LotGenerator?.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              <span className="text-[9px] font-bold block absolute -bottom-5 w-28 text-center text-indigo-400/80">LotGenerator</span>
              {activeRun && agentStates.LotGenerator?.status === 'completed' && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center">✓</span>
              )}
            </button>

            {/* 6. Lots Node */}
            <button
              onClick={() => setSelectedNode('LotsNode')}
              className={`absolute left-[82%] top-[65%] w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                selectedNode === 'LotsNode' 
                  ? 'border-sky-400 bg-sky-500/10 shadow-lg shadow-sky-500/20' 
                  : 'border-sky-500/20 bg-sky-500/5 hover:border-sky-400/40 text-sky-400'
              }`}
            >
              <Layers className="w-5 h-5" />
              <span className="text-[9px] font-bold block absolute -bottom-5 w-24 text-center text-sky-400/80">RMT Каталог</span>
              {generatedLots.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-sky-500 text-slate-950 rounded-full px-1 py-0.5 text-[8px] font-extrabold flex items-center justify-center leading-none">
                  {generatedLots.length}
                </span>
              )}
            </button>
          </div>

          {/* Информационный лог о затратах в футере холста */}
          {activeRun && (
            <div className="flex items-center justify-between border-t border-white/5 pt-3 text-[10px] text-slate-500 font-semibold tracking-wide">
              <div>СТАТУС: <span className="text-white uppercase">{activeRun.status}</span></div>
              <div className="flex gap-4">
                <div>РАСХОД ТОКЕНОВ: <span className="text-brand-cyan">{activeRun.total_cost_tokens.toLocaleString()}</span></div>
                <div>ЗАТРАТЫ (EST): <span className="text-emerald-400">${(activeRun.total_cost_tokens * 0.000002).toFixed(3)}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* ПРАВАЯ ЧАСТЬ: ИНФО ПАНЕЛЬ ИЛИ ЛОГИ */}
        <div className="flex flex-col gap-4">
          {/* 1. Детали выбранного узла на холсте */}
          <AnimatePresence mode="wait">
            {selectedNodeInfo ? (
              <motion.div
                key={selectedNode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`border p-4 rounded-2xl space-y-3 relative ${selectedNodeInfo.color}`}
              >
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="absolute top-3 right-3 text-slate-500 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    {selectedNodeInfo.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-white">{selectedNodeInfo.title}</h3>
                    <span className="text-[10px] font-bold block text-slate-400">КОГНИТИВНЫЙ КОМПОНЕНТ</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {selectedNodeInfo.desc}
                </p>

                {selectedNodeInfo.status && (
                  <div className="border-t border-white/5 pt-3 space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Статус агента:</span>
                      <span className={`font-bold capitalize ${
                        selectedNodeInfo.status === 'completed' ? 'text-emerald-400' :
                        selectedNodeInfo.status === 'running' ? 'text-brand-cyan animate-pulse' : 'text-slate-500'
                      }`}>
                        {selectedNodeInfo.status === 'completed' ? 'Успешно' :
                         selectedNodeInfo.status === 'running' ? 'Выполняет работу' : 'Ожидание'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Текущая задача:</span>
                      <span className="text-white font-semibold text-right max-w-[150px] truncate">{selectedNodeInfo.task}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Потрачено токенов:</span>
                      <span className="text-brand-cyan font-bold">{selectedNodeInfo.tokens.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-[#0A0D14]/30 border border-white/5 p-4 rounded-2xl text-center text-xs text-slate-500 py-10"
              >
                <Info className="w-5 h-5 mx-auto mb-2 text-slate-600" />
                Нажмите на любой круглый узел или линию связи на холсте слева, чтобы открыть подробное описание роли ИИ-компонента и его мини-логи.
              </motion.div>
            )}
          </AnimatePresence>

          {/* 2. Живой поток логов */}
          <div className="bg-[#0A0D14] border border-white/5 rounded-2xl flex-grow h-[260px] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <Layers2 className="w-4 h-4 text-brand-cyan" />
                <span className="font-bold text-xs text-white">Журнал Мыслей ИИ</span>
              </div>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">LIVE</span>
            </div>
            
            <div 
              ref={logContainerRef}
              className="flex-grow p-4 font-mono text-[10px] space-y-2 overflow-y-auto max-h-[220px]"
            >
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-10">
                  Ожидание логов...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2 items-start leading-relaxed">
                    <span className="text-slate-600 shrink-0">[{log.created_at}]</span>
                    <span className={`font-bold shrink-0 ${
                      log.agent_name === 'CategorySelector' ? 'text-purple-400' :
                      log.agent_name === 'ListingAnalyzer' ? 'text-cyan-400' :
                      log.agent_name === 'LotGenerator' ? 'text-indigo-400' : 'text-slate-400'
                    }`}>
                      {log.agent_name}:
                    </span>
                    <span className={`${
                      log.level === 'error' ? 'text-red-400 font-bold' :
                      log.level === 'warning' ? 'text-amber-400 font-semibold' : 'text-slate-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* РАЗДЕЛ 2: ИСТОРИЯ ЗАПУСКОВ (ИСТОРИЯ АНАЛИЗА) */}
      <div className="bg-[#0A0D14] border border-white/5 rounded-2xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-brand-cyan" />
          История и архивы когнитивного анализа
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {pastRuns.length === 0 ? (
            <div className="text-slate-600 text-xs py-4">Архивы запусков пусты. Запустите анализ выше.</div>
          ) : (
            pastRuns.map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectPastRun(run)}
                className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition-all ${
                  selectedPastRunId === run.id || (activeRun && activeRun.id === run.id)
                    ? 'border-brand-cyan bg-brand-cyan/5 text-white' 
                    : 'border-white/5 bg-[#0E121E] text-slate-400 hover:border-white/10 hover:text-white'
                }`}
              >
                <div className="text-[10px] font-bold text-slate-500">ЗАПУСК #{run.id}</div>
                <div className="text-xs font-bold text-white mb-1">Режим: {run.mode === 'auto' ? 'Авто-анализ' : 'Популярные'}</div>
                <div className="flex gap-3 text-[9px] font-bold text-slate-500">
                  <span>Кат: {run.limit_categories}</span>
                  <span>Токены: {run.total_cost_tokens.toLocaleString()}</span>
                  <span className={`${
                    run.status === 'completed' ? 'text-emerald-400' :
                    run.status === 'running' ? 'text-brand-cyan animate-pulse' : 'text-red-400'
                  }`}>{run.status === 'completed' ? 'Успешно' : run.status === 'running' ? 'В процессе' : 'Сбой'}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* РАЗДЕЛ 3: СГЕНЕРИРОВАННЫЙ RMT-КАТАЛОГ (РЕЗУЛЬТАТЫ ГЕНЕРАЦИИ) */}
      <AnimatePresence>
        {generatedLots.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Layers className="w-5 h-5 text-emerald-400" />
                Сгенерированный AI-каталог прибыльных товаров ({generatedLots.length} позиций)
              </h2>
              <span className="text-[10px] font-semibold text-slate-500">Одобрено для экспорта в шаблоны публикации</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedLots.map((lot) => {
                const isExpanded = expandedLotId === lot.id;
                return (
                  <div 
                    key={lot.id} 
                    className="bg-[#0A0D14] border border-white/5 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-white/10 transition-all group"
                  >
                    {/* Header */}
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                          {lot.game_name}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {lot.subcategory_name}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-xs text-white leading-snug group-hover:text-brand-cyan transition-all">
                        {lot.title}
                      </h3>

                      {/* AI Reasoning */}
                      {lot.ai_reasoning && (
                        <div className="p-3 bg-brand-cyan/5 border border-brand-cyan/10 rounded-xl text-[10px] italic text-brand-cyan leading-relaxed">
                          <strong>AI Обоснование:</strong> {lot.ai_reasoning}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400">
                        {isExpanded ? (
                          <div className="space-y-4 font-sans">
                            <div className="space-y-2">
                              <h4 className="font-bold text-white text-[10px] uppercase tracking-wider">ПОЛНОЕ ОПИСАНИЕ:</h4>
                              <p className="whitespace-pre-line leading-relaxed text-slate-300 p-3 bg-slate-950/45 border border-white/5 rounded-xl">{lot.description}</p>
                            </div>

                            {lot.fields_json && Object.keys(lot.fields_json).length > 0 && (
                              <div className="space-y-2">
                                <h4 className="font-bold text-white text-[10px] uppercase tracking-wider">Параметры лота FunPay API:</h4>
                                <div className="grid grid-cols-1 gap-1 text-[10px] font-mono p-3.5 bg-slate-950/70 rounded-xl border border-white/5 leading-relaxed">
                                  {Object.entries(lot.fields_json).map(([key, val]) => (
                                    <div key={key} className="flex justify-between gap-4 border-b border-white/5 py-1 last:border-0">
                                      <span className="text-slate-500 shrink-0 truncate max-w-[150px]">{key}:</span>
                                      <span className="text-brand-cyan font-semibold text-right truncate max-w-[240px]">{String(val)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="line-clamp-3 leading-relaxed">{lot.description}</p>
                        )}
                        
                        <button
                          onClick={() => setExpandedLotId(isExpanded ? null : lot.id)}
                          className="text-brand-cyan font-bold hover:underline block mt-1 text-[10px] cursor-pointer"
                        >
                          {isExpanded ? "Свернуть" : "Показать полностью..."}
                        </button>
                      </div>
                    </div>

                    {/* Footer / Action */}
                    <div className="px-5 py-4 border-t border-white/5 bg-[#0E121E]/30 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold uppercase block leading-none">Реком. цена</span>
                          <span className="text-sm font-extrabold text-emerald-400 leading-none block mt-1">{lot.price} ₽</span>
                        </div>
                        <div className="border-l border-white/5 pl-4">
                          <span className="text-[9px] text-slate-500 font-bold uppercase block leading-none">Количество</span>
                          <span className="text-xs font-bold text-white leading-none block mt-1">{lot.amount} шт.</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleExportLot(lot.id)}
                        disabled={exportingId === lot.id}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/5 hover:shadow-emerald-500/10 cursor-pointer border border-emerald-400/20"
                      >
                        {exportingId === lot.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        В Шаблоны
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
