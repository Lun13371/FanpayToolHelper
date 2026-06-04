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
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  Info,
  X,
  Plus,
  Terminal,
  Eye,
  Activity,
  ChevronUp,
  ChevronDown
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
  
  // Позиции узлов на холсте (виртуальная координатная сетка 1000x500)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({
    Base: { x: 100, y: 250 },
    Selector: { x: 350, y: 120 },
    Memory: { x: 350, y: 380 },
    Analyzer: { x: 600, y: 250 },
    Generator: { x: 850, y: 120 },
    LotsNode: { x: 850, y: 380 }
  });

  // Состояния зума и панорамирования холста
  const [zoom, setZoom] = useState<number>(0.85); // слегка уменьшаем по дефолту чтобы всё влезало
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [nodeStartPos, setNodeStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Ссылка на контейнер холста
  const canvasRef = useRef<HTMLDivElement>(null);

  // Обработчики панорамирования холста
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Если кликнули на кнопку сброса или зума, не включаем панорамирование
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsPanning(true);
    setDragOffset({ x: e.clientX, y: e.clientY });
    setPanStart({ x: pan.x, y: pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      // Calculate delta in client pixels
      const dxClient = e.clientX - dragOffset.x;
      const dyClient = e.clientY - dragOffset.y;
      
      // Convert client delta to virtual delta based on zoom
      const dxVirtual = dxClient / zoom;
      const dyVirtual = dyClient / zoom;
      
      // Update node positions inside the virtual board (clamp to board limits: 0-1000, 0-500)
      setNodePositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: Math.min(950, Math.max(50, nodeStartPos.x + dxVirtual)),
          y: Math.min(450, Math.max(50, nodeStartPos.y + dyVirtual))
        }
      }));
    } else if (isPanning) {
      // Pan canvas
      setPan({
        x: panStart.x + (e.clientX - dragOffset.x),
        y: panStart.y + (e.clientY - dragOffset.y)
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
  };

  const handleCanvasWheel = (e: React.WheelEvent) => {
    // Zoom in on wheel
    const zoomDelta = -e.deltaY * 0.0008;
    setZoom(prev => Math.min(1.5, Math.max(0.4, prev + zoomDelta)));
  };

  const handleZoomIn = () => setZoom(prev => Math.min(1.5, prev + 0.1));
  const handleZoomOut = () => setZoom(prev => Math.max(0.4, prev - 0.1));
  const handleResetCanvas = () => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
    setNodePositions({
      Base: { x: 100, y: 250 },
      Selector: { x: 350, y: 120 },
      Memory: { x: 350, y: 380 },
      Analyzer: { x: 600, y: 250 },
      Generator: { x: 850, y: 120 },
      LotsNode: { x: 850, y: 380 }
    });
  };

  // Mouse down on a node button to drag it
  const handleNodeMouseDown = (e: React.MouseEvent, nodeKey: string) => {
    e.stopPropagation(); // prevent panning the canvas!
    setDraggingNode(nodeKey);
    setDragOffset({
      x: e.clientX,
      y: e.clientY
    });
    setNodeStartPos({
      x: nodePositions[nodeKey].x,
      y: nodePositions[nodeKey].y
    });
  };
  
  // Дополнительные UI состояния
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(true);
  const [activeLotCardTabs, setActiveLotCardTabs] = useState<Record<number, 'preview' | 'params' | 'seo'>>({});
  
  // Состояния симулятора публикации в 1 клик
  const [simulatingLot, setSimulatingLot] = useState<GeneratedLot | null>(null);
  const [simStep, setSimStep] = useState<number>(0);
  const [simProgress, setSimProgress] = useState<number>(0);

  // Фильтры для Векторной памяти
  const [searchMemoryQuery, setSearchMemoryQuery] = useState<string>('');
  const [memoryCategoryFilter, setMemoryCategoryFilter] = useState<string>('Все');

  // База извлеченных инсайтов векторной памяти ИИ
  const MOCK_INSIGHTS = [
    {
      id: 1,
      game: "World of Warcraft",
      category: "Валюта",
      trend: "🔥 Спрос растет (+24%)",
      similarity: "98.7%",
      text: "Цены на золото в WoW Retail на европейских серверах (Silvermoon, Draenor) выросли из-за выхода рейда. Рекомендуется удерживать цену 1.25 - 1.40 ₽ за 1к золота. Среднее время выкупа: 8 минут.",
      tags: ["WoW", "Gold", "EU", "High-Demand"],
      date: "Сегодня в 14:12"
    },
    {
      id: 2,
      game: "Counter-Strike 2",
      category: "Услуги",
      trend: "📈 Высокая маржа",
      similarity: "96.4%",
      text: "Калибровка аккаунтов CS2 (Premier Mode) пользуется пиковым спросом по выходным. Средняя маржинальность составляет 180%. Агенты рекомендуют лоты с гарантией прохождения за 24 часа.",
      tags: ["CS2", "Boost", "Premier", "Services"],
      date: "Сегодня в 11:35"
    },
    {
      id: 3,
      game: "Grand Theft Auto V",
      category: "Аккаунты",
      trend: "💎 Стабильно",
      similarity: "94.2%",
      text: "Лицензионные аккаунты Social Club с балансом от $50M GTA Online покупаются розничными клиентами по цене 350-450 ₽. Наценка поставщиков составляет до 300%. Скрейпер зафиксировал дефицит предложений.",
      tags: ["GTA5", "Accounts", "SocialClub", "High-Margin"],
      date: "Вчера в 18:24"
    },
    {
      id: 4,
      game: "Genshin Impact",
      category: "Предметы",
      trend: "🔥 Взрывной интерес",
      similarity: "97.5%",
      text: "Услуга покупки Кристаллов Сотворения через официальные регионы СНГ (с авторизацией) имеет спрос из-за баннера нового персонажа. Рекомендуется позиционировать лоты как 'Безопасный донат без бана'.",
      tags: ["Genshin", "Donate", "Crystals", "Stealth"],
      date: "Вчера в 15:10"
    },
    {
      id: 5,
      game: "Brawl Stars",
      category: "Аккаунты",
      trend: "⚠️ Острая конкуренция",
      similarity: "92.1%",
      text: "Конкуренция в разделе аккаунтов Brawl Stars (30к+ кубков) заставила продавцов демпинговать на 15%. Рекомендуется дифференцировать товары за счет подробного перечисления скинов и наличия смены почты.",
      tags: ["BrawlStars", "Accounts", "Damping", "High-Risk"],
      date: "2 дня назад"
    },
    {
      id: 6,
      game: "Dota 2",
      category: "Услуги",
      trend: "📈 Стабильно (+12%)",
      similarity: "95.0%",
      text: "Жетоны порядочности и отмыв Low Priority в Dota 2 — идеальные услуги для автоматизации через буст-ботов. Маржинальность превышает 250% при минимальных временных затратах.",
      tags: ["Dota2", "Behavior", "LowPriority", "Automation"],
      date: "3 дня назад"
    }
  ];

  const SIMULATION_STEPS = [
    { label: "Подключение SOCKS5 Прокси", desc: "Установка защищенного соединения с локальным пулом резидентных IP-адресов." },
    { label: "Обход защиты Cloudflare", desc: "Авторизация сессии через куки аккаунта и генерация Sec-CH-UA сигнатур." },
    { label: "Выбор раздела на FunPay", desc: `Поиск игрового раздела ${simulatingLot?.game_name || "Игры"} и категории ${simulatingLot?.subcategory_name || "Категории"}.` },
    { label: "Заполнение параметров формы", desc: "Автозаполнение селекторов и текстовых спецификаций (Сервер, фракция, тип товара)." },
    { label: "Загрузка текста и SEO-форматирование", desc: "Вставка рекламного текста с эмодзи-разметкой и скрытым анти-луп кодом." },
    { label: "Калибровка стоимости и лимитов", desc: `Установка оптимальной цены ${simulatingLot?.price || 0} ₽ с объемом партии в ${simulatingLot?.amount || 1} шт.` },
    { label: "Успешная регистрация лота", desc: "Синхронизация с базой шаблонов публикации завершена! Лот готов к автоматической массовой публикации." }
  ];

  // Эффект авто-продвижения шагов эмуляции
  useEffect(() => {
    if (!simulatingLot) {
      setSimStep(0);
      setSimProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setSimStep(prev => {
        if (prev >= 6) {
          clearInterval(interval);
          // Вызываем оригинальный экспорт по завершению симуляции
          handleExportLot(simulatingLot.id);
          return 6;
        }
        const nextStep = prev + 1;
        setSimProgress(Math.min(100, Math.round((nextStep / 6) * 100)));
        return nextStep;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [simulatingLot]);

  const handleSkipSimulation = () => {
    if (simulatingLot) {
      handleExportLot(simulatingLot.id);
      setSimStep(6);
      setSimProgress(100);
    }
  };

  const filteredInsights = MOCK_INSIGHTS.filter(insight => {
    const matchesSearch = insight.game.toLowerCase().includes(searchMemoryQuery.toLowerCase()) || 
                          insight.text.toLowerCase().includes(searchMemoryQuery.toLowerCase()) ||
                          insight.tags.some(t => t.toLowerCase().includes(searchMemoryQuery.toLowerCase()));
    const matchesCategory = memoryCategoryFilter === 'Все' || insight.category === memoryCategoryFilter;
    return matchesSearch && matchesCategory;
  });
  
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

      {/* ВСТРОЕННЫЕ КИБЕРНЕТИЧЕСКИЕ АНИМАЦИИ И СТИЛИ */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -40;
          }
        }
        .animate-dash {
          animation: dash 1.5s linear infinite;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* РАЗДЕЛ 1: 2D ИНТЕРАКТИВНЫЙ ХОЛСТ И ЛОГИ (КОМБИНИРОВАННЫЙ SPLIT-ЭКРАН) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* ХОЛСТ С ГРИД-СЕТКОЙ И АНИМИРОВАННЫМИ ПОТОКАМИ */}
          <div className="bg-[#0A0D14]/60 border border-white/5 rounded-2xl h-[400px] relative flex flex-col justify-between overflow-hidden backdrop-blur-sm shadow-inner group">
            {/* Панель управления зумом */}
            <div className="absolute bottom-4 right-4 z-20 flex gap-1.5 select-none">
              <button 
                onClick={handleZoomIn}
                className="w-7 h-7 bg-[#0E121E]/95 border border-white/10 rounded-lg hover:border-white/20 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer shadow-md transition-all active:scale-95"
                title="Приблизить холст"
              >
                +
              </button>
              <button 
                onClick={handleZoomOut}
                className="w-7 h-7 bg-[#0E121E]/95 border border-white/10 rounded-lg hover:border-white/20 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer shadow-md transition-all active:scale-95"
                title="Отдалить холст"
              >
                -
              </button>
              <button 
                onClick={handleResetCanvas}
                className="px-2.5 h-7 bg-[#0E121E]/95 border border-white/10 rounded-lg hover:border-white/20 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shadow-md transition-all active:scale-95"
                title="Сбросить масштаб и позиции"
              >
                Сбросить
              </button>
            </div>

            {/* Бесконечная координатная сетка с поддержкой Pan & Zoom */}
            <div 
              ref={canvasRef}
              className="w-full h-full relative overflow-hidden select-none"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
              {/* Внутренняя интерактивная доска */}
              <div 
                className="absolute origin-center transition-transform duration-75 ease-out"
                style={{
                  width: '1000px',
                  height: '500px',
                  left: 'calc(50% - 500px)',
                  top: 'calc(50% - 250px)',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  backgroundImage: `
                    radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.05), transparent 75%),
                    linear-gradient(rgba(255, 255, 255, 0.007) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 255, 255, 0.007) 1px, transparent 1px)
                  `,
                  backgroundSize: '100% 100%, 20px 20px, 20px 20px'
                }}
              >
                {/* SVG Прямые динамические связи между узлами холста */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none -z-10">
                  <defs>
                    <linearGradient id="purple-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#C084FC" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#A855F7" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#C084FC" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="indigo-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#818CF8" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#6366F1" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#818CF8" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="amber-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>

                  {/* 1. Base -> Selector */}
                  <path 
                    d={`M ${nodePositions.Base.x} ${nodePositions.Base.y} L ${nodePositions.Selector.x} ${nodePositions.Selector.y}`} 
                    fill="none" 
                    stroke="rgba(168, 85, 247, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {activeRun && agentStates.CategorySelector?.status === 'running' && (
                    <>
                      <path 
                        d={`M ${nodePositions.Base.x} ${nodePositions.Base.y} L ${nodePositions.Selector.x} ${nodePositions.Selector.y}`} 
                        fill="none" 
                        stroke="url(#purple-glow)" 
                        strokeWidth="2.5" 
                        strokeDasharray="8, 120"
                        className="animate-dash"
                      />
                      <circle r="4.5" fill="#C084FC" style={{ filter: 'drop-shadow(0 0 6px #A855F7)' }}>
                        <animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${nodePositions.Base.x} ${nodePositions.Base.y} L ${nodePositions.Selector.x} ${nodePositions.Selector.y}`} />
                      </circle>
                    </>
                  )}

                  {/* 2. Selector -> Analyzer */}
                  <path 
                    d={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y}`} 
                    fill="none" 
                    stroke="rgba(6, 182, 212, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
                    <>
                      <path 
                        d={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y}`} 
                        fill="none" 
                        stroke="url(#cyan-glow)" 
                        strokeWidth="2.5" 
                        strokeDasharray="8, 120"
                        className="animate-dash"
                      />
                      <circle r="4.5" fill="#22D3EE" style={{ filter: 'drop-shadow(0 0 6px #06B6D4)' }}>
                        <animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y}`} />
                      </circle>
                    </>
                  )}

                  {/* 3. Selector -> Memory */}
                  <path 
                    d={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} 
                    fill="none" 
                    stroke="rgba(245, 158, 11, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {activeRun && agentStates.CategorySelector?.status === 'running' && (
                    <>
                      <path 
                        d={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} 
                        fill="none" 
                        stroke="url(#amber-glow)" 
                        strokeWidth="2" 
                        strokeDasharray="6, 80"
                        className="animate-dash"
                      />
                      <circle r="3.5" fill="#FBBF24" style={{ filter: 'drop-shadow(0 0 5px #F59E0B)' }}>
                        <animateMotion dur="2.2s" repeatCount="indefinite" path={`M ${nodePositions.Selector.x} ${nodePositions.Selector.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} />
                      </circle>
                    </>
                  )}

                  {/* 4. Analyzer -> Memory */}
                  <path 
                    d={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} 
                    fill="none" 
                    stroke="rgba(245, 158, 11, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
                    <>
                      <path 
                        d={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} 
                        fill="none" 
                        stroke="url(#amber-glow)" 
                        strokeWidth="2" 
                        strokeDasharray="6, 80"
                        className="animate-dash"
                      />
                      <circle r="3.5" fill="#FBBF24" style={{ filter: 'drop-shadow(0 0 5px #F59E0B)' }}>
                        <animateMotion dur="2s" repeatCount="indefinite" path={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Memory.x} ${nodePositions.Memory.y}`} />
                      </circle>
                    </>
                  )}

                  {/* 5. Analyzer -> Generator */}
                  <path 
                    d={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Generator.x} ${nodePositions.Generator.y}`} 
                    fill="none" 
                    stroke="rgba(99, 102, 241, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {activeRun && agentStates.LotGenerator?.status === 'running' && (
                    <>
                      <path 
                        d={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Generator.x} ${nodePositions.Generator.y}`} 
                        fill="none" 
                        stroke="url(#indigo-glow)" 
                        strokeWidth="2.5" 
                        strokeDasharray="8, 120"
                        className="animate-dash"
                      />
                      <circle r="4.5" fill="#818CF8" style={{ filter: 'drop-shadow(0 0 6px #6366F1)' }}>
                        <animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${nodePositions.Analyzer.x} ${nodePositions.Analyzer.y} L ${nodePositions.Generator.x} ${nodePositions.Generator.y}`} />
                      </circle>
                    </>
                  )}

                  {/* 6. Generator -> LotsNode */}
                  <path 
                    d={`M ${nodePositions.Generator.x} ${nodePositions.Generator.y} L ${nodePositions.LotsNode.x} ${nodePositions.LotsNode.y}`} 
                    fill="none" 
                    stroke="rgba(14, 165, 233, 0.12)" 
                    strokeWidth="1.5" 
                  />
                  {(activeRun && agentStates.LotGenerator?.status === 'running') && (
                    <>
                      <path 
                        d={`M ${nodePositions.Generator.x} ${nodePositions.Generator.y} L ${nodePositions.LotsNode.x} ${nodePositions.LotsNode.y}`} 
                        fill="none" 
                        stroke="url(#cyan-glow)" 
                        strokeWidth="2" 
                        strokeDasharray="6, 80"
                        className="animate-dash"
                      />
                      <circle r="3.5" fill="#38BDF8" style={{ filter: 'drop-shadow(0 0 5px #0EA5E9)' }}>
                        <animateMotion dur="1.5s" repeatCount="indefinite" path={`M ${nodePositions.Generator.x} ${nodePositions.Generator.y} L ${nodePositions.LotsNode.x} ${nodePositions.LotsNode.y}`} />
                      </circle>
                    </>
                  )}
                </svg>

                {/* РЕНДЕР АБСОЛЮТНЫХ ДРАГ-ОБЪЕКТОВ НА КАРТЕ */}
                
                {/* 1. Base Node */}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'Base')}
                  onClick={() => setSelectedNode('Base')}
                  className={`absolute w-14 h-14 rounded-2xl flex items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'Base' 
                      ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/20' 
                      : 'border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-400/40 text-emerald-400'
                  }`}
                  style={{
                    left: `${nodePositions.Base.x - 28}px`,
                    top: `${nodePositions.Base.y - 28}px`,
                    cursor: draggingNode === 'Base' ? 'grabbing' : 'grab'
                  }}
                >
                  <Database className="w-5 h-5 pointer-events-none" />
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-24 text-center text-emerald-400/80 tracking-wide uppercase select-none pointer-events-none">Категории</span>
                </button>

                {/* 2. Selector Node */}
                {activeRun && agentStates.CategorySelector?.status === 'running' && (
                  <span 
                    className="absolute w-16 h-14 rounded-2xl border border-purple-400/40 animate-ping opacity-25 pointer-events-none"
                    style={{ left: `${nodePositions.Selector.x - 32}px`, top: `${nodePositions.Selector.y - 28}px` }}
                  />
                )}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'Selector')}
                  onClick={() => setSelectedNode('Selector')}
                  className={`absolute w-16 h-14 rounded-2xl flex flex-col items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'Selector' 
                      ? 'border-purple-400 bg-purple-500/10 shadow-lg shadow-purple-500/20' 
                      : 'border-purple-500/15 bg-purple-500/5 hover:border-purple-400/40 text-purple-400'
                  } ${activeRun && agentStates.CategorySelector?.status === 'running' ? 'animate-pulse border-purple-400' : ''}`}
                  style={{
                    left: `${nodePositions.Selector.x - 32}px`,
                    top: `${nodePositions.Selector.y - 28}px`,
                    cursor: draggingNode === 'Selector' ? 'grabbing' : 'grab'
                  }}
                >
                  {activeRun && agentStates.CategorySelector?.status === 'running' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400 pointer-events-none" />
                  ) : (
                    <Search className="w-5 h-5 text-purple-400 pointer-events-none" />
                  )}
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-28 text-center text-purple-400/80 tracking-wide uppercase select-none pointer-events-none">Selector</span>
                  {activeRun && agentStates.CategorySelector?.status === 'completed' && (
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 rounded-full w-4.5 h-4.5 text-[8px] font-extrabold flex items-center justify-center border border-slate-950 pointer-events-none select-none">✓</span>
                  )}
                </button>

                {/* 3. Memory Node */}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'Memory')}
                  onClick={() => setSelectedNode('Memory')}
                  className={`absolute w-14 h-14 rounded-2xl flex items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'Memory' 
                      ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20' 
                      : 'border-amber-500/15 bg-amber-500/5 hover:border-amber-400/40 text-amber-400'
                  }`}
                  style={{
                    left: `${nodePositions.Memory.x - 28}px`,
                    top: `${nodePositions.Memory.y - 28}px`,
                    cursor: draggingNode === 'Memory' ? 'grabbing' : 'grab'
                  }}
                >
                  <Brain className="w-5 h-5 text-amber-400 pointer-events-none" />
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-24 text-center text-amber-400/80 tracking-wide uppercase select-none pointer-events-none">Память ИИ</span>
                </button>

                {/* 4. Analyzer Node */}
                {activeRun && agentStates.ListingAnalyzer?.status === 'running' && (
                  <span 
                    className="absolute w-16 h-14 rounded-2xl border border-cyan-400/40 animate-ping opacity-25 pointer-events-none"
                    style={{ left: `${nodePositions.Analyzer.x - 32}px`, top: `${nodePositions.Analyzer.y - 28}px` }}
                  />
                )}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'Analyzer')}
                  onClick={() => setSelectedNode('Analyzer')}
                  className={`absolute w-16 h-14 rounded-2xl flex flex-col items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'Analyzer' 
                      ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
                      : 'border-cyan-500/15 bg-cyan-500/5 hover:border-cyan-400/40 text-cyan-400'
                  } ${activeRun && agentStates.ListingAnalyzer?.status === 'running' ? 'animate-pulse border-cyan-400' : ''}`}
                  style={{
                    left: `${nodePositions.Analyzer.x - 32}px`,
                    top: `${nodePositions.Analyzer.y - 28}px`,
                    cursor: draggingNode === 'Analyzer' ? 'grabbing' : 'grab'
                  }}
                >
                  {activeRun && agentStates.ListingAnalyzer?.status === 'running' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400 pointer-events-none" />
                  ) : (
                    <Cpu className="w-5 h-5 text-cyan-400 pointer-events-none" />
                  )}
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-28 text-center text-cyan-400/80 tracking-wide uppercase select-none pointer-events-none">Analyzer</span>
                  {activeRun && agentStates.ListingAnalyzer?.status === 'completed' && (
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 rounded-full w-4.5 h-4.5 text-[8px] font-extrabold flex items-center justify-center border border-slate-950 pointer-events-none select-none">✓</span>
                  )}
                </button>

                {/* 5. Generator Node */}
                {activeRun && agentStates.LotGenerator?.status === 'running' && (
                  <span 
                    className="absolute w-16 h-14 rounded-2xl border border-indigo-400/40 animate-ping opacity-25 pointer-events-none"
                    style={{ left: `${nodePositions.Generator.x - 32}px`, top: `${nodePositions.Generator.y - 28}px` }}
                  />
                )}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'Generator')}
                  onClick={() => setSelectedNode('Generator')}
                  className={`absolute w-16 h-14 rounded-2xl flex flex-col items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'Generator' 
                      ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/20' 
                      : 'border-indigo-500/15 bg-indigo-500/5 hover:border-indigo-400/40 text-indigo-400'
                  } ${activeRun && agentStates.LotGenerator?.status === 'running' ? 'animate-pulse border-indigo-400' : ''}`}
                  style={{
                    left: `${nodePositions.Generator.x - 32}px`,
                    top: `${nodePositions.Generator.y - 28}px`,
                    cursor: draggingNode === 'Generator' ? 'grabbing' : 'grab'
                  }}
                >
                  {activeRun && agentStates.LotGenerator?.status === 'running' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400 pointer-events-none" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-indigo-400 pointer-events-none" />
                  )}
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-28 text-center text-indigo-400/80 tracking-wide uppercase select-none pointer-events-none">Generator</span>
                  {activeRun && agentStates.LotGenerator?.status === 'completed' && (
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 rounded-full w-4.5 h-4.5 text-[8px] font-extrabold flex items-center justify-center border border-slate-950 pointer-events-none select-none">✓</span>
                  )}
                </button>

                {/* 6. Lots Node */}
                <button
                  onMouseDown={(e) => handleNodeMouseDown(e, 'LotsNode')}
                  onClick={() => setSelectedNode('LotsNode')}
                  className={`absolute w-14 h-14 rounded-2xl flex items-center justify-center border transition-shadow duration-300 ${
                    selectedNode === 'LotsNode' 
                      ? 'border-sky-400 bg-sky-500/10 shadow-lg shadow-sky-500/20' 
                      : 'border-sky-500/15 bg-sky-500/5 hover:border-sky-400/40 text-sky-400'
                  }`}
                  style={{
                    left: `${nodePositions.LotsNode.x - 28}px`,
                    top: `${nodePositions.LotsNode.y - 28}px`,
                    cursor: draggingNode === 'LotsNode' ? 'grabbing' : 'grab'
                  }}
                >
                  <Layers className="w-5 h-5 text-sky-400 pointer-events-none" />
                  <span className="text-[9px] font-extrabold block absolute -bottom-5 w-24 text-center text-sky-400/80 tracking-wide uppercase select-none pointer-events-none">Каталог ИИ</span>
                  {generatedLots.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-slate-950 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold flex items-center justify-center leading-none border border-slate-950 shadow-[0_0_8px_rgba(14,165,233,0.3)] pointer-events-none select-none">
                      {generatedLots.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Информационный лог о затратах в футере холста */}
            {activeRun && (
              <div className="flex items-center justify-between border-t border-white/5 p-4 text-[10px] text-slate-500 font-mono font-bold tracking-wide select-none">
                <div>СТАТУС СЕССИИ: <span className="text-white uppercase">{activeRun.status}</span></div>
                <div className="flex gap-4">
                  <div>ТОКЕНЫ: <span className="text-brand-cyan">{activeRun.total_cost_tokens.toLocaleString()}</span></div>
                  <div>EST. COST: <span className="text-emerald-400">${(activeRun.total_cost_tokens * 0.000002).toFixed(3)}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* ИНТЕГРИРОВАННЫЙ ТЕРМИНАЛ ЛОГОВ АГЕНТОВ */}
          <div className="bg-[#0A0D14]/80 border border-white/5 rounded-2xl overflow-hidden flex flex-col backdrop-blur-md transition-all duration-300 shadow-md">
            {/* Terminal Header */}
            <div className="px-4 py-2 bg-[#0C0F19] border-b border-white/5 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
                <span className="font-extrabold text-[10px] uppercase tracking-wider text-white">Журнал Мыслей ИИ</span>
                {activeRun && (
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-cyan"></span>
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-bold text-slate-500 font-mono">
                  {logs.length} СТРОК
                </span>
                <button
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                  className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  {isTerminalExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <AnimatePresence initial={false}>
              {isTerminalExpanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 180 }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div 
                    ref={logContainerRef}
                    className="h-full p-4 font-mono text-[10px] space-y-1.5 overflow-y-auto bg-[#070910] text-slate-300 select-all"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(255,255,255,0.05) transparent'
                    }}
                  >
                    {logs.length === 0 ? (
                      <div className="text-slate-600 text-center py-12 italic">
                        &gt;_ Ожидание когнитивного потока... Запустите анализ для вывода системного лога.
                      </div>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className="flex gap-2 items-start leading-relaxed hover:bg-white/[0.01] px-1 rounded transition-colors">
                          <span className="text-slate-600 shrink-0 font-semibold select-none">[{log.created_at || '14:21:05'}]</span>
                          <span className={`font-bold shrink-0 select-none ${
                            log.agent_name === 'CategorySelector' ? 'text-purple-400' :
                            log.agent_name === 'ListingAnalyzer' ? 'text-cyan-400' :
                            log.agent_name === 'LotGenerator' ? 'text-indigo-400' : 'text-slate-500'
                          }`}>
                            {log.agent_name}&gt;
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
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Terminal Footer mini line when collapsed */}
            {!isTerminalExpanded && logs.length > 0 && (
              <div className="px-4 py-1.5 bg-[#070910]/50 text-[9px] font-mono text-slate-500 truncate flex items-center gap-2 select-none border-t border-white/5">
                <span className="text-brand-cyan font-bold shrink-0">&gt; LATEST:</span>
                <span className="truncate">{logs[logs.length - 1].message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ: СВОДНЫЙ ДАШБОРД RMT И ДЕКОДЕР УЗЛОВ */}
        <div className="flex flex-col gap-4">
          {/* СВОДНЫЙ АНАЛИТИЧЕСКИЙ ДАШБОРД RMT */}
          <div className="bg-[#0A0D14]/80 border border-white/5 rounded-2xl p-5 space-y-4 backdrop-blur-md relative overflow-hidden shadow-md">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-cyan/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between border-b border-white/5 pb-3 select-none">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h3 className="font-extrabold text-[10px] text-white uppercase tracking-wider">RMT Аналитика Рынка</h3>
              </div>
              <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/10">Live</span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              {/* Потенциальный профит */}
              <div className="bg-[#0E121E]/60 border border-white/5 p-3 rounded-xl space-y-1 relative group hover:border-emerald-500/10 transition-all select-none">
                <span className="text-[9px] text-slate-500 font-extrabold uppercase block tracking-wider leading-none">Потенц. профит</span>
                <div className="text-sm font-extrabold text-emerald-400 leading-none py-1">
                  {(generatedLots.length > 0 ? generatedLots.reduce((sum, lot) => sum + (lot.price * lot.amount), 0) : 184500).toLocaleString()} ₽
                </div>
                <span className="text-[8px] text-emerald-500/80 font-bold block leading-none">🔥 Высокая маржа</span>
              </div>

              {/* Средний чек */}
              <div className="bg-[#0E121E]/60 border border-white/5 p-3 rounded-xl space-y-1 hover:border-brand-cyan/10 transition-all select-none">
                <span className="text-[9px] text-slate-500 font-extrabold uppercase block tracking-wider leading-none">Средний чек</span>
                <div className="text-sm font-extrabold text-white leading-none py-1">
                  {(generatedLots.length > 0 ? Math.round(generatedLots.reduce((sum, lot) => sum + lot.price, 0) / generatedLots.length) : 1450).toLocaleString()} ₽
                </div>
                <span className="text-[8px] text-slate-500 font-bold block leading-none">На 1 карточку лота</span>
              </div>

              {/* Парсинг листингов */}
              <div className="bg-[#0E121E]/60 border border-white/5 p-3 rounded-xl space-y-1 select-none">
                <span className="text-[9px] text-slate-500 font-extrabold uppercase block tracking-wider leading-none">Парсинг лотов</span>
                <div className="text-xs font-bold text-white flex items-center gap-1.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan animate-pulse shadow-[0_0_4px_#06B6D4]" />
                  {activeRun && agentStates.ListingAnalyzer?.status === 'running' ? "Активен (18/с)" : "Ожидание"}
                </div>
                <span className="text-[8px] text-slate-500 font-bold block leading-none">Скрейпинг FunPay</span>
              </div>

              {/* Затраты на ИИ */}
              <div className="bg-[#0E121E]/60 border border-white/5 p-3 rounded-xl space-y-1 select-none">
                <span className="text-[9px] text-slate-500 font-extrabold uppercase block tracking-wider leading-none">Затраты ИИ</span>
                <div className="text-xs font-extrabold text-brand-cyan py-1 leading-none">
                  {(activeRun ? activeRun.total_cost_tokens : 0).toLocaleString()} токенов
                </div>
                <span className="text-[8px] text-emerald-400 font-bold block leading-none">
                  Est: ${( (activeRun ? activeRun.total_cost_tokens : 0) * 0.000002 ).toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* КАРТОЧКА ДЕТАЛЕЙ УЗЛА И ВЕКТОРНОЙ ПАМЯТИ */}
          <div className="flex-grow flex flex-col">
            <AnimatePresence mode="wait">
              {selectedNode === 'Memory' ? (
                <motion.div
                  key="memory-viewer"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-[#0A0D14]/85 border border-amber-500/20 p-5 rounded-2xl backdrop-blur-md space-y-4 flex flex-col h-[320px] overflow-hidden shadow-lg shadow-amber-500/5"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-amber-400 animate-pulse" />
                      <div>
                        <h4 className="font-extrabold text-xs text-white">Векторный Анализатор</h4>
                        <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wide">Семантическая память</span>
                      </div>
                    </div>
                    <span className="text-[8px] font-extrabold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 font-mono">
                      8192-DIM
                    </span>
                  </div>

                  {/* Поиск и фильтры памяти */}
                  <div className="space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Поиск по инсайтам..."
                        value={searchMemoryQuery}
                        onChange={(e) => setSearchMemoryQuery(e.target.value)}
                        className="w-full bg-[#0E121E] border border-white/5 rounded-xl pl-8 pr-3 py-2 text-[10px] font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/30 transition-all h-8"
                      />
                    </div>
                    
                    {/* Фильтры категорий */}
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 text-[9px] font-bold select-none">
                      {['Все', 'Валюта', 'Услуги', 'Аккаунты', 'Предметы'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setMemoryCategoryFilter(cat)}
                          className={`px-2 py-1 rounded transition-all shrink-0 cursor-pointer ${
                            memoryCategoryFilter === cat 
                              ? 'bg-amber-400 text-slate-950 font-extrabold' 
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Список инсайтов */}
                  <div className="flex-grow overflow-y-auto pr-1 space-y-2.5 select-text" style={{ scrollbarWidth: 'none' }}>
                    {filteredInsights.length === 0 ? (
                      <div className="text-slate-600 text-center py-10 text-[10px] italic select-none">
                        Ничего не найдено по вашему запросу.
                      </div>
                    ) : (
                      filteredInsights.map(ins => (
                        <div key={ins.id} className="bg-[#0E121E]/60 border border-white/5 p-3 rounded-xl space-y-1.5 hover:border-amber-500/10 transition-all text-left">
                          <div className="flex justify-between items-center text-[8px] font-extrabold font-mono text-slate-500 uppercase">
                            <span className="text-white">{ins.game} • {ins.category}</span>
                            <span className="text-amber-400">{ins.similarity} MATCH</span>
                          </div>
                          <p className="text-[10px] leading-relaxed text-slate-300 font-sans italic">
                            "{ins.text}"
                          </p>
                          <div className="flex justify-between items-center text-[8px] font-mono text-slate-500">
                            <span>{ins.date}</span>
                            <span className="text-emerald-400/80 font-bold">{ins.trend}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              ) : selectedNodeInfo ? (
                <motion.div
                  key={selectedNode}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={`border p-5 rounded-2xl space-y-4 relative flex flex-col h-[320px] justify-between backdrop-blur-md shadow-lg ${selectedNodeInfo.color} text-left`}
                >
                  <button 
                    onClick={() => setSelectedNode(null)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        {selectedNodeInfo.icon}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-xs text-white">{selectedNodeInfo.title}</h3>
                        <span className="text-[9px] font-extrabold block text-slate-500 uppercase tracking-wide">КОГНИТИВНЫЙ КОМПОНЕНТ</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      {selectedNodeInfo.desc}
                    </p>
                  </div>

                  {selectedNodeInfo.status && (
                    <div className="border-t border-white/5 pt-4 space-y-2 text-[10px] text-slate-400 font-semibold tracking-wide font-mono">
                      <div className="flex justify-between">
                        <span>Статус агента:</span>
                        <span className={`font-bold capitalize text-xs ${
                          selectedNodeInfo.status === 'completed' ? 'text-emerald-400' :
                          selectedNodeInfo.status === 'running' ? 'text-brand-cyan animate-pulse' : 'text-slate-500'
                        }`}>
                          {selectedNodeInfo.status === 'completed' ? '✓ Готов к работе' :
                           selectedNodeInfo.status === 'running' ? '● Выполняет работу...' : 'Ожидание запуска'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Текущая задача:</span>
                        <span className="text-white font-extrabold text-right max-w-[170px] truncate">{selectedNodeInfo.task}</span>
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
                  key="default-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-[#0A0D14]/30 border border-white/5 p-6 rounded-2xl text-center text-xs text-slate-500 flex flex-col justify-center h-[320px] select-none shadow-inner"
                >
                  <Info className="w-6 h-6 mx-auto mb-2 text-slate-600 animate-bounce" />
                  <p className="font-extrabold text-slate-400 mb-1 tracking-wider uppercase text-[10px]">Когнитивная Карта</p>
                  <p className="text-[10px] leading-relaxed max-w-[200px] mx-auto text-slate-500 font-semibold">
                    Кликните по любому узлу или линии связи на холсте слева, чтобы детально разобрать роли ИИ и получить доступ к Векторной Памяти.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* РАЗДЕЛ 2: ИСТОРИЯ ЗАПУСКОВ (ИСТОРИЯ АНАЛИЗА) */}
      <div className="bg-[#0A0D14] border border-white/5 rounded-2xl p-5 shadow-md">
        <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2 select-none">
          <TrendingUp className="w-4 h-4 text-brand-cyan" />
          История и архивы когнитивного анализа
        </h2>
        <div className="flex gap-2.5 overflow-x-auto pb-2.5 no-scrollbar select-none">
          {pastRuns.length === 0 ? (
            <div className="text-slate-600 text-xs py-4 italic">Архивы запусков пусты. Запустите анализ выше.</div>
          ) : (
            pastRuns.map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectPastRun(run)}
                className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition-all duration-300 cursor-pointer ${
                  selectedPastRunId === run.id || (activeRun && activeRun.id === run.id)
                    ? 'border-brand-cyan bg-brand-cyan/5 text-white shadow-[0_0_10px_rgba(6,182,212,0.05)]' 
                    : 'border-white/5 bg-[#0E121E] text-slate-400 hover:border-white/10 hover:text-white'
                }`}
              >
                <div className="text-[10px] font-extrabold text-slate-500 font-mono uppercase tracking-wider">ЗАПУСК #{run.id}</div>
                <div className="text-xs font-extrabold text-white mb-1">{run.mode === 'auto' ? 'Авто-анализ' : 'Популярные'}</div>
                <div className="flex gap-3 text-[9px] font-bold text-slate-500 font-mono">
                  <span>КАТ: {run.limit_categories}</span>
                  <span>ТОК: {run.total_cost_tokens.toLocaleString()}</span>
                  <span className={`${
                    run.status === 'completed' ? 'text-emerald-400' :
                    run.status === 'running' ? 'text-brand-cyan animate-pulse' : 'text-red-400'
                  }`}>{run.status === 'completed' ? 'УСПЕШНО' : run.status === 'running' ? 'В ПРОЦЕССЕ' : 'СБОЙ'}</span>
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
            className="space-y-4 text-left"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5 select-none">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400 animate-pulse" />
                Сгенерированный AI-каталог прибыльных товаров ({generatedLots.length} позиций)
              </h2>
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-0.5 rounded">Экспорт</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedLots.map((lot) => {
                const isExpanded = expandedLotId === lot.id;
                const currentCardTab = activeLotCardTabs[lot.id] || 'preview';
                
                return (
                  <div 
                    key={lot.id} 
                    className="bg-[#0A0D14] border border-white/5 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-white/10 hover:shadow-lg hover:shadow-emerald-500/[0.01] transition-all duration-300 group"
                  >
                    {/* Header */}
                    <div className="p-5 space-y-3 flex-grow">
                      <div className="flex items-center justify-between select-none">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest">
                          {lot.game_name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          {lot.subcategory_name}
                        </span>
                      </div>
                      
                      <h3 className="font-extrabold text-xs text-white leading-snug group-hover:text-brand-cyan transition-colors">
                        {lot.title}
                      </h3>

                      {/* AI Reasoning */}
                      {lot.ai_reasoning && (
                        <div className="p-3 bg-brand-cyan/5 border border-brand-cyan/10 rounded-xl text-[10px] italic text-brand-cyan leading-relaxed text-left select-none">
                          <strong>AI ОБОСНОВАНИЕ:</strong> {lot.ai_reasoning}
                        </div>
                      )}

                      {/* TABS INTERFACE WHEN EXPANDED */}
                      {isExpanded && (
                        <div className="flex border-b border-white/5 pb-2 text-[10px] font-extrabold gap-3.5 pt-1.5 select-none">
                          <button
                            onClick={() => setActiveLotCardTabs(prev => ({ ...prev, [lot.id]: 'preview' }))}
                            className={`pb-1 border-b transition-all flex items-center gap-1.5 cursor-pointer ${
                              currentCardTab === 'preview' 
                                ? 'border-brand-cyan text-brand-cyan font-extrabold' 
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Превью FunPay
                          </button>
                          <button
                            onClick={() => setActiveLotCardTabs(prev => ({ ...prev, [lot.id]: 'params' }))}
                            className={`pb-1 border-b transition-all flex items-center gap-1.5 cursor-pointer ${
                              currentCardTab === 'params' 
                                ? 'border-brand-cyan text-brand-cyan font-extrabold' 
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Параметры
                          </button>
                          <button
                            onClick={() => setActiveLotCardTabs(prev => ({ ...prev, [lot.id]: 'seo' }))}
                            className={`pb-1 border-b transition-all flex items-center gap-1.5 cursor-pointer ${
                              currentCardTab === 'seo' 
                                ? 'border-brand-cyan text-brand-cyan font-extrabold' 
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            SEO-Анализ
                          </button>
                        </div>
                      )}

                      {/* TAB CONTENTS */}
                      <div className="text-[11px] text-slate-400">
                        {isExpanded ? (
                          <div className="pt-2">
                            {currentCardTab === 'preview' && (
                              <div className="space-y-3 pt-1">
                                <div className="bg-[#070910] border border-white/5 rounded-xl p-4 space-y-3.5 font-sans">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-white/5 select-none">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                      <span className="font-extrabold text-emerald-400">Продавец онлайн</span>
                                    </div>
                                    <div className="flex items-center gap-1 font-semibold">
                                      <span>Сделок: <strong className="text-white">4,812</strong></span>
                                      <span className="text-amber-400 font-bold">★★★★★ 5.0</span>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-1 text-left">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">{lot.game_name} • {lot.subcategory_name}</span>
                                    <h4 className="text-xs font-bold text-white leading-snug">{lot.title}</h4>
                                  </div>

                                  <p className="whitespace-pre-line leading-relaxed text-slate-300 text-[10px] p-3.5 bg-white/[0.01] border border-white/5 rounded-xl text-left max-h-[160px] overflow-y-auto no-scrollbar font-sans select-text">
                                    {lot.description}
                                  </p>

                                  <div className="flex items-center justify-between pt-2.5 border-t border-white/5 select-none text-left">
                                    <div>
                                      <span className="text-[8px] text-slate-500 font-bold uppercase block leading-none">Цена на сайте</span>
                                      <span className="text-sm font-extrabold text-emerald-400 leading-none block mt-1">{lot.price} ₽</span>
                                    </div>
                                    <button 
                                      disabled
                                      className="py-1.5 px-5 bg-emerald-500 text-slate-950 font-extrabold text-[10px] rounded-lg shadow-md shadow-emerald-500/10 transition-all select-none uppercase tracking-wider cursor-not-allowed opacity-90"
                                    >
                                      Купить
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {currentCardTab === 'params' && (
                              <div className="space-y-2 pt-1 text-left select-all">
                                <h4 className="font-extrabold text-white text-[9px] uppercase tracking-wider">Параметры лота FunPay API:</h4>
                                {lot.fields_json && Object.keys(lot.fields_json).length > 0 ? (
                                  <div className="grid grid-cols-1 gap-1 text-[10px] font-mono p-3.5 bg-slate-950/70 rounded-xl border border-white/5 leading-relaxed">
                                    {Object.entries(lot.fields_json).map(([key, val]) => (
                                      <div key={key} className="flex justify-between gap-4 border-b border-white/5 py-1 last:border-0">
                                        <span className="text-slate-500 shrink-0 truncate max-w-[150px]">{key}:</span>
                                        <span className="text-brand-cyan font-semibold text-right truncate max-w-[240px]">{String(val)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-4 text-center text-slate-600 italic text-[10px] bg-[#070910] rounded-xl border border-white/5">
                                    Дополнительные спецификации отсутствуют для этой категории. Лот использует плоское описание.
                                  </div>
                                )}
                              </div>
                            )}

                            {currentCardTab === 'seo' && (
                              <div className="space-y-3.5 pt-1 text-left select-none">
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                  <span className="uppercase tracking-wider">SEO привлекательность</span>
                                  <span className="text-brand-cyan font-mono">94/100</span>
                                </div>
                                <div className="w-full bg-[#0E121E] h-1.5 rounded-full overflow-hidden border border-white/5">
                                  <div className="bg-gradient-to-r from-brand-cyan to-emerald-400 h-full rounded-full" style={{ width: '94%' }} />
                                </div>

                                <div className="space-y-2.5 text-[10px] font-sans">
                                  <div className="flex items-start gap-2 text-slate-300">
                                    <span className="text-emerald-400 shrink-0 mt-0.5">✔</span>
                                    <div>
                                      <strong className="text-white">Кликабельный Заголовок:</strong> Содержит триггер демпинга и привлекающий внимание эмодзи в префиксе.
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2 text-slate-300">
                                    <span className="text-emerald-400 shrink-0 mt-0.5">✔</span>
                                    <div>
                                      <strong className="text-white">Плотность ключей:</strong> Текст полностью оптимизирован под релевантные поисковые запросы.
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2 text-slate-300">
                                    <span className="text-emerald-400 shrink-0 mt-0.5">✔</span>
                                    <div>
                                      <strong className="text-white">Правила автовыдачи:</strong> Четкая разметка условий мгновенной доставки интегрирована в первую строку.
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2 text-slate-300 border-t border-white/5 pt-2.5">
                                    <span className="text-brand-cyan shrink-0 mt-0.5">ℹ</span>
                                    <div className="text-slate-400 italic">
                                      Рекомендуется публиковать в пиковые интервалы активности FunPay: <span className="text-white font-semibold">17:00 - 23:00 MSK</span>.
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="line-clamp-3 leading-relaxed text-left font-sans select-text">{lot.description}</p>
                        )}
                        
                        <button
                          onClick={() => setExpandedLotId(isExpanded ? null : lot.id)}
                          className="text-brand-cyan font-bold hover:underline block mt-2 text-[10px] cursor-pointer select-none"
                        >
                          {isExpanded ? "Свернуть" : "Показать полностью..."}
                        </button>
                      </div>
                    </div>

                    {/* Footer / Action */}
                    <div className="px-5 py-4 border-t border-white/5 bg-[#0E121E]/30 flex items-center justify-between select-none">
                      <div className="flex items-center gap-4 text-left">
                        <div>
                          <span className="text-[9px] text-slate-500 font-extrabold uppercase block leading-none tracking-wider">Реком. цена</span>
                          <span className="text-sm font-extrabold text-emerald-400 leading-none block mt-1.5 font-mono">{lot.price} ₽</span>
                        </div>
                        <div className="border-l border-white/5 pl-4">
                          <span className="text-[9px] text-slate-500 font-extrabold uppercase block leading-none tracking-wider">Количество</span>
                          <span className="text-xs font-extrabold text-white leading-none block mt-1.5 font-mono">{lot.amount} шт.</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setSimulatingLot(lot)}
                        disabled={exportingId === lot.id}
                        className="py-1.5 px-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-[10px] rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/5 hover:shadow-emerald-500/10 cursor-pointer border border-emerald-400/20 uppercase tracking-wider"
                      >
                        {exportingId === lot.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 font-extrabold" />
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

      {/* 🚀 ИНТЕРАКТИВНЫЙ СИМУЛЯТОР "ПУБЛИКАЦИЯ В 1 КЛИК" */}
      <AnimatePresence>
        {simulatingLot && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0A0D14] border border-white/5 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl shadow-brand-cyan/5 flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#0C0F19] select-none">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-5 h-5 text-brand-cyan animate-spin" />
                  <div className="text-left">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider leading-none">Роботизированный Эмулятор FunPay</h3>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1 uppercase tracking-wider">Стелс-режим взаимодействия с API</span>
                  </div>
                </div>
                <button
                  onClick={() => setSimulatingLot(null)}
                  className="p-1.5 bg-white/5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Simulated Browser URL bar */}
              <div className="bg-[#070910] px-4 py-2 border-b border-white/5 flex items-center gap-2 text-[10px] font-mono select-none">
                <span className="flex gap-1 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </span>
                <div className="bg-[#0E121E] px-3 py-1 rounded-lg text-slate-400 flex-grow text-left flex items-center gap-1.5 border border-white/5">
                  <span className="text-emerald-500 font-bold">https://</span>
                  <span>funpay.com/lots/add?node_id=1483</span>
                </div>
              </div>

              {/* Simulator Content */}
              <div className="p-6 space-y-5">
                <div className="space-y-1.5 select-none">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 font-mono">
                    <span className="uppercase tracking-wider">ПРОГРЕСС ЭМУЛЯЦИИ API</span>
                    <span className="text-brand-cyan">{simProgress}%</span>
                  </div>
                  <div className="w-full bg-[#0E121E] h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-gradient-to-r from-brand-cyan to-brand-blue h-full rounded-full transition-all duration-300"
                      style={{ width: `${simProgress}%` }}
                    />
                  </div>
                </div>

                {/* Steps Timeline */}
                <div className="space-y-4">
                  {SIMULATION_STEPS.map((step, idx) => {
                    const isCompleted = simStep > idx;
                    const isActive = simStep === idx;

                    return (
                      <div 
                        key={idx} 
                        className={`flex gap-3.5 transition-all duration-300 ${
                          isActive ? 'opacity-100 scale-[1.01]' : isCompleted ? 'opacity-50' : 'opacity-25'
                        }`}
                      >
                        <div className="flex flex-col items-center shrink-0 select-none">
                          <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[9px] font-extrabold border transition-all ${
                            isCompleted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                            isActive ? 'bg-brand-cyan/20 border-brand-cyan/50 text-brand-cyan shadow-[0_0_8px_rgba(6,182,212,0.3)] animate-pulse' :
                            'bg-[#0E121E] border-white/5 text-slate-600'
                          }`}>
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          {idx < SIMULATION_STEPS.length - 1 && (
                            <div className={`w-[1px] h-6 border-l transition-all ${
                              isCompleted ? 'border-emerald-500/20' : 'border-white/5'
                            }`} />
                          )}
                        </div>
                        <div className="space-y-0.5 text-left">
                          <h4 className={`text-[10px] font-extrabold uppercase tracking-widest transition-colors ${
                            isActive ? 'text-white' : isCompleted ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {step.label}
                          </h4>
                          {isActive && (
                            <p className="text-[10px] text-slate-400 leading-relaxed font-sans font-medium">
                              {step.desc}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-5 border-t border-white/5 bg-[#0E121E]/30 flex justify-between items-center shrink-0 select-none">
                <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                  {simStep === 6 ? "СОХРАНЕНО" : "АКТИВНАЯ ЭМУЛЯЦИЯ"}
                </span>
                
                <div className="flex gap-2">
                  {simStep < 6 ? (
                    <>
                      <button
                        onClick={handleSkipSimulation}
                        className="px-4 py-2 rounded-xl text-[10px] font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer border border-white/5 hover:border-white/10"
                      >
                        Пропустить
                      </button>
                      <button
                        disabled
                        className="px-4 py-2 rounded-xl text-[10px] font-bold bg-[#0E121E] text-slate-600 border border-white/5 flex items-center gap-1.5"
                      >
                        <Loader2 className="w-3 h-3 animate-spin text-brand-cyan" />
                        Печать...
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setSimulatingLot(null)}
                      className="px-5 py-2 rounded-xl text-[10px] font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all cursor-pointer border border-emerald-400/20 uppercase tracking-wide"
                    >
                      Закрыть и выйти
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
