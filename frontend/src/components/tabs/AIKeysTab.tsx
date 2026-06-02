import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, 
  BarChart3, Cpu, Coins, CheckCircle2, XCircle, 
  ChevronDown, ChevronUp, Copy, Check, Calendar,
  History as HistoryIcon
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { AIKey } from '../../types';

interface AIModelStats {
  model: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
}

interface AIKeyStats {
  key_id: number | null;
  key_value: string;
  total_calls: number;
  error_count: number;
  is_active: boolean;
  total_tokens: number;
  estimated_cost_usd: number;
}

interface GeneralAIStats {
  total_requests: number;
  success_requests: number;
  error_requests: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  models_stats: AIModelStats[];
  keys_stats: AIKeyStats[];
}

interface AILog {
  id: number;
  created_at: string;
  key_id: number | null;
  model: string;
  action_type: string;
  prompt: string;
  response: string | null;
  status: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_message: string | null;
  account_id: number | null;
  estimated_cost_usd: number;
}

interface MessageBubble {
  role: 'system' | 'buyer' | 'assistant';
  text: string;
}

export default function AIKeysTab() {
  const { token } = useAppContext();
  
  const [activeSubTab, setActiveSubTab] = useState<'keys' | 'stats'>('keys');
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [aiKeysBulkText, setAiKeysBulkText] = useState('');
  const [loading, setLoading] = useState(false);

  // Состояния для статистики и логов
  const [stats, setStats] = useState<GeneralAIStats | null>(null);
  const [logs, setLogs] = useState<AILog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsLimit] = useState(15);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchAIKeys();
    }
  }, [token]);

  useEffect(() => {
    if (activeSubTab === 'stats' && token) {
      fetchStats();
      fetchLogs(true);
    }
  }, [activeSubTab, token]);

  const fetchAIKeys = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAiKeys(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async (reset = false) => {
    setLoadingLogs(true);
    const newOffset = reset ? 0 : logsOffset;
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/logs?limit=${logsLimit}&offset=${newOffset}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (reset) {
          setLogs(data.logs);
          setLogsOffset(logsLimit);
        } else {
          setLogs(prev => [...prev, ...data.logs]);
          setLogsOffset(prev => prev + logsLimit);
        }
        setTotalLogs(data.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleImportAIKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keys_string: aiKeysBulkText })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchAIKeys();
        setAiKeysBulkText('');
      } else {
        alert(data.detail || 'Сбой импорта');
      }
    } catch {
      alert('Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAIKey = async (id: number, active: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/${id}/toggle?active=${active}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAIKeys();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAIKey = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAIKeys();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Вы действительно хотите удалить ВСЮ историю логов взаимодействия с ИИ? Это действие необратимо.')) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/logs/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs([]);
        setTotalLogs(0);
        setLogsOffset(0);
        fetchStats();
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка при очистке логов.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  // Метод парсинга промпта для структурированного чат-диалога
  const parsePromptToBubbles = (promptText: string): MessageBubble[] => {
    const bubbles: MessageBubble[] = [];
    
    // 1. Поиск системного промпта
    const systemMatch = promptText.match(/\[System Prompt\]\n([\s\S]*?)(?=\n\n\[History\]|$)/);
    if (systemMatch && systemMatch[1]) {
      bubbles.push({ role: 'system', text: systemMatch[1].trim() });
    }
    
    // 2. Поиск истории диалога
    const historyMatch = promptText.match(/\[History\]\n([\s\S]*)$/);
    if (historyMatch && historyMatch[1]) {
      const historyLines = historyMatch[1].trim().split('\n');
      historyLines.forEach(line => {
        if (line.startsWith('buyer:')) {
          bubbles.push({ role: 'buyer', text: line.replace('buyer:', '').trim() });
        } else if (line.startsWith('assistant:')) {
          bubbles.push({ role: 'assistant', text: line.replace('assistant:', '').trim() });
        } else if (line.trim() !== "") {
          bubbles.push({ role: 'buyer', text: line.trim() });
        }
      });
    } else if (!systemMatch) {
      // Иной формат (например, классификация отзывов или аудит)
      bubbles.push({ role: 'system', text: promptText.trim() });
    }
    
    return bubbles;
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'chat_reply': return 'Ответ в чате';
      case 'profile_audit': return 'Аудит профиля';
      case 'review_classification': return 'Анализ отзывов';
      default: return type;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
    >
      {/* Кнопки переключения под-вкладок */}
      <div className="flex bg-slate-950/40 border border-white/5 p-1 rounded-2xl max-w-xs sm:max-w-sm relative z-10">
        <button
          onClick={() => setActiveSubTab('keys')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold transition-all duration-300 ${activeSubTab === 'keys' ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20' : 'text-slate-400 hover:text-white'}`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Глобальные ключи</span>
        </button>
        <button
          onClick={() => setActiveSubTab('stats')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold transition-all duration-300 ${activeSubTab === 'stats' ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20' : 'text-slate-400 hover:text-white'}`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Аналитика и логи</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'keys' ? (
          <motion.div
            key="keys-tab"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="p-5 sm:p-6 rounded-3xl glow-card relative"
            onMouseMove={handleMouseMove}
          >
            <div className="glow-bg rounded-3xl" />
            <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-cyan" />
              <span>Управление глобальными ключами ИИ (Fireworks API)</span>
            </h2>

            <form onSubmit={handleImportAIKeys} className="space-y-3 relative z-10 mb-6">
              <textarea 
                value={aiKeysBulkText}
                onChange={(e) => setAiKeysBulkText(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40 placeholder:text-slate-600"
                placeholder="Вставьте ключи Fireworks API. Поддерживается пакетный ввод (через запятые или переносы строк)..."
                rows={4}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 py-2.5 px-6 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Пакетно импортировать ключи</span>
              </button>
            </form>

            {/* Таблица API ключей */}
            <div className="space-y-2 relative z-10 max-h-[400px] overflow-y-auto">
              {aiKeys.length === 0 ? (
                <div className="text-slate-500 text-center py-6 text-xs">Нет добавленных ключей</div>
              ) : (
                aiKeys.map(keyObj => (
                  <div key={keyObj.id} className="p-3.5 bg-slate-950/20 border border-white/5 rounded-2xl flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0">
                      <code className="text-brand-cyan block truncate font-mono text-[11px] sm:text-xs">{keyObj.key_value}</code>
                      <div className="text-slate-400 mt-1 flex gap-4 text-[10px]">
                        <span>Запросов: <b>{keyObj.total_calls}</b></span>
                        <span>Ошибок: <b>{keyObj.error_count}</b></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleToggleAIKey(keyObj.id, !keyObj.is_active)}
                      >
                        {keyObj.is_active ? (
                          <ToggleRight className="w-7 h-7 text-brand-cyan filter drop-shadow-[0_0_5px_rgba(0,242,254,0.3)]" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-slate-600" />
                        )}
                      </motion.button>
                      
                      <button
                        onClick={() => handleDeleteAIKey(keyObj.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="stats-tab"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Карточки KPI */}
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-950/40 border border-white/5 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-3 right-3 p-1.5 bg-brand-cyan/10 rounded-xl text-brand-cyan">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Всего запросов</div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-1">{stats.total_requests}</div>
                  <div className="text-[10px] mt-1 flex items-center gap-1">
                    <span className="text-emerald-400 font-semibold">
                      {stats.total_requests > 0 
                        ? `${(stats.success_requests / stats.total_requests * 100).toFixed(1)}%` 
                        : '0%'}
                    </span>
                    <span className="text-slate-500">успешно</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-white/5 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-3 right-3 p-1.5 bg-brand-cyan/10 rounded-xl text-brand-cyan">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Потрачено токенов</div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-1">
                    {stats.total_tokens >= 1000000 
                      ? `${(stats.total_tokens / 1000000).toFixed(2)}M` 
                      : stats.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1 block truncate">
                    Вх: {stats.prompt_tokens.toLocaleString()} | Исх: {stats.completion_tokens.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-white/5 rounded-3xl relative overflow-hidden ring-1 ring-brand-cyan/20">
                  <div className="absolute top-3 right-3 p-1.5 bg-brand-cyan/10 rounded-xl text-brand-cyan">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Ориент. затраты</div>
                  <div className="text-xl sm:text-2xl font-bold text-brand-cyan filter drop-shadow-[0_0_8px_rgba(0,242,254,0.2)] mt-1">
                    ${stats.estimated_cost_usd.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <span>Fireworks AI тарифы</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-white/5 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-3 right-3 p-1.5 bg-brand-cyan/10 rounded-xl text-brand-cyan">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Активные ключи</div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-1">
                    {stats.keys_stats.filter(k => k.is_active).length} / {stats.keys_stats.length}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Включено в ротацию
                  </div>
                </div>
              </div>
            )}

            {/* Распределение по моделям и ключам */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Статистика моделей */}
              <div className="p-4 sm:p-5 bg-slate-950/20 border border-white/5 rounded-3xl">
                <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-brand-cyan" />
                  <span>Статистика по моделям</span>
                </h3>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {!stats || stats.models_stats.length === 0 ? (
                    <div className="text-slate-500 text-center py-6 text-[11px]">Нет данных по использованию моделей</div>
                  ) : (
                    stats.models_stats.map((m, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-950/40 border border-white/5 rounded-xl flex justify-between items-center text-[11px] gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-white block truncate">{m.model.split('/').pop()}</span>
                          <span className="text-slate-400 text-[10px]">
                            Вызовов: <b className="text-slate-300">{m.total_calls}</b> ({m.success_calls} упешных)
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-slate-300 font-semibold">{m.total_tokens.toLocaleString()} токенов</div>
                          <div className="text-[10px] text-brand-cyan">${m.estimated_cost_usd.toFixed(4)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Статистика ключей */}
              <div className="p-4 sm:p-5 bg-slate-950/20 border border-white/5 rounded-3xl">
                <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-brand-cyan" />
                  <span>Статистика по ключам</span>
                </h3>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {!stats || stats.keys_stats.length === 0 ? (
                    <div className="text-slate-500 text-center py-6 text-[11px]">Ключи не использовались</div>
                  ) : (
                    stats.keys_stats.map((k, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-950/40 border border-white/5 rounded-xl flex justify-between items-center text-[11px] gap-2">
                        <div className="min-w-0">
                          <code className="font-mono text-brand-cyan block truncate">{k.key_value}</code>
                          <span className="text-slate-400 text-[10px] flex items-center gap-1">
                            Вызовов: <b className="text-slate-300">{k.total_calls}</b>
                            <span className="text-slate-500">|</span>
                            <span>Статус: </span>
                            {k.is_active ? (
                              <span className="text-emerald-400 font-medium">активен</span>
                            ) : (
                              <span className="text-red-400 font-medium">отключен</span>
                            )}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-slate-300 font-semibold">{k.total_tokens.toLocaleString()} токенов</div>
                          <div className="text-[10px] text-brand-cyan">${k.estimated_cost_usd.toFixed(4)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Раздел детальных логов (Аккордеон) */}
            <div className="p-5 sm:p-6 bg-slate-950/20 border border-white/5 rounded-3xl space-y-4">
              <div className="flex justify-between items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <HistoryIcon className="w-4 h-4 text-brand-cyan" />
                    <span>История взаимодействия с ИИ</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">В хронологическом порядке. Логи хранятся 14 дней</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { fetchStats(); fetchLogs(true); }}
                    className="p-1.5 bg-slate-950/40 hover:bg-slate-950/80 border border-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                    title="Обновить список"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleClearLogs}
                    disabled={logs.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 hover:border-red-500/20 text-red-400 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-[10px] font-semibold transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Очистить логи</span>
                  </button>
                </div>
              </div>

              {/* Список логов */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {logs.length === 0 && !loadingLogs ? (
                  <div className="text-slate-500 text-center py-12 text-xs">История логов ИИ пуста</div>
                ) : (
                  logs.map(log => {
                    const isExpanded = expandedLogId === log.id;
                    const logBubbles = parsePromptToBubbles(log.prompt);
                    const isSuccess = log.status === 'success';
                    const dateObj = new Date(log.created_at);
                    const formattedDate = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                    return (
                      <div key={log.id} className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950/10">
                        {/* Краткая строка */}
                        <div 
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className={`p-3.5 flex items-center justify-between text-[11px] gap-3 cursor-pointer transition-colors duration-200 ${isExpanded ? 'bg-slate-950/40 border-b border-white/5' : 'hover:bg-slate-950/30'}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSuccess ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 filter drop-shadow-[0_0_3px_rgba(52,211,153,0.2)]" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400 shrink-0 filter drop-shadow-[0_0_3px_rgba(248,113,113,0.2)]" />
                            )}
                            
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-300 font-mono text-[10px]">{formattedDate}</span>
                                <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 rounded text-[9px] font-semibold uppercase">{getActionTypeLabel(log.action_type)}</span>
                                <span className="font-mono text-slate-400 truncate text-[10px] max-w-[120px]">{log.model.split('/').pop()}</span>
                              </div>
                              <div className="text-slate-500 text-[10px] mt-0.5 truncate max-w-[280px] sm:max-w-[450px]">
                                {log.response || log.error_message || 'Без ответа'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right text-[10px] hidden sm:block">
                              <span className="text-slate-400">{log.total_tokens} токенов</span>
                              <span className="text-brand-cyan/80 block font-mono text-[9px]">${log.estimated_cost_usd.toFixed(4)}</span>
                            </div>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </div>

                        {/* Раскрывающаяся панель деталей (Чат-стиль) */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="p-4 bg-slate-950/30 space-y-4 text-xs border-t border-white/5"
                            >
                              {/* Мета-данные в развернутом виде */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] p-2.5 bg-slate-950/40 rounded-xl border border-white/5">
                                <div>
                                  <span className="text-slate-500 block">ID Лога</span>
                                  <span className="text-slate-300 font-mono">#{log.id}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Токены вызова</span>
                                  <span className="text-slate-300">
                                    {log.total_tokens} <span className="text-slate-500">({log.prompt_tokens} вх | {log.completion_tokens} исх)</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Примерная стоимость</span>
                                  <span className="text-brand-cyan font-mono">${log.estimated_cost_usd.toFixed(6)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Время вызова</span>
                                  <span className="text-slate-300 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-500" />
                                    <span>{new Date(log.created_at).toLocaleString()}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Чат-контейнер для Промпта и Истории */}
                              <div className="space-y-3.5">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Лог запроса (Промпт)</div>
                                <div className="space-y-2.5">
                                  {logBubbles.map((bubble, bIdx) => (
                                    <div key={bIdx} className="space-y-1">
                                      <div className="flex justify-between items-center text-[9px] px-1">
                                        <span className={`font-bold ${
                                          bubble.role === 'system' ? 'text-violet-400' :
                                          bubble.role === 'buyer' ? 'text-blue-400' : 'text-brand-cyan'
                                        }`}>
                                          {bubble.role === 'system' ? 'СИСТЕМНЫЙ ПРОМПТ' :
                                           bubble.role === 'buyer' ? 'ПОКУПАТЕЛЬ / ВВОД' : 'ИИ-АССИСТЕНТ'}
                                        </span>
                                        <button 
                                          onClick={() => copyToClipboard(bubble.text, `b-${log.id}-${bIdx}`)}
                                          className="text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                          {copiedTextId === `b-${log.id}-${bIdx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                      </div>
                                      <div className={`p-3 rounded-2xl text-[11px] font-sans whitespace-pre-wrap leading-relaxed border ${
                                        bubble.role === 'system' ? 'bg-violet-950/10 border-violet-500/10 text-violet-100/90' :
                                        bubble.role === 'buyer' ? 'bg-blue-950/10 border-blue-500/10 text-blue-100/90' : 'bg-brand-cyan/5 border-brand-cyan/10 text-cyan-50/90'
                                      }`}>
                                        {bubble.text}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Ответ ИИ или Ошибка */}
                              <div className="space-y-1.5 pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
                                  <span className={isSuccess ? 'text-emerald-400' : 'text-red-400'}>
                                    {isSuccess ? 'Итоговый ответ ИИ' : 'Ошибка ИИ при вызове'}
                                  </span>
                                  {isSuccess && log.response && (
                                    <button 
                                      onClick={() => copyToClipboard(log.response!, `resp-${log.id}`)}
                                      className="text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                      {copiedTextId === `resp-${log.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>

                                {isSuccess ? (
                                  <div className="p-3.5 bg-emerald-950/5 border border-emerald-500/10 text-emerald-50/90 rounded-2xl text-[11px] whitespace-pre-wrap leading-relaxed">
                                    {log.response}
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="p-3.5 bg-red-950/15 border border-red-500/15 text-red-200/90 rounded-2xl text-[11px] font-mono whitespace-pre-wrap">
                                      {log.error_message}
                                    </div>
                                    <div className="flex justify-end">
                                      <button
                                        onClick={() => copyToClipboard(log.error_message || '', `err-${log.id}`)}
                                        className="flex items-center gap-1 text-[9px] px-2.5 py-1 bg-red-950/30 hover:bg-red-950/50 border border-red-500/10 text-red-400 rounded-lg transition-all"
                                      >
                                        {copiedTextId === `err-${log.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                        <span>Скопировать текст ошибки</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Пагинация (Загрузить еще) */}
              {totalLogs > logs.length && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => fetchLogs()}
                    disabled={loadingLogs}
                    className="flex items-center justify-center gap-1.5 px-6 py-2 bg-slate-950/40 hover:bg-slate-950/80 border border-white/5 hover:border-brand-cyan/20 text-slate-400 hover:text-brand-cyan rounded-xl text-xs font-semibold transition-all"
                  >
                    {loadingLogs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Показать еще ({totalLogs - logs.length} логов осталось)</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
