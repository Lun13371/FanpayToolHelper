import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Star, User, RefreshCw, Edit2, X, ChevronDown, Terminal, TrendingUp,
  Zap, Check, Loader2, Link2, ArrowUpCircle,
  MessageSquare, Send, Sliders, CheckCircle2, Play, Settings,
  ToggleLeft, ToggleRight, Users, Flame, Clock, Crown, AlertTriangle, Sparkles, Lightbulb
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LotSettings, LotTemplate } from '../../types';

interface FunpayLot {
  lot_id: string;
  lot_name: string;
  price: number;
  amount: number;
  category: string;
  native_auto_delivery?: boolean;
}

interface ChatDialogue {
  node_id: string;
  username: string;
  avatar_url: string | null;
  last_message: string;
  is_unread: boolean;
  unread_count: number;
}

interface ChatMessage {
  author: string;
  text: string;
  is_me: boolean;
  time: string;
}

interface NativeDeliveryState {
  lot_id: string;
  price: number;
  amount: number;
  native_auto_delivery_enabled: boolean;
  native_auto_delivery_text: string;
}

export default function FunpayManagerTab() {
  const { token, selectedAccountId, accounts, fetchAccounts, setSelectedAccountId } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  // Глобальный режим экрана: 'control' (Управление лотами/ботом) или 'analytics' (Сводная статистика)
  const [globalMode, setGlobalMode] = useState<'control' | 'analytics'>('control');
  const [activeSubTab, setActiveSubTab] = useState<'chats' | 'lots' | 'settings' | 'logs'>('lots');
  
  // Быстрое переключение аккаунтов прямо из Менеджера
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Синхронизация и загрузки
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState('');
  const [raiseCountdown, setRaiseCountdown] = useState<string>('');
  const [lotsLoading, setLotsLoading] = useState(false);
  const [raising, setRaising] = useState(false);

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

  // Данные по лотам
  const [lots, setLots] = useState<FunpayLot[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [localRules, setLocalRules] = useState<LotSettings[]>([]);
  const [templates, setTemplates] = useState<LotTemplate[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<any[]>([]);

  // Состояния и эффекты логов (История действий)
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

  // Эффект WebSocket подключения для LIVE-логов
  useEffect(() => {
    if (!selectedAccountId || !token || activeSubTab !== 'logs') return;

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

    ws.onerror = (err) => {
      console.error('Ошибка WS логов:', err);
    };

    return () => {
      ws.close();
    };
  }, [selectedAccountId, token, activeSubTab]);

  // Эффект автоматической прокрутки логов вниз
  useEffect(() => {
    if (autoscroll && activeSubTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sysLogs, autoscroll, activeSubTab]);

  // Состояния и эффекты статистики продаж
  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditProgressStep, setAuditProgressStep] = useState(0);

  const runAiAudit = async () => {
    if (!selectedAccountId || auditLoading) return;
    setAuditLoading(true);
    setAuditProgressStep(0);
    
    const progressInterval = setInterval(() => {
      setAuditProgressStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 4000);

    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/run-ai-audit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
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
      console.error(err);
      alert('Ошибка при подключении к ИИ-ассистенту');
    } finally {
      clearInterval(progressInterval);
      setAuditLoading(false);
    }
  };

  const fetchStats = async (accId: number) => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${accId}/sales-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
      }
    } catch (err) {
      console.error('Ошибка получения статистики:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId && token && globalMode === 'analytics') {
      fetchStats(selectedAccountId);
    }
  }, [selectedAccountId, token, globalMode]);

  useEffect(() => {
    const el = recsContainerRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY * 0.95; // Оптимальная мгновенная отзывчивая прокрутка
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [statsData, globalMode]);

  // Состояния редактирования цены лота на FP
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingLotId, setUpdatingLotId] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<any | null>(null);

  // Настройки демпинга и родной автовыдачи в модалке лота
  const [selectedLot, setSelectedLot] = useState<FunpayLot | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Локальные правила демпинга лота
  const [ruleForm, setRuleForm] = useState({ min_price: '', undercut_value: '0.01', is_active: true });
  const [savingRule, setSavingRule] = useState(false);

  // Родная автовыдача Funpay
  const [nativeDelivery, setNativeDelivery] = useState<NativeDeliveryState | null>(null);
  const [loadingNative, setLoadingNative] = useState(false);
  const [savingNative, setSavingNative] = useState(false);

  // Мессенджер
  const [chats, setChats] = useState<ChatDialogue[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Настройки аккаунта
  const [settingsForm, setSettingsForm] = useState({ name: '', system_prompt: '', fallback_template: '', proxy_url: '', telegram_chat_id: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (currentAccount) {
      setSettingsForm({
        name: currentAccount.name,
        system_prompt: currentAccount.system_prompt || '',
        fallback_template: currentAccount.fallback_template || '',
        proxy_url: currentAccount.proxy_url || '',
        telegram_chat_id: currentAccount.telegram_chat_id || ''
      });
    }
  }, [selectedAccountId, currentAccount]);

  // Авто-поллиринг мессенджера
  useEffect(() => {
    if (selectedAccountId && token && activeSubTab === 'chats') {
      fetchChats();
      const interval = setInterval(fetchChats, 7000);
      return () => clearInterval(interval);
    }
  }, [selectedAccountId, token, activeSubTab]);

  // Авто-поллиринг переписки активного чата
  useEffect(() => {
    if (selectedAccountId && token && activeNodeId && activeSubTab === 'chats') {
      fetchMessages(activeNodeId);
      const interval = setInterval(() => fetchMessages(activeNodeId), 3500);
      return () => clearInterval(interval);
    }
  }, [selectedAccountId, token, activeNodeId, activeSubTab]);

  useEffect(() => {
    if (selectedAccountId && token) {
      loadLotsData();
      fetchTemplates();
    }
  }, [selectedAccountId, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadLotsData = async () => {
    setLotsLoading(true);
    await Promise.all([
      fetchLots(selectedAccountId!),
      fetchLocalRules(selectedAccountId!),
      fetchDeliveryItems(selectedAccountId!)
    ]);
    setLotsLoading(false);
  };

  // Получить товары автовыдачи нашего бота
  const fetchDeliveryItems = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveryItems(data);
      }
    } catch (err) {
      console.error('Ошибка получения товаров автовыдачи:', err);
    }
  };

  // Получить лоты из кэша / FP
  const fetchLots = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${accId}/sync-lots`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLots(data);
      }
    } catch (err) {
      console.error('Ошибка получения лотов:', err);
    }
  };

  // Получить настроенные правила демпинга в БД
  const fetchLocalRules = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLocalRules(data);
      }
    } catch (err) {
      console.error('Ошибка получения локальных правил:', err);
    }
  };

  // Получить глобальные шаблоны
  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Полная принудительная синхронизация (stats + lots)
  const handleFullSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    setSyncProgress(5);
    setSyncStepText('Прогресс: Инициализация сессии...');
    
    let progress = 5;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 5) + 3;
      if (progress > 93) {
        progress = 93; // Зажимаем на 93% пока идет реальный бэкенд запрос
      }
      setSyncProgress(progress);
      
      if (progress < 25) {
        setSyncStepText('Этап 1/4: Проверка прокси-соединения...');
      } else if (progress < 50) {
        setSyncStepText('Этап 2/4: Безопасный вход на Funpay...');
      } else if (progress < 75) {
        setSyncStepText('Этап 3/4: Запрос баланса и отзывов...');
      } else {
        setSyncStepText('Этап 4/4: Сбор и кэширование активных лотов...');
      }
    }, 150);

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

  // Подъем лотов
  const handleRaiseOffers = async () => {
    if (!selectedAccountId) return;
    setRaising(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/raise`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      alert(data.message);
      if (res.ok) {
        await fetchAccounts();
      }
    } catch {
      alert('Ошибка при поднятии лотов');
    } finally {
      setRaising(false);
    }
  };

  // Быстрое сохранение цены на FP
  const handleSavePrice = async (lotId: string) => {
    if (!selectedAccountId) return;
    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Введите корректную цену');
      return;
    }

    setUpdatingLotId(lotId);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/update-price`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lot_id: lotId, price: priceNum })
      });
      if (res.ok) {
        setEditingLotId(null);
        await fetchLots(selectedAccountId);
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой обновления цены');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setUpdatingLotId(null);
    }
  };

  // Мессенджер: получение списка чатов
  const fetchChats = async () => {
    if (!selectedAccountId) return;
    setChatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChatsLoading(false);
    }
  };

  // Мессенджер: получение переписки
  const fetchMessages = async (nodeId: string) => {
    if (!selectedAccountId) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats/${nodeId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Мессенджер: отправка сообщения оператором
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !activeNodeId || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats/${activeNodeId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: replyText })
      });
      if (res.ok) {
        setReplyText('');
        await fetchMessages(activeNodeId);
        fetchChats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось отправить сообщение');
      }
    } catch {
      alert('Ошибка отправки');
    } finally {
      setSendingReply(false);
    }
  };

  // Открытие модалки настроек конкретного лота (демпинг + родная автовыдача)
  const handleOpenConfig = async (lot: FunpayLot) => {
    setSelectedLot(lot);
    setShowConfigModal(true);
    
    // Подгружаем существующее правило демпинга из списка
    const rule = localRules.find(r => r.lot_id === lot.lot_id);
    if (rule) {
      setRuleForm({
        min_price: rule.min_price.toString(),
        undercut_value: rule.undercut_value.toString(),
        is_active: rule.is_active
      });
    } else {
      setRuleForm({ min_price: '', undercut_value: '0.01', is_active: true });
    }

    // Загружаем родную автовыдачу лота с Funpay на лету
    setLoadingNative(true);
    setNativeDelivery(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/${lot.lot_id}/native-delivery`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNativeDelivery(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingNative(false);
    }
  };

  // Сохранить локальное правило демпинга лота
  const handleSaveLocalRule = async () => {
    if (!selectedAccountId || !selectedLot) return;
    const minPriceNum = parseFloat(ruleForm.min_price);
    const undercutNum = parseFloat(ruleForm.undercut_value);
    
    if (isNaN(minPriceNum) || minPriceNum < 0) {
      alert('Введите корректную минимальную цену');
      return;
    }

    setSavingRule(true);
    try {
      const existingRule = localRules.find(r => r.lot_id === selectedLot.lot_id);
      
      const url = existingRule 
        ? `${API_URL}/api/v1/lots/${existingRule.id}` 
        : `${API_URL}/api/v1/lots`;
        
      const method = existingRule ? 'PUT' : 'POST';
      
      const payload = existingRule 
        ? { min_price: minPriceNum, undercut_value: undercutNum, is_active: ruleForm.is_active }
        : { account_id: selectedAccountId, lot_id: selectedLot.lot_id, lot_name: selectedLot.lot_name, min_price: minPriceNum, undercut_value: undercutNum };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchLocalRules(selectedAccountId);
        alert('Правило демпинга успешно сохранено в БД!');
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка сохранения демпинга');
      }
    } catch {
      alert('Ошибка соединения');
    } finally {
      setSavingRule(false);
    }
  };

  // Применить глобальный шаблон демпинга к лоту
  const handleApplyTemplate = async (templateId: number) => {
    if (!selectedAccountId || !selectedLot) return;
    if (!confirm('Применить этот глобальный шаблон к выбранному лоту?')) return;
    
    setSavingRule(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/${templateId}/apply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: selectedAccountId,
          lot_id: selectedLot.lot_id,
          lot_name: selectedLot.lot_name
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        await fetchLocalRules(selectedAccountId);
        
        // Обновляем форму в модалке
        const tpl = templates.find(t => t.id === templateId);
        if (tpl) {
          setRuleForm({
            min_price: tpl.min_price.toString(),
            undercut_value: tpl.undercut_value.toString(),
            is_active: tpl.is_active
          });
        }
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой применения шаблона');
      }
    } catch {
      alert('Ошибка соединения');
    } finally {
      setSavingRule(false);
    }
  };

  // Сохранить встроенную автовыдачу лота на самом Funpay
  const handleSaveNativeDelivery = async () => {
    if (!selectedAccountId || !selectedLot || !nativeDelivery) return;
    setSavingNative(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/${selectedLot.lot_id}/native-delivery`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          price: nativeDelivery.price,
          native_auto_delivery_enabled: nativeDelivery.native_auto_delivery_enabled,
          native_auto_delivery_text: nativeDelivery.native_auto_delivery_text
        })
      });
      if (res.ok) {
        alert('Настройки встроенной автовыдачи успешно сохранены на Funpay!');
        await loadLotsData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой отправки на Funpay');
      }
    } catch {
      alert('Ошибка сети при отправке на Funpay');
    } finally {
      setSavingNative(false);
    }
  };

  // Сохранить настройки аккаунта в БД
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: settingsForm.name,
          system_prompt: settingsForm.system_prompt,
          fallback_template: settingsForm.fallback_template,
          proxy_url: settingsForm.proxy_url,
          telegram_chat_id: settingsForm.telegram_chat_id
        })
      });
      if (res.ok) {
        alert('Настройки аккаунта успешно сохранены!');
        await fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка сохранения настроек');
      }
    } catch {
      alert('Ошибка соединения с сервером');
    } finally {
      setSavingSettings(false);
    }
  };

  // Переключить статус активности бота
  const handleToggleActive = async () => {
    if (!currentAccount) return;
    const nextActive = !currentAccount.is_active;
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${currentAccount.id}/toggle?active=${nextActive}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой изменения активности бота');
      }
    } catch {
      alert('Ошибка при выполнении команды');
    }
  };

  // Динамическая генерация рекомендаций ИИ на основе полученных данных аналитики
  const getAIRecommendations = () => {
    if (!statsData) return [];
    const recs: {
      id: string;
      type: 'danger' | 'warning' | 'info' | 'success';
      title: string;
      message: string;
      advice: string;
      detailedTitle: string;
      detailedSteps: string[];
      actionLabel: string;
      actionTab: 'lots' | 'chats' | 'settings' | 'logs';
    }[] = [];

    // 1. Проверка на плохие отзывы (оценки <= 4)
    const badReviews = statsData?.reviews_stats?.recent_reviews?.filter((r: any) => r.rating <= 4) || [];
    badReviews.forEach((rev: any, idx: number) => {
      recs.push({
        id: `bad_rev_${idx}`,
        type: 'danger',
        title: `Проблемный отзыв от ${rev.buyer} (${rev.rating}★)`,
        message: `Покупатель оставил негативную оценку: "${rev.text || 'Без текста'}" за товар "${rev.lot_info || 'Неизвестно'}".`,
        advice: `Срочно напишите клиенту в чате FunPay. Решите его проблему (выдайте замену, сделайте манибэк или бонус) и вежливо попросите исправить отзыв.`,
        detailedTitle: "Инструкция: Как исправить негативный отзыв и защитить рейтинг",
        detailedSteps: [
          "💬 Свяжитесь с клиентом: Моментально напишите покупателю в чате. Будьте предельно вежливы. Начните со слов: 'Здравствуйте! Нам очень жаль, что покупка оставила негативные эмоции. Расскажите подробнее, что случилось?'",
          "🛠 Решите проблему в пользу клиента: Если попался нерабочий товар, или произошла задержка — выдайте качественную замену или сделайте полный возврат средств. Для долгосрочного магазина репутация на FunPay гораздо ценнее мелких сумм.",
          "✍ Попросите исправить оценку: После успешного решения напишите: 'Если вопрос полностью решен и вы довольны сервисом, измените, пожалуйста, оценку в деталях заказа на 5★. Это очень важно для нас!' (Клиент может менять оценку в течение 30 дней после заказа)."
        ],
        actionLabel: "Открыть переписку / чаты",
        actionTab: "chats"
      });
    });

    // 2. Проверка доли автовыдач
    const autoRatio = statsData?.efficiency_stats?.auto_delivery_ratio ?? 100;
    if (autoRatio < 100) {
      recs.push({
        id: 'auto_delivery',
        type: 'warning',
        title: 'Увеличьте процент автовыдач',
        message: `Примерно ${100 - autoRatio}% ваших заказов обрабатываются в ручном режиме. Это увеличивает время ожидания клиентов и отвлекает вас от других задач.`,
        advice: `Зайдите во вкладку "Товары и демпинг", нажмите кнопку настроек лота и включите "Родную автовыдачу FunPay", добавив ключи/инструкции.`,
        detailedTitle: "Инструкция: Настройка моментальной автоматической выдачи товаров",
        detailedSteps: [
          "🛒 Перейдите в список товаров: Перейдите в раздел управления лотами 'Товары и демпинг'. Нажмите на шестеренку настроек рядом с лотом, который покупают чаще всего.",
          "⚙ Активируйте встроенную автовыдачу: Включите тумблер 'Родная автовыдача FunPay'.",
          "📝 Добавьте товары: Вставьте список ваших цифровых товаров (ключи, аккаунты, промокоды, ссылки на скачивание или подробные инструкции) в текстовое поле. Каждый товар должен быть расположен на новой строчке.",
          "💾 Сохраните изменения: Нажмите кнопку 'Сохранить на Funpay'. Теперь бот будет моментально отправлять товар покупателю сразу после оплаты, 24/7."
        ],
        actionLabel: "Перейти к товарам",
        actionTab: "lots"
      });
    }

    // 3. Проверка ночного пика продаж
    const heatmap = statsData?.hourly_heatmap || [];
    const nightSales = (heatmap[23] || 0) + (heatmap[0] || 0) + (heatmap[1] || 0) + (heatmap[2] || 0) + (heatmap[3] || 0) + (heatmap[4] || 0) + (heatmap[5] || 0);
    const totalSalesCount = statsData?.completed_count || 0;
    if (nightSales > 0 && totalSalesCount > 0 && (nightSales / totalSalesCount) > 0.2) {
      recs.push({
        id: 'night_sales',
        type: 'info',
        title: 'Пик активности в ночное время',
        message: `Более 20% ваших заказов совершаются в период с 23:00 до 06:00, когда менеджеры обычно оффлайн.`,
        advice: `Убедитесь, что в "Настройки бота" включена ИИ-поддержка, а сервер FunpayToolHelper работает круглосуточно.`,
        detailedTitle: "Инструкция: Оптимизация ночных продаж и круглосуточное удержание топа",
        detailedSteps: [
          "🤖 Включите автоответчик ИИ: Зайдите во вкладку 'Настройки бота' и активируйте ИИ-ассистента.",
          "⏱ Проверьте системный промпт: Отрегулируйте инструкции для ИИ-ассистента, чтобы он вежливо и подробно отвечал на ночные обращения клиентов.",
          "🖥 Обеспечьте онлайн-статус: Держите сервис FunpayToolHelper запущенным. Он автоматически поддерживает онлайн-статус на сайте, выводя ваши лоты на первые строчки в поиске FunPay именно ночью, когда конкуренция минимальна."
        ],
        actionLabel: "Открыть настройки бота",
        actionTab: "settings"
      });
    }

    // 4. Проверка VIP-покупателей
    const topBuyer = statsData?.loyalty_stats?.top_buyers?.[0];
    if (topBuyer && topBuyer.count >= 2) {
      recs.push({
        id: 'vip_buyer',
        type: 'success',
        title: `Лояльный клиент: ${topBuyer.username}`,
        message: `Покупатель ${topBuyer.username} совершил у вас уже ${topBuyer.count} покупок на общую сумму ${topBuyer.spent.toLocaleString('ru-RU')} ₽!`,
        advice: `Найдите его в чате через поиск и отправьте ему персональное сообщение с благодарностью и небольшим бонусом.`,
        detailedTitle: "Инструкция: Стратегия работы с постоянными VIP-клиентами",
        detailedSteps: [
          "👑 Персональный подход: Постоянные клиенты — это ядро вашего бизнеса, генерирующее до 70% долгосрочной выручки. Напишите покупателю лично в чате, поблагодарите за лояльность.",
          "🎁 Эксклюзивный бонус: Предложите постоянную скидку (например, 5-10% на следующие заказы) или подарите бесплатный цифровой бонус/промокод к следующей сделке.",
          "📈 LTV-эффект: Проявление внимания превратит покупателя в преданного адвоката вашего бренда, который будет покупать у вас годами и рекомендовать друзьям."
        ],
        actionLabel: "Открыть переписку / чаты",
        actionTab: "chats"
      });
    }

    return recs;
  };

  // Простейший ИИ-парсер разметки отчетов для глубокого аудита
  const formatDeepAuditText = (text: string) => {
    if (!text) return null;

    // Вспомогательный парсер жирного текста (**тема**)
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
      // Обычные нумерованные пункты плана роста
      if (/^\d+\.\s+/.test(line)) {
        const numMatch = line.match(/^(\d+)\.\s+/);
        const cleanLine = line.replace(/^\d+\.\s+/, '');
        return (
          <div key={idx} className="flex gap-3 text-xs leading-relaxed my-2 pl-1">
            <div className="w-5 h-5 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0 font-extrabold text-[10px] text-brand-cyan">
              {numMatch ? numMatch[1] : '•'}
            </div>
            <p className="text-slate-300 font-semibold">{parseInlineFormatting(cleanLine)}</p>
          </div>
        );
      }
      if (line.trim() === '') return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-[11px] text-slate-300 leading-relaxed font-semibold my-1 pl-1">
          {parseInlineFormatting(line)}
        </p>
      );
    });
  };

  if (!selectedAccountId) {
    return (
      <div className="text-slate-400 text-center py-12 glow-card rounded-3xl">
        Сначала выберите сессию во вкладке "Главная"
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
    >
      {/* 1. ШАПКА КАБИНЕТА (КОМПАКТНАЯ СТАТИСТИКА С FORCE-SYNC) */}
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        
        {/* Анимированный прогресс-бар синхронизации на самом верху карточки */}
        {syncing && (
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-950/80 overflow-hidden rounded-t-3xl z-30">
            <motion.div 
              className="bg-gradient-to-r from-brand-cyan to-brand-blue h-full"
              initial={{ width: '0%' }}
              animate={{ width: `${syncProgress}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
        )}
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-30">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 relative z-30" ref={dropdownRef}>
              <span className={`w-2.5 h-2.5 rounded-full ${currentAccount?.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
              
              <div className="relative">
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-slate-200 hover:text-white transition-all text-xs font-bold"
                  title="Быстрое переключение аккаунтов"
                >
                  <span className="text-sm font-bold">Сессия: {currentAccount?.name}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showAccountDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Выпадающий список всех подключенных аккаунтов */}
                <AnimatePresence>
                  {showAccountDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-0 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-3 py-1.5 border-b border-white/5 mb-1">
                        Переключить сессию FP
                      </div>
                      <div className="max-h-[220px] overflow-y-auto no-scrollbar space-y-0.5">
                        {accounts.map((acc) => {
                          const isSelected = acc.id === selectedAccountId;
                          return (
                            <button
                              key={acc.id}
                              onClick={() => {
                                setSelectedAccountId(acc.id);
                                setShowAccountDropdown(false);
                              }}
                              className={`w-full flex items-center justify-between text-left py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/15'
                                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${acc.is_active ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                <span className="truncate">{acc.name}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-brand-cyan" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Последняя синхронизация с Funpay:{' '}
              <b className="text-slate-300" title={currentAccount?.last_synced ? new Date(currentAccount.last_synced).toLocaleString('ru-RU') : ''}>
                {getTimeAgo(currentAccount?.last_synced)}
              </b>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            {/* Глобальный переключатель режимов: Управление / Аналитика */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/40 border border-white/5 mr-1.5 shrink-0">
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
                <span>Аналитика</span>
              </button>
            </div>

            {/* Ручной подъем */}
            <button
              onClick={handleRaiseOffers}
              disabled={raising || syncing}
              className="py-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {raising ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Поднять лоты</span>
            </button>

            {/* Force Sync с выводом стадий процесса */}
            <button
              onClick={handleFullSync}
              disabled={syncing || lotsLoading}
              className="py-2 px-4 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-brand-cyan/10"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="animate-pulse">{syncStepText} [{syncProgress}%]</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Обновить все данные</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* СЕТКА СТАТИСТИКИ (4 КОЛОНКИ С УМНЫМ АВТОПОДНЯТИЕМ) */}
        {globalMode === 'control' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 relative z-10 pt-5 border-t border-white/5">
            {/* Баланс */}
            <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Wallet className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Баланс</span>
                <h3 className="text-sm sm:text-md font-bold text-white mt-0.5">
                  {currentAccount?.balance !== undefined ? `${currentAccount.balance.toLocaleString('ru-RU')} ₽` : '0.00 ₽'}
                </h3>
              </div>
            </div>

            {/* Рейтинг */}
            <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Star className="w-4.5 h-4.5 text-amber-400 fill-amber-400/20" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Оценка и отзывы</span>
                <h3 className="text-sm sm:text-md font-bold text-white mt-0.5">
                  {currentAccount?.rating ? currentAccount.rating.toFixed(2) : '0.00'}{' '}
                  <span className="text-slate-500 text-[10px] font-semibold">({currentAccount?.reviews_count || 0} отз.)</span>
                </h3>
              </div>
            </div>

            {/* Умное автоподнятие */}
            <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center shrink-0">
                <ArrowUpCircle className="w-4.5 h-4.5 text-brand-blue" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">До поднятия</span>
                <h3 className="text-sm sm:text-md font-bold text-white mt-0.5 flex flex-col">
                  <span className="text-brand-cyan filter drop-shadow-[0_0_3px_rgba(0,242,254,0.15)]">{raiseCountdown}</span>
                  <span className="text-[8px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5" title={currentAccount?.last_raised ? new Date(currentAccount.last_raised).toLocaleString() : ''}>
                    Поднято: {getTimeAgo(currentAccount?.last_raised)}
                  </span>
                </h3>
              </div>
            </div>

            {/* Профиль */}
            <div className="p-3.5 rounded-2xl bg-slate-950/35 border border-white/5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
                <User className="w-4.5 h-4.5 text-brand-cyan" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Профиль</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-bold text-white truncate block">
                    {currentAccount?.name.includes('(') ? currentAccount.name.substring(currentAccount.name.indexOf('(') + 1, currentAccount.name.length - 1) : 'Неизвестно'}
                  </span>
                  {currentAccount?.funpay_user_id && (
                    <a
                      href={`https://funpay.com/users/${currentAccount.funpay_user_id}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-500 hover:text-brand-cyan transition-colors shrink-0"
                    >
                      <Link2 className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ГЛОБАЛЬНЫЙ РЕЖИМ: УПРАВЛЕНИЕ */}
      {globalMode === 'control' && (
        <>
          {/* 2. НАВИГАЦИОННЫЙ ПЕРЕКЛЮЧАТЕЛЬ САБ-ВКЛАДОК */}
          <div className="flex flex-wrap md:flex-nowrap md:items-center gap-1.5 p-1 rounded-2xl bg-slate-950/50 border border-white/5 w-full md:w-fit">
        <button
          onClick={() => setActiveSubTab('lots')}
          className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none ${
            activeSubTab === 'lots' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Товары и Демпинг</span>
        </button>
        <button
          onClick={() => {
            setActiveSubTab('chats');
            fetchChats();
          }}
          className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none ${
            activeSubTab === 'chats' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Переписка / Чат</span>
        </button>
        <button
          onClick={() => setActiveSubTab('settings')}
          className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none ${
            activeSubTab === 'settings' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Настройки бота</span>
        </button>
        <button
          onClick={() => setActiveSubTab('logs')}
          className={`py-2 px-3.5 md:px-5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center md:justify-start gap-1.5 flex-1 md:flex-none ${
            activeSubTab === 'logs' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>История действий</span>
        </button>
      </div>

      {/* 3. КОНТЕНТ В ЗАВИСИМОСТИ ОТ САБ-ВКЛАДКИ */}
      <AnimatePresence mode="wait">
        {activeSubTab === 'lots' && (
          <motion.div
            key="tab_lots"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-5 sm:p-6 rounded-3xl glow-card relative"
            onMouseMove={handleMouseMove}
          >
            <div className="glow-bg rounded-3xl" />
            
            <div className="flex items-center justify-between mb-5 relative z-10 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Zap className="w-4.5 h-4.5 text-brand-cyan" />
                <h2 className="text-sm font-bold text-white">Список ваших лотов на Funpay</h2>
              </div>
              <span className="text-[9px] bg-white/5 border border-white/10 text-slate-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                {lots.length} активных товаров
              </span>
            </div>

            {/* Фильтр по категориям */}
            {lots.length > 0 && !lotsLoading && (
              <div className="flex flex-wrap gap-1.5 mb-5 relative z-10 max-h-[120px] overflow-y-auto no-scrollbar">
                {['all', ...Array.from(new Set(lots.map(l => l.category)))].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`py-1.5 px-3 rounded-xl text-[9px] font-bold uppercase tracking-wider border transition-all ${
                      selectedCategory === cat
                        ? 'bg-brand-cyan/15 border-brand-cyan/30 text-brand-cyan'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                    }`}
                  >
                    {cat === 'all' ? 'Все категории' : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Лоадер */}
            {lotsLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 relative z-10">
                <Loader2 className="w-7 h-7 animate-spin text-brand-cyan" />
                <span className="text-xs font-semibold">Синхронизация лотов...</span>
              </div>
            ) : lots.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs relative z-10">
                Лоты на Funpay не найдены. Сделайте полную синхронизацию!
              </div>
            ) : (
              (() => {
                // Группируем лоты по категориям
                const groupedLots = lots.reduce((acc, lot) => {
                  const cat = lot.category || 'Другое';
                  if (!acc[cat]) {
                    acc[cat] = [];
                  }
                  acc[cat].push(lot);
                  return acc;
                }, {} as Record<string, FunpayLot[]>);

                const categoriesToRender = selectedCategory === 'all' 
                  ? Object.keys(groupedLots) 
                  : [selectedCategory].filter(cat => groupedLots[cat]);

                return (
                  <div className="space-y-6 relative z-10">
                    {categoriesToRender.map((catName) => {
                      const catLots = groupedLots[catName] || [];
                      return (
                        <div key={catName} className="rounded-2xl border border-white/5 bg-slate-950/25 overflow-hidden">
                          {/* Красивая плашка категории с таймерами кулдауна поднятия */}
                          <div className="bg-slate-950/40 px-4 py-3 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full animate-pulse ${currentAccount?.is_active ? 'bg-brand-cyan' : 'bg-slate-500'}`} />
                              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">{catName}</h3>
                              <span className="text-[9px] bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                                {catLots.length} шт.
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Последнее поднятие:</span>
                                <span className="text-slate-300" title={currentAccount?.last_raised ? new Date(currentAccount.last_raised).toLocaleString() : ''}>
                                  {getTimeAgo(currentAccount?.last_raised)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 border-l border-white/5 pl-4">
                                <span className="text-slate-500">До поднятия:</span>
                                <span className="text-brand-cyan filter drop-shadow-[0_0_2px_rgba(0,242,254,0.15)]">{raiseCountdown}</span>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto no-scrollbar">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="text-[9px] text-slate-500 uppercase font-bold tracking-wider border-b border-white/5 bg-slate-950/10">
                                  <th className="py-2.5 px-4">Название лота (Funpay)</th>
                                  <th className="py-2.5 px-3">Кол-во</th>
                                  <th className="py-2.5 px-3 text-right">Цена на Funpay</th>
                                  <th className="py-2.5 px-3 text-right">Статус Демпинга</th>
                                  <th className="py-2.5 px-4 text-center">Настройка</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {catLots.map((lot) => {
                                  const isEditing = editingLotId === lot.lot_id;
                                  const isUpdating = updatingLotId === lot.lot_id;
                                  const localRule = localRules.find(r => r.lot_id === lot.lot_id);

                                  const hasBotDelivery = deliveryItems.some(item => item.lot_name === lot.lot_name && !item.is_sold);
                                  const hasNativeDelivery = lot.native_auto_delivery;

                                  return (
                                    <tr key={lot.lot_id} className="hover:bg-white/[0.01] transition-all">
                                      <td className="py-3 px-4 font-semibold text-white max-w-[320px] truncate" title={lot.lot_name}>
                                        <div className="flex items-center gap-2 max-w-full">
                                          <span className="truncate">{lot.lot_name}</span>
                                          {hasNativeDelivery && (
                                            <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 filter drop-shadow-[0_0_2px_rgba(245,158,11,0.2)]">
                                              ⚡ FP-Автовыдача
                                            </span>
                                          )}
                                          {hasBotDelivery && (
                                            <span className="text-[8px] bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 filter drop-shadow-[0_0_2px_rgba(0,242,254,0.2)]">
                                              🤖 БОТ-ВЫДАЧА
                                            </span>
                                          )}
                                          {!hasNativeDelivery && !hasBotDelivery && (
                                            <span className="text-[8px] bg-slate-500/10 border border-slate-500/20 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                                              👤 Ручная
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3 px-3 text-slate-400 font-bold">
                                        {lot.amount} шт.
                                      </td>
                                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        {isEditing ? (
                                          <div className="flex items-center justify-end gap-1.5">
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={editPrice}
                                              onChange={(e) => setEditPrice(e.target.value)}
                                              className="w-20 bg-slate-950/60 border border-brand-cyan/30 rounded-lg py-1 px-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                                              disabled={isUpdating}
                                            />
                                            <button
                                              onClick={() => handleSavePrice(lot.lot_id)}
                                              disabled={isUpdating}
                                              className="p-1.5 bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/30 rounded-lg transition-colors"
                                            >
                                              {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                              onClick={() => setEditingLotId(null)}
                                              disabled={isUpdating}
                                              className="p-1.5 bg-white/5 border border-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-end gap-1.5 group">
                                            <span className="font-bold text-white">{lot.price.toLocaleString('ru-RU')} ₽</span>
                                            <button
                                              onClick={() => {
                                                setEditingLotId(lot.lot_id);
                                                setEditPrice(lot.price.toString());
                                              }}
                                              className="p-1 border border-transparent hover:border-white/5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-right">
                                        {localRule ? (
                                          <div className="flex flex-col items-end gap-0.5">
                                            <span className={`text-[8px] border px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${localRule.is_active ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'}`}>
                                              {localRule.is_active ? 'АКТИВЕН' : 'ПАУЗА'}
                                            </span>
                                            <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">
                                              Мин: {localRule.min_price} ₽ / Шаг: {localRule.undercut_value}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-[9px] text-slate-500 uppercase font-semibold">Не настроен</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <button
                                          onClick={() => handleOpenConfig(lot)}
                                          className="py-1 px-3 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 hover:border-white/10 rounded-lg text-[10px] font-bold transition-all"
                                        >
                                          Настроить ⚙️
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </motion.div>
        )}

        {activeSubTab === 'chats' && (
          <motion.div
            key="tab_chats"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* СПИСОК ДИАЛОГОВ */}
            <div className="lg:col-span-4 p-5 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              
              <div className="flex items-center justify-between mb-4 relative z-10 pb-2 border-b border-white/5">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Все диалоги</h2>
                <button
                  onClick={fetchChats}
                  disabled={chatsLoading}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${chatsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2 relative z-10 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
                {chats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">Нет active-диалогов на Funpay</div>
                ) : (
                  chats.map((chat) => (
                    <button
                      key={chat.node_id}
                      onClick={() => {
                        setActiveNodeId(chat.node_id);
                        setMessages([]);
                        fetchMessages(chat.node_id);
                      }}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                        activeNodeId === chat.node_id 
                          ? 'bg-brand-cyan/10 border-brand-cyan/30' 
                          : 'bg-slate-950/20 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 shrink-0 overflow-hidden relative">
                        {chat.avatar_url ? (
                          <img src={chat.avatar_url} alt="Ava" className="w-full h-full object-cover animate-fade-in" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase">
                            {chat.username[0]}
                          </div>
                        )}
                        {chat.is_unread && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-[#06070A] rounded-full" />
                        )}
                      </div>

                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className={`text-xs font-bold truncate ${chat.is_unread ? 'text-white' : 'text-slate-200'}`}>
                            {chat.username}
                          </h4>
                          {chat.unread_count > 0 && (
                            <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center shrink-0">
                              {chat.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{chat.last_message || 'Без текста'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ИСТОРИЯ ПЕРЕПИСКИ И ОТПРАВКА */}
            <div className="lg:col-span-8 p-5 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />

              {activeNodeId ? (
                <div className="flex flex-col h-[540px] relative z-10">
                  {/* Имя контакта */}
                  <div className="pb-3 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Диалог #{activeNodeId}</span>
                    </h3>
                    <span className="text-[9px] text-slate-400 font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
                      Интеграция ИИ активна
                    </span>
                  </div>

                  {/* Окно переписки */}
                  <div className="flex-grow overflow-y-auto py-4 space-y-3 pr-1 no-scrollbar">
                    {messagesLoading && messages.length === 0 ? (
                      <div className="text-center py-20 text-slate-500 text-xs">Загрузка переписки...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-20 text-slate-500 text-xs">История сообщений пуста</div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`flex flex-col max-w-[80%] ${msg.is_me ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                        >
                          <div className={`p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
                            msg.is_me 
                              ? 'bg-brand-cyan text-slate-950 rounded-tr-none' 
                              : 'bg-slate-950/40 border border-white/5 text-slate-200 rounded-tl-none'
                          }`}>
                            {msg.text}
                          </div>
                          <span className="text-[9px] text-slate-500 font-semibold mt-1 px-1">{msg.time || msg.author}</span>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Форма ответа */}
                  <form onSubmit={handleSendMessage} className="pt-3 border-t border-white/5 flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Напишите ответ покупателю..."
                      className="flex-grow bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                      disabled={sendingReply}
                      required
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="p-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl transition-all disabled:opacity-50 shrink-0"
                    >
                      {sendingReply ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 fill-current" />
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="h-[540px] flex flex-col items-center justify-center text-center text-slate-400 gap-3 relative z-10">
                  <MessageSquare className="w-10 h-10 text-slate-600 animate-pulse" />
                  <div>
                    <h3 className="font-bold text-slate-300 text-sm">Выберите диалог из списка</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">Вы сможете мгновенно отвечать покупателям. При вашем ответе автоответчик засыпает на 20 минут.</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'settings' && (
          <motion.div
            key="tab_settings"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-5 sm:p-6 rounded-3xl glow-card relative"
            onMouseMove={handleMouseMove}
          >
            <div className="glow-bg rounded-3xl" />
            
            <div className="flex items-center justify-between mb-5 relative z-10 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-brand-cyan" />
                <h2 className="text-sm font-bold text-white">Управление сессией и настройки ИИ</h2>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* ЛЕВАЯ КОЛОНКА: ОСНОВНОЕ И СТАТУС */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-white/5">Основная конфигурация</h3>
                  
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Название сессии</label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">SOCKS5/HTTP Прокси-сервер</label>
                    <input
                      type="text"
                      value={settingsForm.proxy_url}
                      onChange={(e) => setSettingsForm({ ...settingsForm, proxy_url: e.target.value })}
                      className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                      placeholder="socks5://user:pass@ip:port"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Telegram Chat ID (Уведомления)</label>
                    <input
                      type="text"
                      value={settingsForm.telegram_chat_id}
                      onChange={(e) => setSettingsForm({ ...settingsForm, telegram_chat_id: e.target.value })}
                      className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                      placeholder="например, -100123456789"
                    />
                  </div>

                  {/* Статус бота */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 mt-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Активность бота</span>
                      <span className={`text-xs font-bold mt-1 block ${currentAccount?.is_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {currentAccount?.is_active ? '● СЛУЖБА ЗАПУЩЕНА' : '○ ОСТАНОВЛЕНО'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleActive}
                      className={`py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                        currentAccount?.is_active
                          ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15'
                      }`}
                    >
                      {currentAccount?.is_active ? 'Остановить бота' : 'Запустить бота'}
                    </button>
                  </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА: ИИ НАСТРОЙКИ */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-white/5">Настройки автоответчика ИИ</h3>
                  
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Системные инструкции (System Prompt)</label>
                    <textarea
                      value={settingsForm.system_prompt}
                      onChange={(e) => setSettingsForm({ ...settingsForm, system_prompt: e.target.value })}
                      rows={4}
                      className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40 resize-none leading-relaxed"
                      placeholder="Инструкции для ИИ..."
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Запасное сообщение (Fallback Template)</label>
                    <textarea
                      value={settingsForm.fallback_template}
                      onChange={(e) => setSettingsForm({ ...settingsForm, fallback_template: e.target.value })}
                      rows={3}
                      className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40 resize-none leading-relaxed"
                      placeholder="Если ИИ временно отключен..."
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="py-2.5 px-6 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-brand-cyan/10"
                >
                  {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 fill-current" />}
                  <span>Сохранить настройки</span>
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {activeSubTab === 'logs' && (
          <motion.div
            key="tab_logs"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-5 sm:p-6 rounded-3xl glow-card relative"
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
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
                    <span>Подключение к терминалу логирования...</span>
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
        )}
      </AnimatePresence>
    </>
  )}

  {/* ГЛОБАЛЬНЫЙ РЕЖИМ: АНАЛИТИКА */}
  {globalMode === 'analytics' && (
    <motion.div
      key="tab_analytics"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
    >
      {statsLoading && !statsData ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400 glow-card rounded-3xl relative overflow-hidden">
          <div className="glow-bg rounded-3xl" />
          <Loader2 className="w-8 h-8 animate-spin text-brand-cyan relative z-10" />
          <span className="text-xs font-semibold relative z-10">Сбор финансовой аналитики с FunPay...</span>
        </div>
      ) : (
        <>
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
              
              <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-6 relative z-10">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-brand-cyan" />
                  <span>Динамика продаж</span>
                </h3>
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
              
              {(() => {
                const activeChartData = statsData?.chart_data?.[chartPeriod] || statsData?.daily_sales || [];
                const maxRevenue = Math.max(...activeChartData.map((d: any) => d.revenue), 1);
                
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
                        const percent = (day.revenue / maxRevenue) * 100;
                        return (
                          <div key={idx} className="flex flex-col items-center flex-1 group h-full justify-end relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 bg-slate-950/95 border border-white/10 text-white rounded-xl py-1.5 px-2 text-[9px] font-bold shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 text-center leading-normal shrink-0">
                              <div className="text-brand-cyan font-extrabold">{day.revenue.toLocaleString('ru-RU')} ₽</div>
                              <div className="text-slate-400 mt-0.5">{day.count} зак.</div>
                            </div>
                            
                            {/* Столбик */}
                            <motion.div
                              initial={{ height: '0%' }}
                              animate={{ height: `${percent}%` }}
                              transition={{ duration: 0.4, delay: Math.min(idx * 0.02, 0.5) }}
                              className={`bg-gradient-to-t from-brand-blue/30 to-brand-cyan/80 hover:to-brand-cyan rounded-t transition-all shadow-lg hover:shadow-brand-cyan/20 cursor-pointer ${
                                chartPeriod === 'week' ? 'w-8 sm:w-10' :
                                chartPeriod === 'month' ? 'w-1.5 sm:w-2.5 mx-0.5' :
                                'w-6 sm:w-8'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Временные метки (дни/месяцы) */}
                    <div className="flex justify-between mt-3 px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {activeChartData.map((day: any, idx: number) => {
                        // Для месяца отображаем только каждую 5-ю метку, чтобы не сливались
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

            {/* Справа: Свежие отзывы */}
            <div className="lg:col-span-8 p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 pb-2 border-b border-white/5 flex items-center gap-1.5 relative z-10">
                <MessageSquare className="w-4 h-4 text-brand-cyan" />
                <span>Свежие отзывы покупателей с Funpay</span>
              </h3>

              {(!statsData?.reviews_stats?.recent_reviews || statsData.reviews_stats.recent_reviews.length === 0) ? (
                <div className="py-12 text-center text-slate-500 italic relative z-10">
                  Отзывы с текстом на странице не найдены.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[310px] overflow-y-auto pr-1 relative z-10 no-scrollbar">
                  {statsData.reviews_stats.recent_reviews.map((rev: any, idx: number) => (
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
                      
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
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
                      </div>

                      {rev.text && (
                        <p className="text-slate-300 text-xs font-semibold leading-relaxed pl-1 italic">
                          «{rev.text}»
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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

                  {/* VIP-клиенты (Топ-5 покупателей) */}
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
                  
                  {/* Сетка 24 часов (2 ряда по 12 ячеек) */}
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mt-4">
                    {(() => {
                      const heatmap = statsData.hourly_heatmap;
                      const maxVal = Math.max(...heatmap, 1);
                      return heatmap.map((count: number, hour: number) => {
                        const ratio = count / maxVal;
                        // Выбираем цвет ячейки на основе интенсивности продаж в этот час
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
                            
                            {/* Наш высокотехнологичный Tooltip */}
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

          {/* ИИ-СОВЕТНИК И ПРОГНОЗИРОВАНИЕ ПРОДАЖ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {/* Слева: Аудит и рекомендации */}
            <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl glow-card relative flex flex-col justify-between" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              <div className="w-full">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 pb-2 border-b border-white/5 flex items-center justify-between gap-2 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-brand-cyan" />
                    <span>Центр рекомендаций ИИ и Аудит магазина</span>
                  </div>
                  
                  {statsData?.ai_key_exists ? (
                    <div className="flex items-center gap-2 shrink-0">
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
                          "Сбор живых данных с FunPay (сделки, баланс, лоты)...",
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
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Ваш  магазин работает идеально!</h4>
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
                            // Настройка стилей в зависимости от типа рекомендации
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
                                <div className="space-y-1.5 min-w-0">
                                  <h4 className={`text-xs font-bold uppercase tracking-wider ${titleColor} truncate`} title={rec.title}>{rec.title}</h4>
                                  <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">{rec.message}</p>
                                  <div className="pt-2 border-t border-white/5 space-y-1">
                                    <span className="text-[8px] font-black text-brand-cyan uppercase tracking-widest block">ИИ-Совет:</span>
                                    <p className="text-[10px] text-slate-400 leading-normal font-semibold italic">{rec.advice}</p>
                                  </div>
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
              <div className="pt-3 border-t border-white/5 mt-4 text-[9px] font-bold text-slate-500 leading-normal flex items-center gap-1.5 relative z-10 w-full">
                {statsData?.ai_key_exists ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-brand-cyan animate-pulse shrink-0" />
                    <span>Интеллектуальный глубокий аудит подготовлен ИИ-ассистентом на основе ваших реальных лотов и сделок.</span>
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
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
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
    </motion.div>
  )}

      {/* 4. МОДАЛКА НАСТРОЕК ЛОТА (ДЕПИНГ + ШАБЛОНЫ + ВСТРОЕННАЯ АВТОВЫДАЧА) */}
      <AnimatePresence>
        {showConfigModal && selectedLot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl bg-[#090A0F] border border-white/5 rounded-3xl p-6 relative overflow-hidden"
              onMouseMove={handleMouseMove}
            >
              <div className="glow-bg rounded-3xl" />
              
              {/* Кнопка закрытия */}
              <button
                onClick={() => setShowConfigModal(false)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg bg-white/5 border border-white/5 transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative z-10 space-y-6">
                {/* Шапка */}
                <div>
                  <span className="text-[9px] bg-brand-cyan/15 border border-brand-cyan/20 text-brand-cyan px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {selectedLot?.category}
                  </span>
                  <h2 className="text-md sm:text-lg font-bold text-white mt-1.5 pr-8">{selectedLot?.lot_name}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-white/5">
                  
                  {/* ЛЕВАЯ КОЛОНКА: ДЕМПИНГ И ШАБЛОНЫ */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-white/5">
                      <Sliders className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Параметры демпинга</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Лимит мин. цены (₽)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={ruleForm.min_price}
                          onChange={(e) => setRuleForm({ ...ruleForm, min_price: e.target.value })}
                          className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                          placeholder="Цена"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Шаг демпинга (₽)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={ruleForm.undercut_value}
                          onChange={(e) => setRuleForm({ ...ruleForm, undercut_value: e.target.value })}
                          className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                          placeholder="Шаг"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Демпинг активен</span>
                      <button
                        onClick={() => setRuleForm({ ...ruleForm, is_active: !ruleForm.is_active })}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {ruleForm.is_active ? (
                          <ToggleRight className="w-7 h-7 text-brand-cyan" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-slate-600" />
                        )}
                      </button>
                    </div>

                    <button
                      onClick={handleSaveLocalRule}
                      disabled={savingRule}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      {savingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-brand-cyan" />}
                      <span>Применить правила</span>
                    </button>

                    {/* Натянуть глобальный шаблон */}
                    <div className="pt-4 border-t border-white/5">
                      <label className="text-[9px] font-bold text-slate-500 uppercase mb-1.5 block">Применить глобальный шаблон:</label>
                      {templates.length === 0 ? (
                        <div className="text-[10px] text-slate-500 italic">У вас еще нет шаблонов. Создайте их в меню "Шаблоны"!</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto no-scrollbar">
                          {templates.map(tpl => (
                            <button
                              key={tpl.id}
                              onClick={() => handleApplyTemplate(tpl.id)}
                              className="py-1 px-2 bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/15 rounded-lg text-[9px] font-bold tracking-wide transition-all inline-flex items-center gap-1 uppercase"
                            >
                              <Play className="w-2 h-2 fill-current" />
                              <span>{tpl.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ПРАВАЯ КОЛОНКА: ВСТРОЕННАЯ АВТОВЫДАЧА FUNPAY */}
                  <div className="space-y-4 md:border-l md:border-white/5 md:pl-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-white/5">
                      <Zap className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Родная автовыдача FunPay</span>
                    </h3>

                    {loadingNative ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
                        <span>Чтение данных с Funpay...</span>
                      </div>
                    ) : nativeDelivery ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/5">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Родная автовыдача</span>
                          <button
                            onClick={() => {
                              if (nativeDelivery) {
                                setNativeDelivery({
                                  ...nativeDelivery,
                                  native_auto_delivery_enabled: !nativeDelivery.native_auto_delivery_enabled
                                });
                              }
                            }}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            {nativeDelivery.native_auto_delivery_enabled ? (
                              <ToggleRight className="w-7 h-7 text-brand-cyan" />
                            ) : (
                              <ToggleLeft className="w-7 h-7 text-slate-600" />
                            )}
                          </button>
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase mb-1.5 block">Текст выдачи товара (ключ / инструкция):</label>
                          <textarea
                            value={nativeDelivery.native_auto_delivery_text}
                            onChange={(e) => {
                              if (nativeDelivery) {
                                setNativeDelivery({
                                  ...nativeDelivery,
                                  native_auto_delivery_text: e.target.value
                                });
                              }
                            }}
                            rows={4}
                            className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40 resize-none leading-relaxed font-mono"
                            placeholder="Введите text/ссылки для автовыдачи..."
                          />
                        </div>

                        <button
                          onClick={handleSaveNativeDelivery}
                          disabled={savingNative}
                          className="w-full py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10"
                        >
                          {savingNative ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 fill-current" />}
                          <span>Сохранить на Funpay</span>
                        </button>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-500 text-xs italic">
                        Не удалось получить настройки автовыдачи с Funpay для этого товара (категория может не поддерживать встроенную выдачу).
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. МОДАЛКА ПОДРОБНОГО РЕШЕНИЯ ИИ-РЕКОМЕНДАЦИИ */}
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
              
              {/* Кнопка закрытия */}
              <button
                onClick={() => setSelectedRecommendation(null)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg bg-white/5 border border-white/5 transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative z-10 space-y-5">
                {/* Иконка и тип проблемы */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    selectedRecommendation.type === 'danger' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                    selectedRecommendation.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                    selectedRecommendation.type === 'info' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' :
                    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  }`}>
                    {selectedRecommendation.type === 'danger' && <AlertTriangle className="w-4 h-4" />}
                    {selectedRecommendation.type === 'warning' && <Zap className="w-4 h-4" />}
                    {selectedRecommendation.type === 'info' && <Clock className="w-4 h-4" />}
                    {selectedRecommendation.type === 'success' && <Crown className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest block text-slate-500">
                      ИИ-Ассистент Аудит
                    </span>
                    <h3 className="text-sm font-black text-white">{selectedRecommendation.title}</h3>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 space-y-4">
                  {/* Заголовок решения */}
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-cyan animate-pulse" />
                    <span>{selectedRecommendation.detailedTitle}</span>
                  </h4>

                  {/* Пошаговая инструкция */}
                  <div className="space-y-3.5 max-h-[280px] overflow-y-auto no-scrollbar pr-1">
                    {selectedRecommendation.detailedSteps.map((step: string, idx: number) => (
                      <div key={idx} className="flex gap-3 text-xs leading-relaxed">
                        <div className="w-5 h-5 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0 font-extrabold text-[10px] text-brand-cyan">
                          {idx + 1}
                        </div>
                        <p className="text-slate-300 font-semibold">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Действие */}
                <div className="pt-4 border-t border-white/5 flex gap-3">
                  <button
                    onClick={() => setSelectedRecommendation(null)}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={() => {
                      setGlobalMode('control');
                      setActiveSubTab(selectedRecommendation.actionTab);
                      setSelectedRecommendation(null);
                    }}
                    className="flex-1 py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10"
                  >
                    <span>{selectedRecommendation.actionLabel}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

