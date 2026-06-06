import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Star, RefreshCw, ChevronDown, ChevronUp, Terminal, TrendingUp,
  Zap, Loader2, MessageSquare, Sliders, Settings, X, CheckCircle2, Clock, AlertTriangle, HelpCircle, Radio
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';

import LotsSubTab from './funpay-manager/LotsSubTab';
import ChatsSubTab from './funpay-manager/ChatsSubTab';
import SettingsSubTab from './funpay-manager/SettingsSubTab';
import LogsSubTab from './funpay-manager/LogsSubTab';
import DampingSubTab from './funpay-manager/DampingSubTab';
import AnalyticsSection from './funpay-manager/AnalyticsSection';

interface FunpayLot {
  lot_id: string;
  lot_name: string;
  price: number;
  amount: number;
  category: string;
  native_auto_delivery?: boolean;
}

export default function FunpayManagerTab() {
  const { token, selectedAccountId, accounts, fetchAccounts, setSelectedAccountId } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [globalMode, setGlobalMode] = useState<'control' | 'analytics'>('control');
  const [activeSubTab, setActiveSubTab] = useState<'chats' | 'lots' | 'settings' | 'logs' | 'damping'>('lots');
  
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState('');
  const [raiseProgress, setRaiseProgress] = useState(0);
  const [raiseStepText, setRaiseStepText] = useState('');
  const [raiseLogs, setRaiseLogs] = useState<Array<{category?: string; status: 'success' | 'cooldown' | 'error' | 'log' | 'info'; message: string}>>([]);
  const [showRaiseStats, setShowRaiseStats] = useState(false);
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);
  const [raiseCountdown, setRaiseCountdown] = useState<string>('');
  const [lots, setLots] = useState<FunpayLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [raising, setRaising] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);

  const getTimeAgo = (dateString?: string): string => {
    if (!dateString) return 'Ни разу';
    try {
      let parsedDateStr = dateString;
      if (!dateString.endsWith('Z')) {
        parsedDateStr = dateString + 'Z';
      }
      const past = new Date(parsedDateStr);
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - past.getTime()) / 1000);
      
      if (diffSecs < 10) return 'только что';
      if (diffSecs < 60) return `${diffSecs} сек. назад`;
      
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins} мин. назад`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        const minsRem = diffMins % 60;
        return `${diffHours} ч. ${minsRem} мин. назад`;
      }
      
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} дн. назад`;
    } catch {
      return 'Неизвестно';
    }
  };

  useEffect(() => {
    const updateCountdown = () => {
      if (!currentAccount?.next_raise) {
        setRaiseCountdown(currentAccount?.is_active ? 'Ожидание...' : 'Бот остановлен');
        return;
      }
      
      let nextRaiseStr = currentAccount.next_raise;
      if (!nextRaiseStr.endsWith('Z')) {
        nextRaiseStr += 'Z';
      }
      
      const nextRaise = new Date(nextRaiseStr);
      const now = new Date();
      const diffMs = nextRaise.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        setRaiseCountdown('Поднятие выполняется...');
        return;
      }
      
      const diffSecs = Math.floor(diffMs / 1000);
      const secs = diffSecs % 60;
      const mins = Math.floor(diffSecs / 60) % 60;
      const hours = Math.floor(diffSecs / 3600);
      
      let countdownText = '';
      if (hours > 0) countdownText += `${hours}ч `;
      if (mins > 0 || hours > 0) countdownText += `${mins}м `;
      countdownText += `${secs}с`;
      
      setRaiseCountdown(countdownText);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentAccount?.next_raise, currentAccount?.is_active]);

  const loadLotsData = async () => {
    setLotsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/sync-lots`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLots(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLotsLoading(false);
    }
  };

  const handleToggleBot = async () => {
    if (!selectedAccountId || !currentAccount) return;
    setTogglingBot(true);
    try {
      const newActive = !currentAccount.is_active;
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: newActive })
      });
      if (res.ok) {
        await fetchAccounts();
      } else {
        alert('Не удалось изменить режим бота');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка соединения');
    } finally {
      setTogglingBot(false);
    }
  };

  const handleFullSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    setSyncProgress(5);
    setSyncStepText('Прогресс: Инициализация сессии...');
    
    let progress = 5;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 4) + 2;
      if (progress > 95) {
        progress = 95;
      }
      setSyncProgress(progress);
      
      if (progress < 20) {
        setSyncStepText('Этап 1/5: Проверка прокси-соединения...');
      } else if (progress < 40) {
        setSyncStepText('Этап 2/5: Безопасный вход на Funpay...');
      } else if (progress < 60) {
        setSyncStepText('Этап 3/5: Запрос баланса и отзывов...');
      } else if (progress < 80) {
        setSyncStepText('Этап 4/5: Сбор и кэширование активных лотов...');
      } else {
        setSyncStepText('Этап 5/5: Построение графиков, расчет возвратов и NLP слов...');
      }
    }, 180);

    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/sync-full`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      clearInterval(interval);

      if (res.ok) {
        setSyncProgress(100);
        setSyncStepText('Синхронизация завершена успешно!');
        await fetchAccounts();
        await loadLotsData();
        setTimeout(() => {
          setSyncing(false);
          setSyncProgress(0);
          setSyncStepText('');
        }, 1500);
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось выполнить синхронизацию');
        setSyncing(false);
      }
    } catch {
      clearInterval(interval);
      alert('Ошибка соединения с сервером');
      setSyncing(false);
    }
  };

  const handleRaiseOffers = async () => {
    if (!selectedAccountId) return;
    setRaising(true);
    setRaiseProgress(5);
    setRaiseStepText('Инициализация поднятия...');
    setRaiseLogs([]);
    setShowRaiseStats(true);
    setIsStatsCollapsed(false);

    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/raise`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream'
        }
      });

      if (!res.ok) {
        throw new Error('Не удалось запустить поднятие. Проверьте соединение.');
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Поток данных недоступен');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.progress !== undefined) {
              setRaiseProgress(event.progress);
            }
            if (event.message) {
              setRaiseStepText(event.message);
            }

            if (event.type === 'success' || event.type === 'cooldown' || event.type === 'error' || event.type === 'log') {
              setRaiseLogs(prev => [
                ...prev,
                {
                  category: event.category,
                  status: event.type,
                  message: event.message || (event.type === 'success' ? 'Лоты успешно подняты' : 'Кулдаун')
                }
              ]);
            } else if (event.type === 'empty') {
              setRaiseLogs(prev => [
                ...prev,
                {
                  status: 'info',
                  message: event.message
                }
              ]);
            }
          } catch (e) {
            console.error('Ошибка парсинга SSE сообщения:', e);
          }
        }
      }

      await fetchAccounts();
    } catch (err: any) {
      console.error(err);
      setRaiseLogs(prev => [
        ...prev,
        {
          status: 'error',
          message: err.message || 'Ошибка соединения с сервером при поднятии лотов'
        }
      ]);
    } finally {
      setRaising(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-0 pb-16 relative">
      {/* 1. ШАПКА МЕНЕДЖЕРА И БЫСТРЫЙ СЕЛЕКТОР */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-20">
        <div>
          <span className="text-[9px] bg-brand-cyan/15 border border-brand-cyan/20 text-brand-cyan px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Панель управления
          </span>
          <div className="flex items-center gap-2 mt-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Funpay Manager</h1>
            
            {/* Выпадающий список аккаунтов */}
            <div className="relative flex items-center gap-2" ref={dropdownRef}>
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="py-1.5 px-3 rounded-xl bg-slate-950/40 hover:bg-slate-950/60 border border-white/5 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${currentAccount?.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>{currentAccount?.name || 'Выберите аккаунт'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Быстрая кнопка запуска/остановки бота */}
              {currentAccount && (
                <button
                  onClick={handleToggleBot}
                  disabled={togglingBot}
                  className={`py-1.5 px-3 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    currentAccount.is_active 
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 text-emerald-400 hover:shadow-lg hover:shadow-emerald-500/5' 
                      : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-400 hover:text-white'
                  }`}
                  title={currentAccount.is_active ? 'Остановить работу бота' : 'Запустить работу бота'}
                >
                  {togglingBot ? (
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full ${currentAccount.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  )}
                  <span>{currentAccount.is_active ? 'Остановить' : 'Запустить бота'}</span>
                </button>
              )}

              {/* Статус и Последний синхрон */}
              {currentAccount && (
                <div className="hidden sm:flex flex-col text-left pl-1">
                  <span className={`text-[8px] font-black uppercase tracking-wider leading-none ${currentAccount.is_active ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
                    {currentAccount.is_active ? '● БОТ АКТИВЕН' : '○ БОТ ВЫКЛЮЧЕН'}
                  </span>
                  <span className="text-[7.5px] text-slate-500 font-extrabold uppercase tracking-wider leading-none mt-1">
                    Синхрон: {getTimeAgo(currentAccount.last_synced ?? undefined)}
                  </span>
                </div>
              )}

              <AnimatePresence>
                {showAccountDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute top-full left-0 mt-1.5 w-72 rounded-2xl bg-[#090A0F]/95 border border-white/5 p-2 shadow-2xl backdrop-blur-md z-50 overflow-hidden"
                  >
                    {accounts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-500 font-semibold">Аккаунты не найдены</div>
                    ) : (
                      accounts.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setShowAccountDropdown(false);
                          }}
                          className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                            selectedAccountId === acc.id 
                              ? 'bg-brand-cyan/10 text-brand-cyan' 
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${acc.is_active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                            <span className="truncate">{acc.name}</span>
                          </div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                            acc.is_active 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-slate-500/10 text-slate-500 border border-white/5'
                          }`}>
                            {acc.is_active ? 'Бот активен' : 'Выключен'}
                          </span>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Кнопки глобального режима */}
        {selectedAccountId && (
          <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-950/50 border border-white/5 w-fit">
            <button
              onClick={() => setGlobalMode('control')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                globalMode === 'control'
                  ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/25'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Управление</span>
            </button>
            <button
              onClick={() => setGlobalMode('analytics')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                globalMode === 'analytics'
                  ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/25'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Аналитика FP</span>
            </button>
          </div>
        )}
      </div>

      {!selectedAccountId ? (
        <div className="py-24 text-center text-slate-500 text-xs glow-card rounded-3xl relative overflow-hidden">
          <div className="glow-bg rounded-3xl" />
          <p className="font-semibold relative z-10">Пожалуйста, добавьте аккаунт во вкладке "Профили" или выберите сессию в меню выше.</p>
        </div>
      ) : (
        <>
          {/* СЕТКА СТАТИСТИКИ (4 КОЛОНКИ С УМНЫМ АВТОПОДНЯТИЕМ) */}
          {globalMode === 'control' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 relative z-10 pt-5 border-t border-white/5">
              {/* Баланс */}
              <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <Wallet className="w-4.5 h-4.5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block tracking-wider">Баланс профиля</span>
                  <h3 className="text-sm font-black text-white mt-0.5">{(currentAccount?.balance || 0).toLocaleString('ru-RU')} ₽</h3>
                </div>
              </div>

              {/* Рейтинг */}
              <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Star className="w-4.5 h-4.5 text-amber-400 fill-current" />
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block tracking-wider">Репутация</span>
                  <h3 className="text-sm font-black text-white mt-0.5">{(currentAccount?.rating || 0).toFixed(1)} / 5.0</h3>
                </div>
              </div>

              {/* Отзывы */}
              <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 border border-brand-cyan/25 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4.5 h-4.5 text-brand-cyan" />
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-bold text-slate-500 uppercase block tracking-wider">Отзывов собрано</span>
                  <h3 className="text-sm font-black text-white mt-0.5">{(currentAccount?.reviews_count || 0).toLocaleString('ru-RU')} шт.</h3>
                </div>
              </div>

              {/* Автоподнятие */}
              <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                    <Zap className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[8px] font-bold text-slate-500 uppercase block tracking-wider">Автоподнятие лотов</span>
                    <h3 className="text-[11px] font-black text-white mt-0.5 truncate filter drop-shadow-[0_0_2px_rgba(0,242,254,0.15)]">{raiseCountdown}</h3>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleRaiseOffers}
                      disabled={raising || !currentAccount}
                      className="p-2 bg-indigo-500 hover:bg-indigo-600 text-slate-950 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none hover:shadow-lg hover:shadow-indigo-500/20"
                      title="Запустить ручное поднятие лотов во всех категориях"
                    >
                      {raising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-slate-950 font-bold" />}
                    </button>
                    <button
                      onClick={handleFullSync}
                      disabled={syncing || !currentAccount}
                      className="p-2 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none hover:shadow-lg hover:shadow-brand-cyan/20"
                      title="Выполнить полную ручную синхронизацию профиля и лотов с Funpay"
                    >
                      {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-slate-950 font-bold fill-current" />}
                    </button>
                  </div>
                  <span className="text-[7.5px] text-slate-500 font-extrabold uppercase tracking-wide">
                    Синхрон: {getTimeAgo(currentAccount?.last_synced ?? undefined)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ПОЛОСА ЗАГРУЗКИ ПОЛНОЙ СИНХРОНИЗАЦИИ */}
          <AnimatePresence>
            {syncing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative z-10 pt-4 overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-brand-cyan/5 border border-brand-cyan/15 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-300 animate-pulse">{syncStepText}</span>
                    <span className="text-brand-cyan">{syncProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-950/60 rounded-full overflow-hidden">
                    <motion.div
                      className="bg-gradient-to-r from-brand-blue to-brand-cyan h-full rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${syncProgress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.15 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ПОЛОСА ЗАГРУЗКИ ПОДНЯТИЯ ЛОТОВ (ВРУЧНУЮ) */}
          <AnimatePresence>
            {raising && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative z-10 pt-4 overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-300 animate-pulse">{raiseStepText}</span>
                    <span className="text-indigo-400">{raiseProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-950/60 rounded-full overflow-hidden">
                    <motion.div
                      className="bg-gradient-to-r from-indigo-500 to-brand-cyan h-full rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${raiseProgress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.15 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* СТАТИСТИКА ПОДНЯТИЯ ЛОТОВ */}
          <AnimatePresence>
            {showRaiseStats && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="relative z-10 pt-4"
              >
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 space-y-3 shadow-xl backdrop-blur-md">
                  {/* Заголовок статистики */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Статистика поднятия лотов
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">
                        {raiseLogs.length} событий
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setIsStatsCollapsed(!isStatsCollapsed)}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                        title={isStatsCollapsed ? "Развернуть" : "Свернуть"}
                      >
                        {isStatsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setShowRaiseStats(false)}
                        className="p-1.5 hover:bg-rose-500/15 rounded-lg text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                        title="Закрыть логи"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Сводные бейджи */}
                  {!isStatsCollapsed && (
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                      <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 px-2 py-1 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        Поднято: {raiseLogs.filter(l => l.status === 'success').length}
                      </span>
                      <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/15 text-amber-400 px-2 py-1 rounded-lg">
                        <Clock className="w-3 h-3" />
                        Кулдаун: {raiseLogs.filter(l => l.status === 'cooldown').length}
                      </span>
                      {raiseLogs.some(l => l.status === 'error') && (
                        <span className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/15 text-rose-400 px-2 py-1 rounded-lg">
                          <AlertTriangle className="w-3 h-3" />
                          Ошибок: {raiseLogs.filter(l => l.status === 'error').length}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Сводный список */}
                  {!isStatsCollapsed && (
                    <div className="max-h-48 overflow-y-auto rounded-xl bg-slate-950/50 border border-white/5 p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
                      {raiseLogs.length === 0 ? (
                        <div className="text-center text-slate-500 text-xs py-4 flex flex-col items-center gap-1">
                          <HelpCircle className="w-5 h-5 text-slate-600 animate-pulse" />
                          <span>Получение данных о лотах...</span>
                        </div>
                      ) : (
                        raiseLogs.map((log, index) => {
                          const isSuccess = log.status === 'success';
                          const isCooldown = log.status === 'cooldown';
                          const isError = log.status === 'error';
                          
                          let statusColor = "text-slate-400 bg-slate-500/5 border-slate-500/10";
                          let Icon = HelpCircle;
                          
                          if (isSuccess) {
                            statusColor = "text-emerald-400 bg-emerald-500/5 border-emerald-500/10";
                            Icon = CheckCircle2;
                          } else if (isCooldown) {
                            statusColor = "text-amber-400 bg-amber-500/5 border-amber-500/10";
                            Icon = Clock;
                          } else if (isError) {
                            statusColor = "text-rose-400 bg-rose-500/5 border-rose-500/10";
                            Icon = AlertTriangle;
                          }

                          return (
                            <div 
                              key={index}
                              className={`flex items-start justify-between gap-3 p-2 rounded-lg border text-xs transition-all ${statusColor}`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  {log.category && (
                                    <span className="font-semibold text-slate-200 block truncate">
                                      {log.category}
                                    </span>
                                  )}
                                  <span className="opacity-90 leading-normal block">
                                    {log.message}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ГЛОБАЛЬНЫЙ РЕЖИМ: УПРАВЛЕНИЕ */}
          {globalMode === 'control' && (
            <>
              {/* НАВИГАЦИОННЫЙ ПЕРЕКЛЮЧАТЕЛЬ САБ-ВКЛАДОК */}
              <div className="flex flex-wrap md:flex-nowrap md:items-center gap-1.5 p-1 rounded-2xl bg-slate-950/50 border border-white/5 w-full md:w-fit mt-6">
                <button
                  onClick={() => setActiveSubTab('lots')}
                  className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none cursor-pointer ${
                    activeSubTab === 'lots' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Лоты</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('damping')}
                  className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none cursor-pointer ${
                    activeSubTab === 'damping' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Настройка демпинга</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('chats')}
                  className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none cursor-pointer ${
                    activeSubTab === 'chats' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Диалоги мессенджера</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('settings')}
                  className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none cursor-pointer ${
                    activeSubTab === 'settings' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Настройки сессии</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('logs')}
                  className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none cursor-pointer ${
                    activeSubTab === 'logs' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Консоль логов</span>
                </button>
              </div>

              {/* КОНТЕНТ В ЗАВИСИМОСТИ ОТ САБ-ВКЛАДКИ */}
              <div className="mt-4">
                <AnimatePresence mode="wait">
                  {activeSubTab === 'lots' && (
                    <LotsSubTab 
                      lots={lots}
                      setLots={setLots}
                      lotsLoading={lotsLoading}
                      setLotsLoading={setLotsLoading}
                      getTimeAgo={getTimeAgo}
                      raiseCountdown={raiseCountdown}
                    />
                  )}
                  {activeSubTab === 'damping' && (
                    <DampingSubTab lots={lots} />
                  )}
                  {activeSubTab === 'chats' && <ChatsSubTab />}
                  {activeSubTab === 'settings' && <SettingsSubTab />}
                  {activeSubTab === 'logs' && <LogsSubTab />}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* ГЛОБАЛЬНЫЙ РЕЖИМ: АНАЛИТИКА */}
          {globalMode === 'analytics' && (
            <AnalyticsSection 
              setActiveSubTab={setActiveSubTab} 
              setGlobalMode={setGlobalMode} 
            />
          )}
        </>
      )}
    </div>
  );
}
