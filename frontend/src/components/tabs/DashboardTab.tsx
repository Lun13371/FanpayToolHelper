import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Layers, RefreshCw, Plus, ToggleLeft, ToggleRight, Terminal, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LogMessage } from '../../types';

export default function DashboardTab() {
  const { token, user, accounts, fetchAccounts, selectedAccountId, setSelectedAccountId } = useAppContext();
  
  const [accountForm, setAccountForm] = useState({ name: '', golden_key: '', proxy_url: '', telegram_chat_id: '' });
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Состояния для интерактивной модалки верификации
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyingAccountId, setVerifyingAccountId] = useState<number | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<string>('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<boolean>(false);

  const steps = [
    { id: 1, name: 'Инициализация и настройки', pct: 15 },
    { id: 2, name: 'Проверка и подключение прокси', pct: 30 },
    { id: 3, name: 'Безопасное подключение к Funpay', pct: 50 },
    { id: 4, name: 'Проверка авторизации и локали', pct: 75 },
    { id: 5, name: 'Сохранение сессии и кук', pct: 90 },
  ];

  const getProgressPercentage = (statusText: string) => {
    if (statusText.includes('Active')) return 100;
    if (statusText.includes('Failed') || statusText.includes('Error') || verifyError) return 0;
    const match = statusText.match(/\((\d+)%\)/);
    return match ? parseInt(match[1]) : 5;
  };

  const progressPercent = getProgressPercentage(verifyStatus);

  // Поллинг промежуточных статусов верификации
  useEffect(() => {
    let intervalId: any = null;
    if (verifyingAccountId) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/accounts`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data: any[] = await res.json();
            const currentAcc = data.find(a => a.id === verifyingAccountId);
            if (currentAcc) {
              const status = currentAcc.last_status || '';
              setVerifyStatus(status);
              
              if (status.includes('Active')) {
                setVerifySuccess(true);
                setVerifyingAccountId(null);
                clearInterval(intervalId);
                fetchAccounts();
              } else if (status.includes('Failed') || status.includes('Error')) {
                setVerifyError(status.replace('Verifying: ', '').replace('Verification Failed:', '').trim() || 'Сбой верификации');
                setVerifyingAccountId(null);
                clearInterval(intervalId);
                fetchAccounts();
              }
            }
          }
        } catch (err) {
          console.error('Ошибка поллинга статуса верификации:', err);
        }
      }, 1200);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [verifyingAccountId, token]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (selectedAccountId && token) {
      if (socketRef.current) {
        socketRef.current.close();
      }
      fetchLogsHistory(selectedAccountId);
      
      const wsUrl = `${API_URL.replace('http', 'ws')}/ws/logs/${selectedAccountId}?token=${token}`;
      const socket = new WebSocket(wsUrl);
      
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setLogs((prev) => [...prev, message]);
      };

      socket.onerror = () => {
        setLogs((prev) => [...prev, { timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: 'Ошибка WebSocket-соединения с сервером.' }]);
      };

      socketRef.current = socket;

      return () => {
        socket.close();
      };
    }
  }, [selectedAccountId, token]);

  const fetchLogsHistory = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/logs?account_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(accountForm)
      });
      if (res.ok) {
        fetchAccounts();
        setAccountForm({ name: '', golden_key: '', proxy_url: '', telegram_chat_id: '' });
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка создания аккаунта');
      }
    } catch {
      alert('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAccount = async (id: number) => {
    setVerifyingAccountId(id);
    setShowVerifyModal(true);
    setVerifyStatus('Verifying: Starting... (5%)');
    setVerifyError(null);
    setVerifySuccess(false);

    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${id}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.detail || 'Сбой верификации');
        setVerifyingAccountId(null);
        fetchAccounts();
      }
    } catch {
      setVerifyError('Ошибка соединения с сервером');
      setVerifyingAccountId(null);
      fetchAccounts();
    }
  };

  const handleToggleAccount = async (id: number, active: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${id}/toggle?active=${active}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой переключения статуса');
      }
    } catch {
      alert('Ошибка отправки команды');
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm('Вы действительно хотите удалить аккаунт из панели? Фоновые таски остановятся.')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAccounts();
        if (selectedAccountId === id) setSelectedAccountId(null);
      }
    } catch {
      alert('Ошибка удаления аккаунта');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* ЛЕВАЯ КОНСОЛЬ: АККАУНТЫ */}
      <div className="lg:col-span-5 space-y-6">
        <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
          <div className="glow-bg rounded-3xl" />
          <h2 className="text-md font-bold text-white relative z-10 flex items-center justify-between mb-4">
            <span>Подключение Funpay сессии</span>
            <Radio className="w-4 h-4 text-brand-cyan shrink-0" />
          </h2>

          <form onSubmit={handleCreateAccount} className="space-y-4 relative z-10">
            <div>
              <input 
                type="text" 
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="Название сессии (например, Акк 1)"
                required
              />
            </div>
            <div>
              <input 
                type="password" 
                value={accountForm.golden_key}
                onChange={(e) => setAccountForm({ ...accountForm, golden_key: e.target.value })}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="Токен golden_key с кук"
                required
              />
            </div>
            <div>
              <input 
                type="text" 
                value={accountForm.proxy_url}
                onChange={(e) => setAccountForm({ ...accountForm, proxy_url: e.target.value })}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="SOCKS5 прокси (Обязательно для продакшена)"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white/10 hover:bg-white/15 py-2 px-4 rounded-xl text-xs font-semibold text-white transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Привязать аккаунт</span>
            </button>
          </form>
        </div>

        <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
          <div className="glow-bg rounded-3xl" />
          <h2 className="text-md font-bold text-white relative z-10 flex items-center justify-between mb-4">
            <span>Активные сессии</span>
            <Layers className="w-4 h-4 text-brand-blue shrink-0" />
          </h2>

          <div className="space-y-3 relative z-10">
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Аккаунты не привязаны</p>
            ) : (
              accounts.map((acc, index) => {
                const isSelected = selectedAccountId === acc.id;
                const isVerifying = acc.last_status === 'Verifying...';
                
                return (
                  <motion.div
                    key={acc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected 
                        ? 'bg-white/5 border-white/10' 
                        : 'bg-slate-950/20 border-white/5 hover:border-white/10'
                    }`}
                    onClick={() => setSelectedAccountId(acc.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-cyan/20 to-brand-blue/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-brand-cyan">F</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{acc.name}</h4>
                        <span className={`text-[10px] font-semibold mt-0.5 block ${
                          acc.last_status.includes('Active') ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {acc.last_status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {/* Кнопка верификации */}
                      <button
                        onClick={() => handleVerifyAccount(acc.id)}
                        disabled={isVerifying}
                        className={`p-1.5 rounded-lg border border-white/5 bg-slate-900/60 hover:bg-white/5 transition-all text-slate-400 ${
                          isVerifying ? 'animate-spin' : ''
                        }`}
                        title="Верифицировать"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      {/* Тумблер запуска */}
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleToggleAccount(acc.id, !acc.is_active)}
                        className="focus:outline-none text-slate-300"
                      >
                        {acc.is_active ? (
                          <ToggleRight className="w-8 h-8 text-brand-cyan filter drop-shadow-[0_0_5px_rgba(0,242,254,0.3)]" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-600" />
                        )}
                      </motion.button>

                      {/* Удалить */}
                      {user?.role !== 'manager' && (
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 rounded-lg border border-transparent hover:border-red-500/10 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ: ЛЕНТА ЖИВЫХ ЛОГОВ (ТЕРМИНАЛ) */}
      <div className="lg:col-span-7">
        <div className="rounded-3xl glow-card p-5 sm:p-6 relative flex flex-col h-[600px] overflow-hidden" onMouseMove={handleMouseMove}>
          <div className="glow-bg rounded-3xl" />
          
          <div className="flex items-center justify-between mb-4 relative z-10 shrink-0 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-cyan" />
              <h2 className="text-md font-bold text-white">Монитор терминала логов</h2>
            </div>
            <span className="text-[10px] bg-white/5 border border-white/10 text-slate-400 px-2.5 py-0.5 rounded-full font-semibold">
              LIVE STREAM
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-2xl p-4 font-mono text-[11px] sm:text-xs leading-relaxed overflow-y-auto flex-grow space-y-2.5 border border-white/5 relative z-10 min-h-0">
            {!selectedAccountId ? (
              <div className="text-slate-500 text-center py-12">Выберите сессию слева, чтобы просмотреть поток логов</div>
            ) : logs.length === 0 ? (
              <div className="text-slate-600 text-center py-12">Ожидание событий от фоновой службы бота...</div>
            ) : (
              logs.map((log, index) => {
                let levelColor = 'text-slate-400';
                if (log.level === 'WARNING') levelColor = 'text-amber-400';
                if (log.level === 'ERROR') levelColor = 'text-red-400';
                if (log.level === 'INFO') levelColor = 'text-cyan-400';
                
                return (
                  <div key={index} className="flex items-start gap-2 text-slate-300">
                    <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                    <span className={`${levelColor} font-bold shrink-0`}>[{log.level}]</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПРОГРЕССА ВЕРИФИКАЦИИ */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (verifySuccess || verifyError) setShowVerifyModal(false);
            }}
          />
          
          {/* Modal Container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 max-w-md w-full relative z-10 shadow-2xl space-y-6 overflow-hidden text-left"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cyan/10 rounded-full filter blur-3xl -z-10" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-blue/10 rounded-full filter blur-3xl -z-10" />

            <div className="text-center space-y-2">
              <h3 className="text-md sm:text-lg font-bold text-white">Верификация аккаунта</h3>
              <p className="text-xs text-slate-400">Пожалуйста, подождите, мы настраиваем антидетект сессию</p>
            </div>

            {/* Прогресс-бар */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase">
                <span>Прогресс</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-950/60 h-2.5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                  className="bg-gradient-to-r from-brand-cyan to-brand-blue h-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {/* Шаги */}
            <div className="space-y-3.5 bg-slate-950/30 border border-white/5 p-4 rounded-2xl">
              {steps.map((step) => {
                const isCompleted = progressPercent > step.pct || verifySuccess;
                const isActive = progressPercent === step.pct && !verifyError && !verifySuccess;
                
                return (
                  <div key={step.id} className="flex items-center gap-3 text-xs">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 filter drop-shadow-[0_0_2px_rgba(52,211,153,0.3)]" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-brand-cyan animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                    )}
                    <span className={`${isCompleted ? 'text-slate-300 font-medium' : isActive ? 'text-brand-cyan font-semibold' : 'text-slate-500'}`}>
                      {step.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Состояние завершения */}
            {verifySuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Верификация завершена!</span>
                  <p className="text-[10px] text-emerald-400/80 mt-0.5">Сессия успешно авторизована, куки и прокси валидны.</p>
                </div>
              </motion.div>
            )}

            {verifyError && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Ошибка авторизации</span>
                  <p className="text-[10px] text-red-400/80 mt-0.5">{verifyError}</p>
                </div>
              </motion.div>
            )}

            {/* Кнопка закрытия */}
            {(verifySuccess || verifyError) && (
              <button
                onClick={() => setShowVerifyModal(false)}
                className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-all"
              >
                Закрыть окно
              </button>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
