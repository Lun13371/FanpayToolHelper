import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';

export default function LogsSubTab() {
  const { token, selectedAccountId } = useAppContext();

  const [sysLogs, setSysLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Метод получения логов по HTTP
  const fetchLogs = async (accId: number) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_URL}/logs?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSysLogs(data);
      }
    } catch (err) {
      console.error('Ошибка получения логов:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Эффект автоматической прокрутки логов вниз
  useEffect(() => {
    if (autoscroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sysLogs, autoscroll]);

  // Стрим логов по HTTP + WebSocket
  useEffect(() => {
    if (!selectedAccountId || !token) return;

    fetchLogs(selectedAccountId);

    // Подключаемся по WebSocket
    const wsUrl = API_URL.replace('http', 'ws') + `/ws/logs/${selectedAccountId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        setSysLogs((prev) => [...prev, log]);
      } catch (err) {
        console.error('Ошибка разбора WS лога:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [selectedAccountId, token]);

  return (
    <motion.div
      key="tab_logs"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="p-5 sm:p-6 rounded-3xl glow-card relative w-full"
      onMouseMove={handleMouseMove}
    >
      <div className="glow-bg rounded-3xl" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 relative z-10 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4.5 h-4.5 text-brand-cyan" />
          <h2 className="text-sm font-bold text-white">История действий и Логи сессии</h2>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
          {/* Autoscroll */}
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase select-none">
            <span>Автопрокрутка</span>
            <button
              onClick={() => setAutoscroll(!autoscroll)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {autoscroll ? (
                <ToggleRight className="w-6 h-6 text-brand-cyan" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-slate-600" />
              )}
            </button>
          </div>
          
          {/* Refresh */}
          <button
            onClick={() => selectedAccountId && fetchLogs(selectedAccountId)}
            disabled={logsLoading}
            className="py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Окно консоли */}
      <div className="relative z-10 rounded-2xl border border-white/5 bg-[#050608]/90 p-4 font-mono text-[11px] leading-relaxed shadow-inner overflow-hidden">
        {/* Хедер консоли */}
        <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3 text-slate-500 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-1.5 font-bold tracking-wide text-slate-400">fp_bot_monitor.log</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="uppercase text-[9px] font-bold text-emerald-400">LIVE streaming</span>
          </div>
        </div>

        {/* Тело логов */}
        <div className="max-h-[380px] overflow-y-auto no-scrollbar space-y-2 pr-2">
          {logsLoading && sysLogs.length === 0 ? (
            <div className="space-y-3.5 animate-pulse py-2 font-mono">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-3 items-center">
                  {/* Timestamp skeleton */}
                  <div className="h-3 bg-white/10 rounded w-16 shrink-0" />
                  {/* Tag skeleton */}
                  <div className="h-4 bg-brand-cyan/10 border border-brand-cyan/20 rounded w-14 shrink-0" />
                  {/* Text line skeleton */}
                  <div className="h-3 bg-white/5 rounded flex-grow" style={{ width: `${30 + i * 10}%` }} />
                </div>
              ))}
            </div>
          ) : sysLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-600 italic">
              Логи действий пока пусты. Запустите какую-нибудь задачу (например, демпинг или синхронизацию)!
            </div>
          ) : (
            sysLogs.map((log, idx) => {
              const timeStr = new Date(log.created_at).toLocaleTimeString('ru-RU');
              const isError = log.level === 'ERROR';
              const isWarn = log.level === 'WARNING';
              
              return (
                <div key={log.id || idx} className="flex items-start gap-2.5 hover:bg-white/[0.01] py-1 px-1.5 rounded transition-all">
                  <span className="text-slate-600 select-none shrink-0 font-bold">[{timeStr}]</span>
                  <span className={`font-extrabold shrink-0 uppercase text-[9px] px-1.5 py-0.5 rounded tracking-wide ${
                    isError ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    isWarn ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {log.level}
                  </span>
                  <span className={`break-all ${
                    isError ? 'text-rose-300' :
                    isWarn ? 'text-amber-200' :
                    'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </motion.div>
  );
}
