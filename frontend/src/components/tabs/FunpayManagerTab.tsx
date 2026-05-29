import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Star, User, RefreshCw, Edit2, X, 
  Zap, Check, Loader2, Link2, 
  MessageSquare, Send, Sliders, CheckCircle2, Play, Settings,
  ToggleLeft, ToggleRight
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
  const { token, selectedAccountId, accounts, fetchAccounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [activeSubTab, setActiveSubTab] = useState<'chats' | 'lots' | 'settings'>('lots');

  // Синхронизация и загрузки
  const [syncing, setSyncing] = useState(false);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [raising, setRaising] = useState(false);

  // Данные по лотам
  const [lots, setLots] = useState<FunpayLot[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [localRules, setLocalRules] = useState<LotSettings[]>([]);
  const [templates, setTemplates] = useState<LotTemplate[]>([]);

  // Состояния редактирования цены лота на FP
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingLotId, setUpdatingLotId] = useState<string | null>(null);

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
      fetchLocalRules(selectedAccountId!)
    ]);
    setLotsLoading(false);
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
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/sync-full`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchAccounts();
        await loadLotsData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось выполнить синхронизацию');
      }
    } catch {
      alert('Ошибка соединения с сервером');
    } finally {
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
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-md sm:text-lg font-bold text-white">Кабинет сессии: {currentAccount?.name}</h1>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Последняя синхронизация с Funpay:{' '}
              <b className="text-slate-300">
                {currentAccount?.last_synced 
                  ? new Date(currentAccount.last_synced).toLocaleTimeString() 
                  : 'Ни разу'}
              </b>
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
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

            {/* Force Sync */}
            <button
              onClick={handleFullSync}
              disabled={syncing || lotsLoading}
              className="py-2 px-4 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-brand-cyan/10"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Обновить все данные</span>
            </button>
          </div>
        </div>

        {/* СЕТКА СТАТИСТИКИ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 relative z-10 pt-5 border-t border-white/5">
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
      </div>

      {/* 2. НАВИГАЦИОННЫЙ ПЕРЕКЛЮЧАТЕЛЬ САБ-ВКЛАДОК */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-950/50 border border-white/5 self-start w-fit">
        <button
          onClick={() => setActiveSubTab('lots')}
          className={`py-2 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
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
          className={`py-2 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'chats' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Переписка / Чат</span>
        </button>
        <button
          onClick={() => setActiveSubTab('settings')}
          className={`py-2 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'settings' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Настройки бота</span>
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
              <div className="overflow-x-auto relative z-10 no-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-white/5">
                      <th className="py-3 px-1">Категория</th>
                      <th className="py-3 px-3">Название лота (Funpay)</th>
                      <th className="py-3 px-3">Кол-во</th>
                      <th className="py-3 px-3 text-right">Цена на Funpay</th>
                      <th className="py-3 px-3 text-right">Статус Демпинга</th>
                      <th className="py-3 px-3 text-center">Настройка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {lots.filter(l => selectedCategory === 'all' || l.category === selectedCategory).map((lot) => {
                      const isEditing = editingLotId === lot.lot_id;
                      const isUpdating = updatingLotId === lot.lot_id;
                      const localRule = localRules.find(r => r.lot_id === lot.lot_id);

                      return (
                        <tr key={lot.lot_id} className="hover:bg-white/[0.01] transition-all">
                          <td className="py-4 px-1 text-brand-cyan font-bold text-[10px] max-w-[120px] truncate">
                            {lot.category}
                          </td>
                          <td className="py-4 px-3 font-semibold text-white max-w-[220px] truncate" title={lot.lot_name}>
                            {lot.lot_name}
                          </td>
                          <td className="py-4 px-3 text-slate-400 font-bold">
                            {lot.amount} шт.
                          </td>
                          <td className="py-4 px-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                          <td className="py-4 px-3 text-right">
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
                          <td className="py-4 px-3 text-center">
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
      </AnimatePresence>

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
    </motion.div>
  );
}

