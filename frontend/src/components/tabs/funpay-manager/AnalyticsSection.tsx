import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Sliders, Wallet, Clock, Zap, Star, MessageSquare, Loader2, 
  Crown, Users, Flame, Lightbulb, Sparkles, AlertTriangle, Check, CheckCircle2, X,
  RefreshCw
} from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';

interface AnalyticsSectionProps {
  setActiveSubTab?: (tab: 'lots' | 'chats' | 'settings' | 'logs') => void;
  setGlobalMode?: (mode: 'control' | 'analytics') => void;
}

export default function AnalyticsSection({ setActiveSubTab, setGlobalMode }: AnalyticsSectionProps) {
  const { token, selectedAccountId, accounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [chartMode, setChartMode] = useState<'revenue' | 'equity'>('revenue');
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);

  // ИИ-Аудит
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditProgressStep, setAuditProgressStep] = useState(0);
  const [auditDepth, setAuditDepth] = useState<'express' | 'swot'>('express');

  // Исполнение быстрых действий ИИ
  const [executingAction, setExecutingAction] = useState<string | null>(null);

  const [recalculatingReviews, setRecalculatingReviews] = useState(false);

  // Фильтрация отзывов
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all');
  const [reviewsSearch, setReviewsSearch] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(5);

  useEffect(() => {
    setRatingFilter('all');
    setTagFilter('all');
    setReviewsSearch('');
    setVisibleCount(5);
  }, [selectedAccountId, statsData]);

  const recsContainerRef = useRef<HTMLDivElement>(null);

  // Скролл колесом мыши для списка рекомендаций
  useEffect(() => {
    const el = recsContainerRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY * 0.95;
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [statsData]);

  // Загрузка статистики
  const fetchStats = async (accId: number, depthPages: number = 15, forceRefresh: boolean = false) => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${accId}/sales-stats?pages=${depthPages}&force_refresh=${forceRefresh}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
      }
    } catch (err) {
      console.error('Ошибка получения аналитики:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId && token) {
      fetchStats(selectedAccountId, 15);
    }
  }, [selectedAccountId, token, currentAccount?.last_synced]);

  // Запустить глубокий ИИ-Аудит
  const runAiAudit = async () => {
    if (!selectedAccountId || auditLoading) return;
    setAuditLoading(true);
    setAuditProgressStep(0);
    
    const progressInterval = setInterval(() => {
      setAuditProgressStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 4000);

    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/run-ai-audit?depth=${auditDepth}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      clearInterval(progressInterval);
      if (res.ok) {
        const data = await res.json();
        setStatsData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            ai_deep_audit: data.ai_deep_audit,
            ai_audit_created_at: data.ai_audit_created_at
          };
        });
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось запустить ИИ-Аудит');
      }
    } catch (err) {
      clearInterval(progressInterval);
      console.error(err);
      alert('Ошибка соединения с ИИ-модулем');
    } finally {
      setAuditLoading(false);
    }
  };

  // Пересчитать отзывы через ИИ
  const recalculateReviewsWithAi = async () => {
    if (!selectedAccountId || recalculatingReviews) return;
    setRecalculatingReviews(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/recalculate-reviews-ai`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatsData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            reviews_stats: data.reviews_stats
          };
        });
        alert('ИИ успешно пересчитал все отзывы и обновил карту болей!');
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось запустить ИИ-пересчет отзывов');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка соединения с ИИ-модулем');
    } finally {
      setRecalculatingReviews(false);
    }
  };

  // Исполнение 1-клик быстрых рекомендаций ИИ
  const handleExecuteAction = async (actionType: string) => {
    if (actionType === 'open_lots') {
      setGlobalMode?.('control');
      setActiveSubTab?.('lots');
      setSelectedRecommendation(null);
    } else if (actionType === 'open_chats') {
      setGlobalMode?.('control');
      setActiveSubTab?.('chats');
      setSelectedRecommendation(null);
    } else if (actionType === 'open_settings') {
      setGlobalMode?.('control');
      setActiveSubTab?.('settings');
      setSelectedRecommendation(null);
    } else if (actionType === 'discount_3') {
      setExecutingAction(actionType);
      try {
        const res = await fetch(`${API_URL}/api/v1/lots?account_id=${selectedAccountId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const rules = await res.json();
          if (rules.length === 0) {
            alert('У вас еще не настроены лимиты демпинга лотов. Нажмите кнопку "Настроить" в таблице лотов для создания правил демпинга.');
            setGlobalMode?.('control');
            setActiveSubTab?.('lots');
            setSelectedRecommendation(null);
            return;
          }
          let count = 0;
          await Promise.all(rules.map(async (rule: any) => {
            const newMinPrice = Math.max(1, Math.round(rule.min_price * 0.97 * 100) / 100);
            const updateRes = await fetch(`${API_URL}/api/v1/lots/${rule.id}`, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ min_price: newMinPrice })
            });
            if (updateRes.ok) count++;
          }));
          alert(`Успешно снижены минимальные лимиты демпинга на 3% для всех ${count} товаров!`);
          await fetchStats(selectedAccountId!);
          setSelectedRecommendation(null);
        }
      } catch (err) {
        console.error(err);
        alert('Ошибка при массовой уценке лотов');
      } finally {
        setExecutingAction(null);
      }
    }
  };

  // Простейший ИИ-парсер разметки отчетов для глубокого аудита
  const formatDeepAuditText = (text: string) => {
    if (!text) return null;

    const parseInlineFormatting = (str: string) => {
      const parts = str.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-extrabold text-white tracking-wide">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });
    };

    return text.split('\n').map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-xs font-black text-brand-cyan uppercase tracking-wider mt-5 mb-2.5 pb-1 border-b border-white/5 flex items-center gap-1.5 first:mt-0">
            <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
            <span>{line.replace('### ', '')}</span>
          </h4>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} className="flex gap-2 text-[11px] leading-relaxed pl-2 font-semibold text-slate-300 my-1">
            <span className="text-brand-cyan shrink-0">•</span>
            <span>{parseInlineFormatting(line.substring(2))}</span>
          </div>
        );
      }
      if (/^\d+\s*\.\s+/.test(line)) {
        const numMatch = line.match(/^(\d+)\s*\.\s+/);
        const cleanLine = line.replace(/^\d+\s*\.\s+/, '');
        return (
          <div key={idx} className="flex gap-3 text-xs leading-relaxed my-2 pl-1">
            <div className="w-5 h-5 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0 font-extrabold text-[10px] text-brand-cyan">
              {numMatch ? numMatch[1] : '•'}
            </div>
            <p className="text-slate-300 font-semibold">{parseInlineFormatting(cleanLine)}</p>
          </div>
        );
      }
      return (
        <p key={idx} className="text-[11px] text-slate-400 font-medium leading-relaxed pl-1 my-1">
          {parseInlineFormatting(line)}
        </p>
      );
    });
  };

  // Динамическая генерация рекомендаций ИИ на основе полученных данных аналитики
  const getAIRecommendations = () => {
    if (!statsData) return [];
    const recs: any[] = [];

    // Рекомендация 1: Длинный простой
    if (statsData.idle_days > 2) {
      recs.push({
        id: 'idle_warning',
        type: 'danger',
        title: 'Обнаружен застой продаж',
        message: `Ваш магазин простаивает без сделок уже ${statsData.idle_days} дн. Это снижает общие охваты на Funpay.`,
        advice: 'ИИ рекомендует запустить или ускорить поднятие лотов, а также временно уценить ходовые позиции на 3-5%.',
        solution: 'Включите демпинг в настройках лотов и убедитесь, что бот находится в сети во вкладке "Настройки".',
        actionLabel: 'Уценить лимиты на 3%',
        actionType: 'discount_3'
      });
    }

    // Рекомендация 2: Плохой индекс CSAT
    const csat = statsData.efficiency_stats?.csat_percentage || 100;
    if (csat < 92) {
      recs.push({
        id: 'csat_warning',
        type: 'danger',
        title: 'Угроза качеству (Индекс CSAT)',
        message: `Удовлетворенность клиентов упала до ${csat}%. Есть риск ухудшения общего рейтинга профиля.`,
        advice: 'ИИ рекомендует разобрать последние негативные отзывы, доработать автовыдачу и ускорить реакцию ИИ в сложных кейсах.',
        solution: 'Откройте Менеджер -> Диалоги и разберите жалобы клиентов. Проверьте правильность выдаваемых файлов и ключей в Базе Знаний.',
        actionLabel: 'Открыть Диалоги',
        actionType: 'open_chats'
      });
    }

    // Рекомендация 3: Рост спроса
    const trend = statsData.forecasting_stats?.trend_percentage || 0;
    if (trend > 15) {
      recs.push({
        id: 'demand_grow',
        type: 'success',
        title: 'Органический взрыв спроса',
        message: `Продажи выросли на фантастические +${trend}% по сравнению с прошлым периодом!`,
        advice: 'Нейросеть прогнозирует сохранение высокого тренда. Необходима срочная дозакупка/пополнение товаров на склад.',
        solution: 'Зайдите в раздел "Автовыдача" и добавьте новые файлы/коды для популярных лотов во избежание пустых остатков.',
        actionLabel: 'Пополнить склад',
        actionType: 'open_lots'
      });
    }

    // Рекомендация 4: Мало автовыдач
    const autoRatio = statsData.efficiency_stats?.auto_delivery_ratio || 100;
    if (autoRatio < 65) {
      recs.push({
        id: 'low_autodelivery',
        type: 'warning',
        title: 'Много ручной рутины',
        message: `Только ${autoRatio}% сделок выдаются автоматически. Вы тратите слишком много времени оператора на ручные отправки.`,
        advice: 'ИИ рекомендует перевести лоты на встроенную автовыдачу Funpay или привязать файлы выдачи в нашем боте.',
        solution: 'Кликните "Настроить" на лотах без плашки автовыдачи и включите "Родную автовыдачу FunPay", либо добавьте товары во вкладке "Автовыдача".',
        actionLabel: 'Открыть лоты',
        actionType: 'open_lots'
      });
    }

    // Рекомендация 5: Лояльность
    const repeatPct = statsData.loyalty_stats?.repeat_percentage || 0;
    if (repeatPct > 20) {
      recs.push({
        id: 'loyalty_crown',
        type: 'success',
        title: 'Ядро лояльных покупателей',
        message: `${repeatPct}% ваших клиентов возвращаются за повторными покупками. Это элитный показатель!`,
        advice: 'ИИ рекомендует внедрить систему лояльности или отправлять купоны со скидками постоянным покупателям в первом автоответе.',
        solution: 'Отредактируйте "Системные инструкции" ИИ во вкладке "Настройки" — добавьте в промпт фразу "Предоставляй скидку 5% постоянным покупателям".',
        actionLabel: 'Настроить ИИ-Бот',
        actionType: 'open_settings'
      });
    }

    return recs;
  };

  const allReviews = statsData?.reviews_stats?.recent_reviews || [];
  
  // Фильтрация отзывов в реальном времени
  const filteredReviews = allReviews.filter((rev: any) => {
    if (ratingFilter !== 'all' && rev.rating !== ratingFilter) return false;
    if (tagFilter !== 'all' && (!rev.tags || !rev.tags.includes(tagFilter))) return false;
    if (reviewsSearch) {
      const searchLower = reviewsSearch.toLowerCase();
      const buyerMatch = rev.buyer?.toLowerCase().includes(searchLower);
      const textMatch = rev.text?.toLowerCase().includes(searchLower);
      const lotMatch = rev.lot_info?.toLowerCase().includes(searchLower);
      if (!buyerMatch && !textMatch && !lotMatch) return false;
    }
    return true;
  });

  const displayedReviews = filteredReviews.slice(0, visibleCount);

  return (
    <motion.div
      key="tab_analytics"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6 w-full"
    >
      {statsLoading && !statsData ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400 glow-card rounded-3xl relative overflow-hidden">
          <div className="glow-bg rounded-3xl" />
          <Loader2 className="w-8 h-8 animate-spin text-brand-cyan relative z-10" />
          <span className="text-xs font-semibold relative z-10">Сбор финансовой аналитики с FunPay...</span>
        </div>
      ) : (
        <>
          {/* ТУЛБАР АНАЛИТИКИ */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl glow-card relative z-10" onMouseMove={handleMouseMove}>
            <div className="glow-bg rounded-3xl" />
            <div className="relative z-10">
              <span className="text-[8px] font-black text-brand-cyan uppercase tracking-widest block">Аналитический модуль:</span>
              <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider mt-0.5">Полная финансовая аналитика</h2>
              <p className="text-[10px] text-slate-400 mt-1 max-w-2xl">
                Данные автоматически догружаются напрямую с FunPay (включая рекурсивный AJAX-сбор всех сделок и отзывов под капотом).
              </p>
            </div>
            
            <div className="flex items-center gap-3 relative z-10 shrink-0">
              <button
                onClick={() => selectedAccountId && fetchStats(selectedAccountId, 15, true)}
                disabled={statsLoading}
                className="py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider bg-brand-cyan text-slate-950 hover:bg-brand-cyan/90 transition-all flex items-center gap-1.5 hover:shadow-md hover:shadow-brand-cyan/25 disabled:opacity-50 disabled:pointer-events-none"
                title="Обновить данные с FunPay"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-950 ${statsLoading ? 'animate-spin' : ''}`} />
                <span>{statsLoading ? 'Синхронизация...' : 'Обновить статистику'}</span>
              </button>
            </div>
          </div>

          {/* АНАЛИТИЧЕСКИЕ КАРТОЧКИ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative z-10">
            {/* Карточка 1: Выручка */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Выручка</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  {statsData?.revenue_total?.toLocaleString('ru-RU')} ₽
                </h3>
              </div>
            </div>

            {/* Карточка 2: Число продаж */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5 text-brand-cyan" />
              </div>
              <div className="min-w-0 w-full">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Продажи</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  {statsData?.completed_count || 0} шт.
                </h3>
                <div className="mt-2 flex">
                  {statsData?.idle_days === 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span>Активен сегодня</span>
                    </span>
                  )}
                  {statsData?.idle_days > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[8px] font-black bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>В простое {statsData.idle_days} дн.</span>
                    </span>
                  )}
                  {(statsData?.idle_days === -1 || statsData?.idle_days === undefined) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8px] font-black bg-slate-500/10 border border-slate-500/20 text-slate-400 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                      <span>Нет продаж</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Карточка 3: Средний чек */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Средний чек</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  {statsData?.average_ticket?.toLocaleString('ru-RU')} ₽
                </h3>
              </div>
            </div>

            {/* Карточка 4: Скорость ответа бота */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4" title="Среднее время автоматического ответа ИИ в чате">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Ответ бота</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  ~{statsData?.efficiency_stats?.avg_bot_response_seconds || 45} сек.
                </h3>
              </div>
            </div>

            {/* Карточка 5: Доля автовыдач */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4" title="Доля заказов, выданных автоматически">
              <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-violet-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Автовыдача</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  {statsData?.efficiency_stats?.auto_delivery_ratio || 100}%
                </h3>
              </div>
            </div>

            {/* Карточка 6: Удовлетворенность клиентов (CSAT) */}
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/30 border border-white/5 flex items-center gap-4" title="Процент пятизвездочных отзывов среди всех текстовых оценок">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 text-rose-400 fill-current" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Индекс CSAT</span>
                <h3 className="text-sm sm:text-md lg:text-lg font-black text-white mt-1 truncate">
                  {statsData?.efficiency_stats?.csat_percentage || 100}%
                </h3>
              </div>
            </div>
          </div>

          {/* ГРАФИКИ И ДИАГРАММЫ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Левая колонка: Столбчатый график выручки по дням */}
            <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5 mb-6 relative z-10">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-brand-cyan" />
                  <span>Динамика и тренд магазина</span>
                </h3>
                
                <div className="flex flex-wrap items-center gap-2">
                  {/* Переключатель режимов */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/40 border border-white/5 text-[9px] font-bold shrink-0">
                    <button
                      onClick={() => setChartMode('revenue')}
                      className={`py-1 px-2.5 rounded-md transition-all uppercase tracking-wider ${
                        chartMode === 'revenue'
                          ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/10'
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      📊 Выручка
                    </button>
                    <button
                      onClick={() => setChartMode('equity')}
                      className={`py-1 px-2.5 rounded-md transition-all uppercase tracking-wider ${
                        chartMode === 'equity'
                          ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/10'
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      📈 Капитал
                    </button>
                  </div>

                  {/* Переключатель периодов графика */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/40 border border-white/5 text-[9px] font-bold shrink-0">
                    {(['week', 'month', 'year'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setChartPeriod(period)}
                        className={`py-1 px-2.5 rounded-md transition-all uppercase tracking-wider ${
                          chartPeriod === period
                            ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/10'
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        {period === 'week' && '7 дн.'}
                        {period === 'month' && '30 дн.'}
                        {period === 'year' && 'Год'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {(() => {
                const activeChartData = statsData?.chart_data?.[chartPeriod] || statsData?.daily_sales || [];
                const maxRevenue = Math.max(...activeChartData.map((d: any) => d.revenue), 1);
                const maxEquity = Math.max(...activeChartData.map((d: any) => d.cumulative_equity || d.revenue), 1);
                
                if (activeChartData.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500 italic relative z-10">
                      Недостаточно данных для построения графика.
                    </div>
                  );
                }

                return (
                  <div className="relative z-10">
                    {/* Сетка графика */}
                    <div className="flex items-end justify-between h-48 pt-6 px-1 border-b border-white/10 relative">
                      {activeChartData.map((day: any, idx: number) => {
                        const val = chartMode === 'revenue' ? day.revenue : (day.cumulative_equity || day.revenue);
                        const maxVal = chartMode === 'revenue' ? maxRevenue : maxEquity;
                        const percent = (val / maxVal) * 100;
                        
                        return (
                          <div key={idx} className="flex flex-col items-center flex-1 group h-full justify-end relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 bg-slate-950/95 border border-white/10 text-white rounded-xl py-1.5 px-2 text-[9px] font-bold shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 text-center leading-normal shrink-0">
                              <div className={chartMode === 'revenue' ? "text-brand-cyan font-extrabold" : "text-fuchsia-400 font-extrabold"}>
                                {chartMode === 'revenue' ? 'Выручка: ' : 'Капитал: '}
                                {val.toLocaleString('ru-RU')} ₽
                              </div>
                              <div className="text-slate-400 mt-0.5">{day.count} зак.</div>
                            </div>
                            
                            {/* Столбик */}
                            <motion.div
                              initial={{ height: '0%' }}
                              animate={{ height: `${percent}%` }}
                              transition={{ duration: 0.4, delay: Math.min(idx * 0.02, 0.5) }}
                              className={`rounded-t transition-all shadow-lg cursor-pointer ${
                                chartMode === 'revenue'
                                  ? 'bg-gradient-to-t from-brand-blue/30 to-brand-cyan/80 hover:to-brand-cyan hover:shadow-brand-cyan/20'
                                  : 'bg-gradient-to-t from-violet-600/30 to-fuchsia-500/80 hover:to-fuchsia-400 hover:shadow-fuchsia-500/20'
                              } ${
                                chartPeriod === 'week' ? 'w-8 sm:w-10' :
                                chartPeriod === 'month' ? 'w-1.5 sm:w-2.5 mx-0.5' :
                                'w-6 sm:w-8'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Временные метки */}
                    <div className="flex justify-between mt-3 px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {activeChartData.map((day: any, idx: number) => {
                        const showLabel = 
                          chartPeriod !== 'month' || 
                          idx % 5 === 0 || 
                          idx === activeChartData.length - 1;

                        return (
                          <div key={idx} className="flex-1 text-center truncate">
                            {showLabel ? day.date : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Правая колонка: Топ-5 продаваемых лотов */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-brand-cyan" />
                <span>Популярные товары (Топ-5)</span>
              </h3>
              
              {(!statsData?.top_lots || statsData.top_lots.length === 0) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Продажи за этот период отсутствуют.
                </div>
              ) : (
                <div className="space-y-4 relative z-10">
                  {(() => {
                    const maxCount = Math.max(...statsData.top_lots.map((l: any) => l.count), 1);
                    return statsData.top_lots.map((lot: any, idx: number) => {
                      const percent = (lot.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-white truncate max-w-[200px]" title={lot.name}>{lot.name}</span>
                            <span className="text-slate-400 shrink-0">{lot.count} продаж <span className="text-brand-cyan">({lot.revenue.toLocaleString('ru-RU')} ₽)</span></span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: '0%' }}
                              animate={{ width: `${percent}%` }}
                              transition={{ duration: 0.5, delay: idx * 0.05 }}
                              className="bg-gradient-to-r from-brand-blue to-brand-cyan h-full rounded-full"
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* БЛОК ОТЗЫВОВ И ОЦЕНОК */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Слева: Распределение оценок */}
            <div className="lg:col-span-4 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400 fill-current" />
                <span>Рейтинг и оценки</span>
              </h3>
              
              {(!statsData?.reviews_stats) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Нет данных по отзывам.
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  {/* Средняя оценка крупно */}
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-black text-white flex items-baseline gap-1 justify-center">
                        {statsData.reviews_stats.average_rating.toFixed(1)}
                        <span className="text-xs font-bold text-slate-500">/ 5</span>
                      </div>
                      <div className="flex items-center justify-center gap-0.5 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const isFilled = i < Math.round(statsData.reviews_stats.average_rating);
                          return (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                isFilled ? 'text-amber-400 fill-current' : 'text-slate-700'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 leading-normal border-l border-white/5 pl-4 py-1">
                      <div className="font-extrabold text-white text-md">
                        {statsData.reviews_stats.total_reviews.toLocaleString('ru-RU')}
                      </div>
                      <div className="font-bold text-slate-500 text-[10px] uppercase tracking-wide mt-0.5">Всего отзывов</div>
                    </div>
                  </div>

                  {/* Распределение звёзд */}
                  <div className="space-y-2.5 pt-4 border-t border-white/5">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = statsData.reviews_stats.distribution?.[stars] || 0;
                      const total = Object.values(statsData.reviews_stats.distribution || {}).reduce((a: any, b: any) => a + b, 0) as number;
                      const percent = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={stars} className="flex items-center gap-3 text-[11px] font-bold">
                          <span className="text-slate-400 w-3 text-right">{stars}</span>
                          <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                          <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: '0%' }}
                              animate={{ width: `${percent}%` }}
                              transition={{ duration: 0.5 }}
                              className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full"
                            />
                          </div>
                          <span className="text-slate-500 w-10 text-right">{count} шт.</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Справа: Отзывы */}
            <div className="lg:col-span-8 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-2 border-b border-white/5 relative z-10">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-brand-cyan" />
                  <span>Отзывы покупателей с Funpay</span>
                </h3>
                
                {/* Фильтры в один ряд */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={reviewsSearch}
                    onChange={(e) => { setReviewsSearch(e.target.value); setVisibleCount(5); }}
                    className="bg-slate-950/60 border border-white/5 rounded-xl py-1 px-2.5 text-[10px] font-bold text-white focus:outline-none focus:border-brand-cyan/40 placeholder:text-slate-600 w-24 sm:w-32"
                  />
                  
                  <select
                    value={ratingFilter}
                    onChange={(e) => { setRatingFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setVisibleCount(5); }}
                    className="bg-slate-950/60 border border-white/5 rounded-xl py-1 px-2 text-[10px] font-bold text-slate-400 focus:outline-none focus:border-brand-cyan/40 cursor-pointer"
                  >
                    <option value="all" className="bg-slate-950 text-white">Все оценки</option>
                    {[5, 4, 3, 2, 1].map((star) => (
                      <option key={star} value={star} className="bg-slate-950 text-white">
                        {star} ★
                      </option>
                    ))}
                  </select>

                  {statsData?.reviews_stats?.tags_summary && (
                    <select
                      value={tagFilter}
                      onChange={(e) => { setTagFilter(e.target.value); setVisibleCount(5); }}
                      className="bg-slate-950/60 border border-white/5 rounded-xl py-1 px-2 text-[10px] font-bold text-slate-400 focus:outline-none focus:border-brand-cyan/40 cursor-pointer max-w-[130px]"
                    >
                      <option value="all" className="bg-slate-950 text-white">Все теги</option>
                      {statsData.reviews_stats.tags_summary.map((t: any) => (
                        <option key={t.tag} value={t.tag} className="bg-slate-950 text-white">
                          {t.tag} ({t.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {(!statsData?.reviews_stats?.recent_reviews || statsData.reviews_stats.recent_reviews.length === 0) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Отзывы с текстом на странице не найдены.
                </div>
              ) : filteredReviews.length === 0 ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  По заданным фильтрам отзывов не найдено.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 relative z-10 no-scrollbar">
                    {displayedReviews.map((rev: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 space-y-2 hover:bg-white/[0.02] transition-all">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-brand-cyan/10 border border-brand-cyan/25 flex items-center justify-center text-brand-cyan font-black uppercase text-[10px]">
                              {rev.buyer.slice(0, 2)}
                            </div>
                            <span className="text-white font-extrabold">{rev.buyer}</span>
                          </div>
                          <span className="text-slate-500 font-bold">{rev.date}</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3.5 h-3.5 ${
                                  i < rev.rating ? 'text-amber-400 fill-current' : 'text-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                          {rev.lot_info && (
                            <span className="text-[9px] bg-white/5 text-slate-400 border border-white/5 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider truncate max-w-[280px]" title={rev.lot_info}>
                              {rev.lot_info}
                            </span>
                          )}
                          {/* NLP-Теги */}
                          {rev.tags && rev.tags.map((tag: string, tIdx: number) => {
                            const isNeg = tag.includes('⏳') || tag.includes('⚠️') || tag.includes('❌') || tag.includes('👎');
                            return (
                              <span 
                                key={tIdx} 
                                className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${
                                  isNeg 
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>

                        {rev.text && (
                          <p className="text-slate-300 text-xs font-semibold leading-relaxed pl-1 italic">
                            «{rev.text}»
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Кнопка Показать еще и счетчики */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5 relative z-10">
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">
                      Показано {displayedReviews.length} из {filteredReviews.length} отзывов
                      {filteredReviews.length < allReviews.length && ` (отфильтровано из ${allReviews.length})`}
                    </span>
                    
                    {filteredReviews.length > displayedReviews.length && (
                      <button
                        onClick={() => setVisibleCount(prev => prev + 5)}
                        className="py-1.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl text-[9px] font-bold text-slate-300 hover:text-white transition-all uppercase tracking-wider"
                      >
                        Показать еще
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* КАРТА БОЛЕЙ И РАДОСТЕЙ КЛИЕНТОВ */}
          {statsData?.reviews_stats?.tags_summary && (() => {
            const aiAnalyzedCount = statsData.reviews_stats.recent_reviews?.filter((r: any) => r.is_ai_analyzed).length || 0;
            const totalTagsCount = statsData.reviews_stats.recent_reviews?.length || 0;
            return (
              <div className="p-5 sm:p-6 rounded-3xl glow-card relative z-10" onMouseMove={handleMouseMove}>
                <div className="glow-bg rounded-3xl" />
                <div className="relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-2 border-b border-white/5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-brand-cyan" />
                      <span>Карта радостей и болей клиентов (NLP-анализ отзывов)</span>
                    </h3>
                    {statsData.ai_key_exists ? (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">
                          ИИ-Анализ: {aiAnalyzedCount}/{totalTagsCount} отзывов
                        </span>
                        <button
                          onClick={recalculateReviewsWithAi}
                          disabled={recalculatingReviews}
                          className="py-1 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider bg-brand-cyan text-slate-950 hover:bg-brand-cyan/90 transition-all flex items-center gap-1 hover:shadow-md hover:shadow-brand-cyan/20 disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <RefreshCw className={`w-3 h-3 text-slate-950 ${recalculatingReviews ? 'animate-spin' : ''}`} />
                          <span>{recalculatingReviews ? 'Пересчет...' : 'Пересчитать ИИ'}</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[8px] bg-brand-cyan/10 border border-brand-cyan/25 text-brand-cyan px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Локальный гибридный NLP
                      </span>
                    )}
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Левая колонка: Радости */}
                  <div className="p-4 rounded-2xl bg-emerald-950/[0.03] border border-emerald-500/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider">⚡ Радости и сильные стороны</h4>
                        <span className="text-[9px] text-slate-500 font-bold block mt-0.5">Что больше всего ценят ваши покупатели</span>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {(() => {
                        const positiveTags = statsData.reviews_stats.tags_summary.filter((t: any) => !t.is_negative);
                        if (positiveTags.length === 0) {
                          return <div className="text-[11px] text-slate-500 italic py-2">Недостаточно отзывов с положительными драйверами.</div>;
                        }
                        const maxCount = Math.max(...positiveTags.map((t: any) => t.count), 1);
                        return positiveTags.map((item: any, idx: number) => {
                          const percent = (item.count / maxCount) * 100;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-white flex items-center gap-1.5">
                                  <span>{item.tag}</span>
                                </span>
                                <span className="text-emerald-400 font-black">{item.count} упом.</span>
                              </div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{ duration: 0.5, delay: idx * 0.05 }}
                                  className="bg-gradient-to-r from-emerald-500 to-emerald-300 h-full rounded-full"
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Правая колонка: Боли */}
                  <div className="p-4 rounded-2xl bg-rose-950/[0.03] border border-rose-500/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-rose-400 uppercase tracking-wider">⚠️ Боли и проблемные зоны</h4>
                        <span className="text-[9px] text-slate-500 font-bold block mt-0.5">Что вызывает негатив у клиентов</span>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {(() => {
                        const negativeTags = statsData.reviews_stats.tags_summary.filter((t: any) => t.is_negative);
                        if (negativeTags.length === 0) {
                          return (
                            <div className="py-4 flex flex-col items-center justify-center text-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                                <Check className="w-4 h-4" />
                              </div>
                              <p className="text-[11px] text-slate-400 font-bold max-w-[280px]">Критические боли покупателей отсутствуют! Клиенты полностью довольны сервисом.</p>
                            </div>
                          );
                        }
                        const maxCount = Math.max(...negativeTags.map((t: any) => t.count), 1);
                        return negativeTags.map((item: any, idx: number) => {
                          const percent = (item.count / maxCount) * 100;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-white flex items-center gap-1.5">
                                  <span>{item.tag}</span>
                                </span>
                                <span className="text-rose-400 font-black">{item.count} упом.</span>
                              </div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{ duration: 0.5, delay: idx * 0.05 }}
                                  className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full"
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* Семантическое облако тегов отзывов */}
                {((statsData.reviews_stats.cloud_advantages && statsData.reviews_stats.cloud_advantages.length > 0) || 
                  (statsData.reviews_stats.cloud_painpoints && statsData.reviews_stats.cloud_painpoints.length > 0)) && (
                  <div className="mt-6 pt-5 border-t border-white/5 space-y-4 relative z-10 text-left">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-brand-cyan" />
                      <span>Семантическое облако отзывов (Частотный NLP-анализ слов)</span>
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Преимущества */}
                      {statsData.reviews_stats.cloud_advantages && statsData.reviews_stats.cloud_advantages.length > 0 && (
                        <div className="p-4 rounded-2xl bg-emerald-950/[0.01] border border-emerald-500/5 space-y-3">
                          <span className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-wider block">🟢 Облако комплиментов (Что хвалят покупатели)</span>
                          <div className="flex flex-wrap gap-1.5 justify-start">
                            {(() => {
                              const maxVal = Math.max(...statsData.reviews_stats.cloud_advantages.map((x: any) => x.value), 1);
                              return statsData.reviews_stats.cloud_advantages.map((word: any, wIdx: number) => {
                                const minSize = 10;
                                const maxSize = 15;
                                const size = minSize + ((word.value / maxVal) * (maxSize - minSize));
                                return (
                                  <span
                                    key={wIdx}
                                    style={{ fontSize: `${size}px` }}
                                    className="font-extrabold text-emerald-300/80 hover:text-emerald-300 bg-emerald-500/[0.03] px-2 py-0.5 rounded-lg border border-emerald-500/10 cursor-help transition-all duration-200 block shrink-0"
                                    title={`Слово "${word.text}" встретилось в положительных отзывах ${word.value} раз`}
                                  >
                                    {word.text} <span className="opacity-40 font-normal text-[8px]">({word.value})</span>
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Жалобы */}
                      {statsData.reviews_stats.cloud_painpoints && statsData.reviews_stats.cloud_painpoints.length > 0 && (
                        <div className="p-4 rounded-2xl bg-rose-950/[0.01] border border-rose-500/5 space-y-3">
                          <span className="text-[9px] text-rose-400 font-extrabold uppercase tracking-wider block">🔴 Облако претензий (На что жалуются покупатели)</span>
                          <div className="flex flex-wrap gap-1.5 justify-start">
                            {(() => {
                              const maxVal = Math.max(...statsData.reviews_stats.cloud_painpoints.map((x: any) => x.value), 1);
                              return statsData.reviews_stats.cloud_painpoints.map((word: any, wIdx: number) => {
                                const minSize = 10;
                                const maxSize = 15;
                                const size = minSize + ((word.value / maxVal) * (maxSize - minSize));
                                return (
                                  <span
                                    key={wIdx}
                                    style={{ fontSize: `${size}px` }}
                                    className="font-extrabold text-rose-300/80 hover:text-rose-300 bg-rose-500/[0.03] px-2 py-0.5 rounded-lg border border-rose-500/10 cursor-help transition-all duration-200 block shrink-0"
                                    title={`Слово "${word.text}" встретилось в отрицательных отзывах ${word.value} раз`}
                                  >
                                    {word.text} <span className="opacity-40 font-normal text-[8px]">({word.value})</span>
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Блок ИИ-выводов (Инсайт) */}
                <div className="mt-5 p-3.5 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col sm:flex-row sm:items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center text-brand-cyan shrink-0">
                    <Lightbulb className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-black text-brand-cyan uppercase tracking-widest block">NLP-Инсайт по обратной связи:</span>
                    <p className="text-[11px] text-slate-300 font-semibold leading-relaxed">
                      {(() => {
                        const negativeTags = statsData.reviews_stats.tags_summary.filter((t: any) => t.is_negative);
                        const positiveTags = statsData.reviews_stats.tags_summary.filter((t: any) => !t.is_negative);
                        
                        if (negativeTags.length > 0) {
                          negativeTags.sort((a: any, b: any) => b.count - a.count);
                          const topPain = negativeTags[0].tag;
                          return `⚠️ Обнаружена зона риска! Главная боль ваших покупателей — это «${topPain}». Рекомендуется ускорить обработку сделок, перепроверить качество выдаваемых ключей/файлов в Базе Знаний или настроить более мягкий демпинг.`;
                        } else if (positiveTags.length > 0) {
                          positiveTags.sort((a: any, b: any) => b.count - a.count);
                          const topJoy = positiveTags[0].tag;
                          return `🎉 Отличные результаты! Покупатели в восторге от «${topJoy}» в вашем магазине. Это ваш ключевой драйвер удержания (CSAT). Усиливайте этот аспект и не забывайте предлагать скидки постоянным клиентам!`;
                        }
                        return "🔍 Ждем новых текстовых отзывов клиентов для составления детальной NLP-карты болей и радостей.";
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )})()}

          {/* БЛОК ЛОЯЛЬНОСТИ И ПОЧАСОВОЙ ТЕПЛОВОЙ КАРТЫ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Слева: Лояльность покупателей и VIP-клиенты */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-brand-cyan" />
                <span>Лояльность клиентов и VIP-покупатели</span>
              </h3>
              
              {(!statsData?.loyalty_stats) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Нет данных по покупателям.
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  {/* Сводные показатели лояльности */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Уникальных клиентов</span>
                      <h4 className="text-lg font-black text-white mt-1">
                        {statsData.loyalty_stats.unique_buyers} чел.
                      </h4>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Постоянные клиенты</span>
                      <h4 className="text-lg font-black text-brand-cyan mt-1">
                        {statsData.loyalty_stats.repeat_buyers} чел. <span className="text-[10px] text-slate-500">({statsData.loyalty_stats.repeat_percentage}%)</span>
                      </h4>
                    </div>
                  </div>

                  {/* VIP-клиенты */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Топ покупателей по сумме сделок</span>
                    </h4>
                    
                    {statsData.loyalty_stats.top_buyers.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">Пока нет завершенных покупателей.</div>
                    ) : (
                      <div className="space-y-2">
                        {statsData.loyalty_stats.top_buyers.map((buyer: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/5 text-xs hover:bg-white/[0.02] transition-all">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500">#{idx + 1}</span>
                              <span className="font-extrabold text-brand-cyan">{buyer.username}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-bold">
                              <span className="text-slate-400">{buyer.count} зак.</span>
                              <span className="text-emerald-400">{buyer.spent.toLocaleString('ru-RU')} ₽</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Справа: Почасовая тепловая карта активности */}
            <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-500" />
                <span>Почасовая активность продаж (Тепловая карта)</span>
              </h3>
              
              {(!statsData?.hourly_heatmap) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Нет данных по часам.
                </div>
              ) : (
                <div className="space-y-4 relative z-10">
                  <p className="text-[10px] font-semibold text-slate-500 leading-normal">
                    Цветовая интенсивность ячеек отображает частоту заказов в течение 24 часов (по времени бэкенда). Наведите на ячейку для точной статистики.
                  </p>
                  
                  {/* Сетка 24 часов */}
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mt-4">
                    {(() => {
                      const heatmap = statsData.hourly_heatmap;
                      const maxVal = Math.max(...heatmap, 1);
                      return heatmap.map((count: number, hour: number) => {
                        const ratio = count / maxVal;
                        let bgClass = "bg-white/[0.02] border-white/5";
                        let textClass = "text-slate-500";
                        if (count > 0) {
                          textClass = "text-white font-extrabold";
                          if (ratio < 0.3) {
                            bgClass = "bg-brand-cyan/20 border-brand-cyan/15";
                          } else if (ratio < 0.6) {
                            bgClass = "bg-brand-cyan/40 border-brand-cyan/30";
                          } else if (ratio < 0.9) {
                            bgClass = "bg-brand-cyan/75 border-brand-cyan/60 text-slate-950";
                          } else {
                            bgClass = "bg-brand-cyan border-brand-cyan text-slate-950 glow-sm shadow-brand-cyan/20";
                          }
                        }
                        
                        const padHour = String(hour).padStart(2, '0');
                        
                        return (
                          <div
                            key={hour}
                            className={`h-11 rounded-xl border flex flex-col justify-between p-1.5 text-center group relative cursor-help transition-all ${bgClass}`}
                          >
                            <span className="text-[9px] block leading-none font-bold uppercase tracking-wider">{padHour}</span>
                            <span className={`text-[10px] block leading-none mt-1 ${textClass}`}>{count}</span>
                            
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-950 border border-white/10 text-white rounded-xl py-1.5 px-2 text-[10px] font-black shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 text-center shrink-0 w-24 leading-normal">
                              <div>{padHour}:00 - {padHour}:59</div>
                              <div className="text-brand-cyan mt-0.5">{count} зак.</div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* АНАЛИЗ ВОЗВРАТОВ, СПОРОВ И КАТЕГОРИЙ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Слева: Категориальный сплит (Sales by Category) */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-brand-cyan" />
                <span>Категориальный сплит продаж</span>
              </h3>

              {!statsData?.category_split && !statsData?.game_split ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Нет данных для анализа категорий.
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  {/* Сплит по типам товаров */}
                  {statsData?.category_split && statsData.category_split.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">По типу товаров</span>
                      <div className="space-y-2.5">
                        {(() => {
                          const totalRevenue = statsData.category_split.reduce((acc: number, item: any) => acc + item.revenue, 0) || 1;
                          return statsData.category_split.map((item: any, idx: number) => {
                            const percent = (item.revenue / totalRevenue) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-white flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan shrink-0" />
                                    <span>{item.category}</span>
                                  </span>
                                  <span className="text-slate-400">
                                    {item.count} шт. <span className="text-emerald-400 font-extrabold ml-1.5">{item.revenue.toLocaleString('ru-RU')} ₽</span>
                                  </span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: '0%' }}
                                    animate={{ width: `${percent}%` }}
                                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                                    className="bg-brand-cyan h-full rounded-full"
                                  />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Сплит по игровым мирам */}
                  {statsData?.game_split && statsData.game_split.length > 0 && (
                    <div className="space-y-3 pt-3 border-t border-white/5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">По игровым мирам (Топ-5)</span>
                      <div className="space-y-2.5">
                        {(() => {
                          const topGames = statsData.game_split.slice(0, 5);
                          const totalRevenue = topGames.reduce((acc: number, item: any) => acc + item.revenue, 0) || 1;
                          return topGames.map((item: any, idx: number) => {
                            const percent = (item.revenue / totalRevenue) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-white flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                    <span>{item.game}</span>
                                  </span>
                                  <span className="text-slate-400">
                                    {item.count} шт. <span className="text-emerald-400 font-extrabold ml-1.5">{item.revenue.toLocaleString('ru-RU')} ₽</span>
                                  </span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: '0%' }}
                                    animate={{ width: `${percent}%` }}
                                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                                    className="bg-indigo-400 h-full rounded-full"
                                  />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Справа: Трекер споров и возвратов (Refund & Dispute Tracker) */}
            <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 relative z-10 pb-2 border-b border-white/5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Трекер возвратов средств и споров</span>
                </div>
                {statsData?.refund_stats?.refund_rate !== undefined && (
                  <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                    statsData.refund_stats.refund_rate > 5 
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                      : statsData.refund_stats.refund_rate > 1
                      ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  }`}>
                    Refund Rate: {statsData.refund_stats.refund_rate}%
                  </span>
                )}
              </h3>

              {!statsData?.refund_stats ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Нет данных для анализа возвратов.
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  {/* Мини-панели показателей возвратов */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 text-center">
                      <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block">Refund Rate</span>
                      <h4 className={`text-md sm:text-lg font-black mt-1 ${
                        statsData.refund_stats.refund_rate > 5 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {statsData.refund_stats.refund_rate}%
                      </h4>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 text-center" title="Количество возвратов/отмен заказов">
                      <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block">Возвраты (Отмены)</span>
                      <h4 className="text-md sm:text-lg font-black text-rose-400 mt-1">
                        {statsData.refund_stats.refunded_count} шт.
                      </h4>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 text-center" title="Количество оплаченных, но не подтвержденных заказов">
                      <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block">Открытые споры</span>
                      <h4 className="text-md sm:text-lg font-black text-amber-400 mt-1">
                        {statsData.refund_stats.pending_count} шт.
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Топ проблемных лотов по возвратам */}
                    <div className="p-3.5 rounded-2xl bg-rose-950/[0.01] border border-rose-500/5 space-y-2.5">
                      <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider block">⚠️ Проблемные товары (Возвраты)</span>
                      {statsData.refund_stats.refunds_by_lot.length === 0 ? (
                        <div className="text-[10px] text-slate-500 font-bold italic py-2">Возвраты по товарам отсутствуют. Отличный показатель!</div>
                      ) : (
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 no-scrollbar text-left">
                          {statsData.refund_stats.refunds_by_lot.map((lot: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-[11px] font-bold py-1 border-b border-white/[0.02] last:border-0">
                              <span className="text-slate-300 truncate max-w-[120px]" title={lot.name}>{lot.name}</span>
                              <span className="text-rose-400 font-extrabold flex items-center gap-1 shrink-0">
                                {lot.count} возвр. ({lot.revenue} ₽)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Лоты с активными спорами / ожиданиями подтверждения */}
                    <div className="p-3.5 rounded-2xl bg-amber-950/[0.01] border border-amber-500/5 space-y-2.5">
                      <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">⏳ Ожидают подтверждения / В споре</span>
                      {statsData.refund_stats.disputes_by_lot.length === 0 ? (
                        <div className="text-[10px] text-slate-500 font-bold italic py-2">Все оплаченные заказы успешно подтверждены клиентами!</div>
                      ) : (
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 no-scrollbar text-left">
                          {statsData.refund_stats.disputes_by_lot.map((lot: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-[11px] font-bold py-1 border-b border-white/[0.02] last:border-0">
                              <span className="text-slate-300 truncate max-w-[120px]" title={lot.name}>{lot.name}</span>
                              <span className="text-amber-400 font-extrabold flex items-center gap-1 shrink-0">
                                {lot.count} шт. ({lot.revenue} ₽)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ИИ-СОВЕТНИК И ПРОГНОЗИРОВАНИЕ ПРОДАЖ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Слева: SWOT Аудит и рекомендации */}
            <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl glow-card relative flex flex-col justify-between" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <div className="w-full">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 pb-2 border-b border-white/5 flex items-center justify-between gap-2 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-brand-cyan" />
                    <span>Центр рекомендаций ИИ и Аудит магазина</span>
                  </div>
                  
                  {statsData?.ai_key_exists ? (
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Выбор глубины аудита */}
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/40 border border-white/5 text-[9px] font-bold">
                        {(['express', 'swot'] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setAuditDepth(d)}
                            className={`py-1 px-2.5 rounded-md transition-all uppercase tracking-wider ${
                              auditDepth === d
                                ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/10'
                                : 'text-slate-400 hover:text-white border border-transparent'
                            }`}
                          >
                            {d === 'express' ? 'Экспресс' : 'Глубокий SWOT'}
                          </button>
                        ))}
                      </div>

                      {statsData?.ai_audit_created_at && !auditLoading && (
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">
                          Обновлено: {(() => {
                            const diffMs = Date.now() - new Date(statsData.ai_audit_created_at).getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMins / 60);
                            
                            if (diffMins < 1) return 'только что';
                            if (diffMins < 60) return `${diffMins} мин. назад`;
                            if (diffHours < 24) return `${diffHours} ч. назад`;
                            return `${Math.floor(diffHours / 24)} дн. назад`;
                          })()}
                        </span>
                      )}
                      <button
                        onClick={runAiAudit}
                        disabled={auditLoading}
                        className="py-1 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider bg-brand-cyan text-slate-950 hover:bg-brand-cyan/90 transition-all flex items-center gap-1 hover:shadow-md hover:shadow-brand-cyan/20 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <Sparkles className="w-3 h-3 text-slate-950 animate-pulse" />
                        <span>{statsData?.ai_deep_audit ? "Перезапустить" : "Запустить ИИ-Аудит"}</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[8px] bg-slate-500/10 border border-slate-500/20 text-slate-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>Локальный быстрый аудит</span>
                    </span>
                  )}
                </h3>

                {auditLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-4 text-slate-400 relative z-10 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-cyan" />
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-white block">ИИ выполняет глубокий аудит</span>
                      <p className="text-[10px] text-slate-500 font-bold leading-normal italic animate-pulse max-w-[280px]">
                        {[
                          "Сбор живых данных с FunPay (сделки, баланс, остатки, демпинг)...",
                          "Изучение свежих отзывов покупателей...",
                          "Анализ почасовой активности продаж...",
                          "Формирование отчета глубокого аудита ИИ и планов роста..."
                        ][auditProgressStep]}
                      </p>
                    </div>
                  </div>
                ) : statsData?.ai_key_exists && statsData?.ai_deep_audit ? (
                  <div className="space-y-4 relative z-10 max-h-[380px] overflow-y-auto pr-1 no-scrollbar leading-relaxed">
                    {formatDeepAuditText(statsData.ai_deep_audit)}
                  </div>
                ) : statsData?.ai_key_exists && !statsData?.ai_deep_audit ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 relative z-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-brand-cyan/15 border border-brand-cyan/25 flex items-center justify-center text-brand-cyan">
                      <Sparkles className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Доступен глубокий аудит ИИ!</h4>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-[380px] font-semibold leading-normal">
                        В вашей базе обнаружены рабочие API-ключи. Нажмите кнопку «Запустить ИИ-Аудит» вверху, чтобы нейросеть провела глубокий анализ продаж, отзывов и нарисовала полный пошаговый план роста.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const recs = getAIRecommendations();
                      if (recs.length === 0) {
                        return (
                          <div className="py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                              <Sparkles className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Ваш магазин работает идеально!</h4>
                              <p className="text-[11px] text-slate-500 mt-1 leading-normal font-semibold">
                                ИИ-аудитор не обнаружил критических проблем. Все отзывы отличные, бот активен, а автоматическая выдача товаров настроена на максимум. Продолжайте в том же духе!
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          ref={recsContainerRef}
                          className="flex overflow-x-auto gap-4 no-scrollbar pb-1 relative z-10"
                        >
                          {recs.map((rec) => {
                            let borderClass = "border-slate-800 bg-white/[0.01]";
                            let iconBg = "bg-slate-500/10 border-slate-500/20 text-slate-400";
                            let titleColor = "text-white";
                            let icon = <Zap className="w-4 h-4" />; 

                            if (rec.type === 'danger') {
                              borderClass = "border-rose-500/20 bg-rose-950/5 hover:bg-rose-950/10";
                              iconBg = "bg-rose-500/10 border-rose-500/20 text-rose-400";
                              titleColor = "text-rose-300";
                              icon = <AlertTriangle className="w-4 h-4" />;
                            } else if (rec.type === 'warning') {
                              borderClass = "border-amber-500/20 bg-amber-950/5 hover:bg-amber-950/10";
                              iconBg = "bg-amber-500/10 border-amber-500/20 text-amber-400";
                              titleColor = "text-amber-200";
                              icon = <Zap className="w-4 h-4" />;
                            } else if (rec.type === 'info') {
                              borderClass = "border-indigo-500/20 bg-indigo-950/5 hover:bg-indigo-950/10";
                              iconBg = "bg-indigo-500/10 border-indigo-500/20 text-indigo-400";
                              titleColor = "text-indigo-300";
                              icon = <Clock className="w-4 h-4" />;
                            } else if (rec.type === 'success') {
                              borderClass = "border-emerald-500/20 bg-emerald-950/5 hover:bg-emerald-950/10";
                              iconBg = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                              titleColor = "text-emerald-300";
                              icon = <Crown className="w-4 h-4" />;
                            }

                            return (
                              <div 
                                key={rec.id} 
                                onClick={() => setSelectedRecommendation(rec)}
                                className={`p-4 rounded-2xl border flex gap-4 transition-all duration-300 ease-out shrink-0 w-[280px] sm:w-[320px] hover:w-[380px] sm:hover:w-[440px] max-w-full cursor-pointer hover:shadow-2xl hover:shadow-brand-cyan/5 relative z-10 hover:z-20 ${borderClass}`}
                              >
                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBg}`}>
                                  {icon}
                                </div>
                                <div className="space-y-1.5 min-w-0 text-left w-full">
                                  <h4 className={`text-xs font-bold uppercase tracking-wider ${titleColor} truncate`} title={rec.title}>{rec.title}</h4>
                                  <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">{rec.message}</p>
                                  <div className="pt-2 border-t border-white/5 space-y-1">
                                    <span className="text-[8px] font-black text-brand-cyan uppercase tracking-widest block">ИИ-Совет:</span>
                                    <p className="text-[10px] text-slate-400 leading-normal font-semibold italic">{rec.advice}</p>
                                  </div>

                                  {rec.actionLabel && (
                                    <div className="pt-2.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleExecuteAction(rec.actionType);
                                        }}
                                        disabled={executingAction === rec.actionType}
                                        className="py-1.5 px-3 bg-brand-cyan text-slate-950 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-brand-cyan/90 transition-all flex items-center justify-center gap-1 shadow shadow-brand-cyan/10"
                                      >
                                        {executingAction === rec.actionType ? (
                                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        ) : (
                                          <Check className="w-2.5 h-2.5 text-slate-950 font-bold" />
                                        )}
                                        <span>{rec.actionLabel}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Action/Tip Footer */}
              <div className="pt-3 border-t border-white/5 mt-4 text-[9px] font-bold text-slate-500 leading-normal flex items-center gap-1.5 relative z-10 w-full text-left">
                {statsData?.ai_key_exists ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-brand-cyan animate-pulse shrink-0" />
                    <span>Интеллектуальный аудит подготовлен моделью Llama 3.3 70B Instruct на основе живой аналитики, цен демпинга и остатков на складе.</span>
                  </>
                ) : (
                  <>
                    <Lightbulb className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                    <span>Совет: Добавьте API-ключ во вкладке "Ключи ИИ", чтобы активировать глубокий нейросетевой аудит всего вашего магазина.</span>
                  </>
                )}
              </div>
            </div>

            {/* Справа: ИИ-Прогноз продаж и тренды */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 pb-2 border-b border-white/5 flex items-center justify-between gap-2 relative z-10">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-brand-cyan" />
                  <span>Прогноз продаж и тренды (ИИ-Анализ)</span>
                </div>
                <span className="text-[8px] bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                  <span>AI Forecaster</span>
                </span>
              </h3>

              {!statsData?.forecasting_stats ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Недостаточно данных для ИИ-прогнозирования.
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  {/* Статус тренда */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.01] border border-white/5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Текущий тренд продаж</span>
                    <div>
                      {statsData.forecasting_stats.trend_direction === 'up' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                          <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Рост (+{statsData.forecasting_stats.trend_percentage}%)</span>
                        </span>
                      )}
                      {statsData.forecasting_stats.trend_direction === 'down' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500/10 border border-rose-500/20 text-rose-400 uppercase tracking-wider">
                          <Sliders className="w-3 h-3 text-rose-400 shrink-0 rotate-180" />
                          <span>Спад ({statsData.forecasting_stats.trend_percentage}%)</span>
                        </span>
                      )}
                      {statsData.forecasting_stats.trend_direction === 'stable' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-slate-500/10 border border-slate-500/20 text-slate-400 uppercase tracking-wider">
                          <Check className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Стабильный спрос</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ожидаемые показатели на 7 дней */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-950/20 border border-white/5 text-center">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Прогноз выручки (7 дн.)</span>
                      <h4 className="text-md sm:text-lg font-black text-brand-cyan mt-1.5">
                        {statsData.forecasting_stats.projected_revenue.toLocaleString('ru-RU')} ₽
                      </h4>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-950/20 border border-white/5 text-center">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Прогноз заказов (7 дн.)</span>
                      <h4 className="text-md sm:text-lg font-black text-white mt-1.5">
                        {statsData.forecasting_stats.projected_count} шт.
                      </h4>
                    </div>
                  </div>

                  {/* Рекомендации по складу */}
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 text-left">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Sparkles className="w-3.5 h-3.5 text-brand-cyan animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-wider">Совет по закупкам и складу</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-semibold italic">
                      «{statsData.forecasting_stats.inventory_recommendation}»
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ТАБЛИЦА ПОСЛЕДНИХ ПРОДАЖ */}
          <div className="p-5 sm:p-6 rounded-3xl glow-card relative z-10" onMouseMove={handleMouseMove}>
            <div className="glow-bg rounded-3xl" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 pb-2 border-b border-white/5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-cyan" />
              <span>Лента последних завершенных продаж</span>
            </h3>

            {(!statsData?.recent_sales || statsData.recent_sales.length === 0) ? (
              <div className="py-12 text-center text-slate-500 italic">
                Завершённых продаж на аккаунте пока нет.
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[9px] text-slate-500 uppercase font-bold tracking-wider border-b border-white/5 bg-slate-950/10">
                      <th className="py-2.5 px-4">Заказ ID</th>
                      <th className="py-2.5 px-3">Дата</th>
                      <th className="py-2.5 px-3">Название лота (Funpay)</th>
                      <th className="py-2.5 px-3">Покупатель</th>
                      <th className="py-2.5 px-3 text-right">Сумма</th>
                      <th className="py-2.5 px-4 text-center">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {statsData.recent_sales.map((sale: any) => (
                      <tr key={sale.order_id} className="hover:bg-white/[0.01] transition-all">
                        <td className="py-3 px-4 font-bold text-slate-400 select-all">
                          <a
                            href={`https://funpay.com/orders/${sale.order_id}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-brand-cyan transition-colors"
                          >
                            {sale.order_id}
                          </a>
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-semibold">{sale.date}</td>
                        <td className="py-3 px-3 text-white font-semibold max-w-[240px] truncate" title={sale.lot_name}>
                          {sale.lot_name}
                        </td>
                        <td className="py-3 px-3 text-brand-cyan font-bold">{sale.buyer_name}</td>
                        <td className="py-3 px-3 text-right font-black text-emerald-400">
                          {sale.price.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            {sale.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* МОДАЛКА РЕКОМЕНДАЦИИ */}
      <AnimatePresence>
        {selectedRecommendation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-xl bg-[#090A0F] border border-white/5 rounded-3xl p-6 relative overflow-hidden"
              onMouseMove={handleMouseMove}
            >
              <div className="glow-bg rounded-3xl" />
              
              <button
                onClick={() => setSelectedRecommendation(null)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg bg-white/5 border border-white/5 transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative z-10 space-y-5 text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    selectedRecommendation.type === 'danger' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                    selectedRecommendation.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                    selectedRecommendation.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  }`}>
                    {selectedRecommendation.type === 'danger' ? <AlertTriangle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{selectedRecommendation.title}</h3>
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-0.5 block">ИИ-Рекомендация по аудиту</span>
                  </div>
                </div>

                <div className="space-y-4 pt-3 border-t border-white/5 leading-relaxed text-xs">
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Проблема / Статус:</span>
                    <p className="text-slate-200 font-semibold">{selectedRecommendation.message}</p>
                  </div>
                  
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Совет ИИ-Консультанта:</span>
                    <p className="text-slate-300 font-semibold italic">«{selectedRecommendation.advice}»</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#090A0F]/60 border border-white/5 space-y-1.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Как исправить / Инструкция:</span>
                    <p className="text-slate-300 font-semibold">{selectedRecommendation.solution}</p>
                  </div>

                  {selectedRecommendation.actionLabel && (
                    <div className="p-3.5 rounded-2xl bg-brand-cyan/5 border border-brand-cyan/15 space-y-2">
                      <span className="text-[9px] font-black text-brand-cyan uppercase tracking-widest block">Быстрое исправление в 1 клик:</span>
                      <button
                        onClick={() => handleExecuteAction(selectedRecommendation.actionType)}
                        disabled={executingAction === selectedRecommendation.actionType}
                        className="py-2 px-4 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow shadow-brand-cyan/10"
                      >
                        {executingAction === selectedRecommendation.actionType ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-slate-950 font-bold" />
                        )}
                        <span>Выполнить: {selectedRecommendation.actionLabel}</span>
                      </button>
                    </div>
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
