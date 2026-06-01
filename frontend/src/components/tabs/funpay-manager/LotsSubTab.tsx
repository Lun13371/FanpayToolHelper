import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, Loader2, Edit2, Check, X, Sliders, CheckCircle2, Play, ToggleLeft, ToggleRight,
  Plus, Search, Sparkles, RefreshCw, Trash2, ChevronLeft, Folder
} from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';
import { LotSettings, LotTemplate, LotCreationTemplate } from '../../../types';

interface FunpayLot {
  lot_id: string;
  lot_name: string;
  price: number;
  amount: number;
  category: string;
  native_auto_delivery?: boolean;
}

interface NativeDeliveryState {
  lot_id: string;
  price: number;
  amount: number;
  native_auto_delivery_enabled: boolean;
  native_auto_delivery_text: string;
  supports_native_auto_delivery?: boolean;
  buyer_prices?: { method: string; price: string }[];
  form_fields?: { name: string; label: string; type: string; value: string; options?: { value: string; label: string }[] }[];
}

interface LotsSubTabProps {
  lots: FunpayLot[];
  setLots: React.Dispatch<React.SetStateAction<FunpayLot[]>>;
  lotsLoading: boolean;
  setLotsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  getTimeAgo: (dateString?: string) => string;
  raiseCountdown: string;
}

export default function LotsSubTab({ 
  lots, 
  setLots, 
  lotsLoading, 
  setLotsLoading, 
  getTimeAgo, 
  raiseCountdown 
}: LotsSubTabProps) {
  const { token, selectedAccountId, accounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [localRules, setLocalRules] = useState<LotSettings[]>([]);
  const [templates, setTemplates] = useState<LotTemplate[]>([]);
  const [creationTemplates, setCreationTemplates] = useState<LotCreationTemplate[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<any[]>([]);

  // Состояния для добавления нового лота
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalMode, setModalMode] = useState<'scratch' | 'template'>('scratch');
  const [globalCategories, setGlobalCategories] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [searchCategoryQuery, setSearchCategoryQuery] = useState('');
  const [selectedGameName, setSelectedGameName] = useState<string | null>(null);
  const [selectedGlobalCategory, setSelectedGlobalCategory] = useState<any | null>(null);
  
  const [creationFormLoading, setCreationFormLoading] = useState(false);
  const [creationForm, setCreationForm] = useState<any | null>(null);
  const [creationFieldsValues, setCreationFieldsValues] = useState<Record<string, any>>({});
  const [creatingLot, setCreatingLot] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);

  const fetchGlobalCategories = async (queryStr = '') => {
    setCategoriesLoading(true);
    try {
      const url = queryStr 
        ? `${API_URL}/api/v1/lots/global-categories?q=${encodeURIComponent(queryStr)}`
        : `${API_URL}/api/v1/lots/global-categories`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalCategories(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleSyncGlobalCategories = async () => {
    setSyncingCategories(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/sync-global-categories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchGlobalCategories(searchCategoryQuery);
      } else {
        alert(data.detail || 'Ошибка синхронизации категорий');
      }
    } catch {
      alert('Ошибка соединения');
    } finally {
      setSyncingCategories(false);
    }
  };

  const handleSelectGlobalCategory = async (cat: any) => {
    setSelectedGlobalCategory(cat);
    setCreationFormLoading(true);
    setCreationForm(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/creation-form?node_id=${cat.node_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreationForm(data);
        
        // Пре-заполняем начальные значения полей
        const initialVals: Record<string, any> = {};
        if (data.form_fields) {
          data.form_fields.forEach((f: any) => {
            initialVals[f.name] = f.value;
          });
        }
        setCreationFieldsValues(initialVals);
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось получить форму создания лота');
        setSelectedGlobalCategory(null);
      }
    } catch {
      alert('Ошибка соединения');
      setSelectedGlobalCategory(null);
    } finally {
      setCreationFormLoading(false);
    }
  };

  const handleCreateLotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !selectedGlobalCategory) return;
    setCreatingLot(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          node_id: selectedGlobalCategory.node_id,
          fields: creationFieldsValues
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Лот успешно создан на Funpay!');
        setShowCreateModal(false);
        setSelectedGameName(null);
        setSelectedGlobalCategory(null);
        setCreationForm(null);
        setSearchCategoryQuery('');
        // Обновляем список лотов на главной
        loadLotsData();
      } else {
        alert(data.detail || 'Сбой создания лота');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setCreatingLot(false);
    }
  };

  const handleApplyCreationTemplate = async (tpl: LotCreationTemplate) => {
    setSelectedGlobalCategory({
      node_id: tpl.node_id,
      game_name: tpl.game_name,
      subcategory_name: tpl.subcategory_name
    });
    
    setCreationFormLoading(true);
    setCreationForm(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/creation-form?node_id=${tpl.node_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreationForm(data);
        
        const mergedVals: Record<string, any> = {};
        if (data.form_fields) {
          data.form_fields.forEach((f: any) => {
            mergedVals[f.name] = tpl.fields[f.name] !== undefined ? tpl.fields[f.name] : f.value;
          });
        }
        setCreationFieldsValues(mergedVals);
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось получить форму создания лота');
        setSelectedGlobalCategory(null);
      }
    } catch {
      alert('Ошибка соединения');
      setSelectedGlobalCategory(null);
    } finally {
      setCreationFormLoading(false);
    }
  };

  // Редактирование цены в ячейке таблицы
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingLotId, setUpdatingLotId] = useState<string | null>(null);

  // Настройки демпинга и родной автовыдачи в модалке лота
  const [selectedLot, setSelectedLot] = useState<FunpayLot | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({ min_price: '', undercut_value: '0.01', is_active: true });

  // Родная автовыдача
  const [loadingNative, setLoadingNative] = useState(false);
  const [savingNative, setSavingNative] = useState(false);
  const [nativeDelivery, setNativeDelivery] = useState<NativeDeliveryState | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const [savingRule, setSavingRule] = useState(false);
  const [deletingLotId, setDeletingLotId] = useState<string | null>(null);

  const handleDeleteLot = async () => {
    if (!selectedAccountId || !selectedLot) return;
    if (!confirm(`Вы действительно хотите НАВСЕГДА УДАЛИТЬ лот "${selectedLot.lot_name}" с сайта FunPay? Резервная копия настроек демпинга также будет удалена.`)) {
      return;
    }
    
    setDeletingLotId(selectedLot.lot_id);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/lots/${selectedLot.lot_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert('Лот успешно удален на FunPay!');
        setShowConfigModal(false);
        setSelectedLot(null);
        loadLotsData();
      } else {
        alert(data.detail || 'Не удалось удалить лот');
      }
    } catch {
      alert('Ошибка соединения');
    } finally {
      setDeletingLotId(null);
    }
  };

  useEffect(() => {
    if (selectedAccountId && token) {
      loadLotsData();
      fetchTemplates();
      fetchCreationTemplates();
    }
  }, [selectedAccountId, token]);

  const fetchCreationTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreationTemplates(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

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
        const initialFields: Record<string, any> = {};
        if (data.form_fields) {
          data.form_fields.forEach((f: any) => {
            initialFields[f.name] = f.value;
          });
        }
        setCustomFields(initialFields);
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
          native_auto_delivery_text: nativeDelivery.native_auto_delivery_text,
          fields: customFields
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
      alert('Ошибка соединения');
    } finally {
      setSavingNative(false);
    }
  };

  return (
    <>
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
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowCreateModal(true);
                fetchGlobalCategories(searchCategoryQuery);
              }}
              className="py-1.5 px-3 bg-brand-cyan/10 hover:bg-brand-cyan/15 border border-brand-cyan/20 text-brand-cyan rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить лот</span>
            </button>
            <span className="text-[9px] bg-white/5 border border-white/10 text-slate-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
              {lots.length} активных товаров
            </span>
          </div>
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
          <div className="space-y-5 animate-pulse relative z-10">
            {/* Filter buttons skeleton */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 w-24 bg-white/5 border border-white/5 rounded-xl" />
              ))}
            </div>
            
            {/* Table skeleton */}
            {[1, 2].map((g) => (
              <div key={g} className="border border-white/5 rounded-2xl bg-white/[0.01] overflow-hidden space-y-4 pb-4">
                <div className="p-4 bg-slate-950/40 border-b border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-2 w-1/3">
                    <div className="h-2 w-2 rounded-full bg-white/10" />
                    <div className="h-3 bg-white/10 rounded w-1/2" />
                    <div className="h-4 bg-white/10 rounded-full w-10" />
                  </div>
                  <div className="h-3 bg-white/10 rounded w-1/4" />
                </div>
                <div className="px-4 space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center py-2 gap-3 border-b border-white/5 last:border-0 pb-4 last:pb-0">
                      <div className="space-y-2 w-full sm:w-1/2">
                        <div className="h-3.5 bg-white/5 rounded w-11/12" />
                        <div className="flex gap-1.5">
                          <div className="h-4 bg-white/5 rounded-full w-12" />
                          <div className="h-4 bg-white/5 rounded-full w-20" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center sm:contents gap-4">
                        <div className="h-3.5 bg-white/5 rounded w-12" />
                        <div className="h-3.5 bg-white/5 rounded w-16" />
                        <div className="h-8 bg-white/5 border border-white/5 rounded-xl w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                                      <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                        Активен
                                      </span>
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

      {/* МОДАЛКА НАСТРОЕК ЛОТА (ДЕПИНГ + ШАБЛОНЫ + ВСТРОЕННАЯ АВТОВЫДАЧА) */}
      {createPortal(
        <AnimatePresence>
          {showConfigModal && selectedLot && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-5xl max-h-[90vh] overflow-y-auto md:overflow-hidden bg-[#090A0F] border border-white/5 rounded-3xl p-6 relative no-scrollbar"
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-white/5">
                  
                  {/* ЛЕВАЯ КОЛОНКА: ДЕМПИНГ И ШАБЛОНЫ (1/3 ширины на ПК) */}
                  <div className="space-y-4 md:col-span-1">
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

                  {/* ПРАВАЯ КОЛОНКА: ВСТРОЕННАЯ АВТОВЫДАЧА И НАСТРОЙКИ ОБЪЯВЛЕНИЯ FUNPAY */}
                  <div className="space-y-4 md:col-span-2 md:border-l md:border-white/5 md:pl-6 max-h-[550px] overflow-y-auto pr-2 no-scrollbar">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-white/5 sticky top-0 bg-[#090A0F] z-10">
                      <Zap className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Параметры объявления FunPay</span>
                    </h3>

                    {loadingNative ? (
                      <div className="space-y-5 py-2 animate-pulse">
                        {/* Price & Amount Skeleton */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="h-2.5 bg-white/5 rounded w-1/2" />
                            <div className="h-10 bg-white/5 border border-white/5 rounded-xl" />
                          </div>
                          <div className="space-y-2">
                            <div className="h-2.5 bg-white/5 rounded w-1/3" />
                            <div className="h-10 bg-white/5 border border-white/5 rounded-xl" />
                          </div>
                        </div>

                        {/* Commission card Skeleton */}
                        <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                          <div className="h-2.5 bg-white/5 rounded w-1/3" />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="h-12 bg-white/5 border border-white/5 rounded-xl" />
                            <div className="h-12 bg-white/5 border border-white/5 rounded-xl" />
                          </div>
                        </div>

                        {/* Active toggles and descriptions Skeletons */}
                        <div className="space-y-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="space-y-2">
                              <div className="h-2.5 bg-white/5 rounded w-1/4" />
                              <div className="h-20 bg-white/5 border border-white/5 rounded-xl" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : nativeDelivery ? (
                      <div className="space-y-4 pb-2">
                        {/* Цена и Количество */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Текущая цена (Вы получите)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={nativeDelivery.price}
                              onChange={(e) => setNativeDelivery({ ...nativeDelivery, price: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                              placeholder="Цена"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Количество (Наличие)</label>
                            <input
                              type="number"
                              value={customFields['amount'] !== undefined ? customFields['amount'] : nativeDelivery.amount}
                              onChange={(e) => setCustomFields({ ...customFields, amount: e.target.value })}
                              className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                              placeholder="Остаток"
                            />
                          </div>
                        </div>

                        {/* Цены покупателей с комиссией */}
                        {nativeDelivery.buyer_prices && nativeDelivery.buyer_prices.length > 0 && (
                          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Цены покупателей (с комиссией):</span>
                            <div className="grid grid-cols-2 gap-2">
                              {nativeDelivery.buyer_prices.map((bp, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 rounded-xl bg-slate-950/45 border border-white/5 text-[9px]">
                                  <span className="text-slate-400 font-semibold truncate max-w-[110px]" title={bp.method}>{bp.method}</span>
                                  <span className="text-brand-cyan font-bold font-mono">{bp.price}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Родная автовыдача */}
                        {nativeDelivery.supports_native_auto_delivery ? (
                          <div className="space-y-3 p-3 rounded-2xl bg-brand-cyan/[0.02] border border-brand-cyan/5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-wider">Родная автовыдача FP</span>
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
                              <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Текст выдачи товара (ключи/инструкция):</label>
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
                                rows={3}
                                className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40 resize-none leading-relaxed font-mono"
                                placeholder="Введите ключи или текст автовыдачи..."
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-1">
                            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              ⚠️ Встроенная автовыдача недоступна
                            </span>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              Данный раздел товара на FunPay не поддерживает встроенную автовыдачу. Вы можете использовать нашу локальную <span className="text-brand-cyan font-semibold">🤖 БОТ-ВЫДАЧУ</span> для автоматической отправки товара покупателям в чат.
                            </p>
                          </div>
                        )}

                        {/* Динамические поля объявления с Funpay */}
                        {nativeDelivery.form_fields && nativeDelivery.form_fields.length > 0 && (
                          <div className="space-y-4 pt-1">
                            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-white/5">
                              Детали предложения
                            </h4>
                            {nativeDelivery.form_fields
                              .filter((f: any) => ![
                                'csrf_token', 'form_created_at', 'offer_id', 'node_id', 'location', 
                                'deleted', 'fields[images]', 'price', 'auto_delivery', 'secrets', 'fields[method]'
                              ].includes(f.name))
                              .map((f: any) => {
                                const val = customFields[f.name] !== undefined ? customFields[f.name] : f.value;
                                
                                return (
                                  <div key={f.name} className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">
                                      {f.label || f.name}
                                    </label>
                                    
                                    {f.type === 'textarea' ? (
                                      <textarea
                                        value={val}
                                        onChange={(e) => setCustomFields({ ...customFields, [f.name]: e.target.value })}
                                        rows={3}
                                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40 resize-none leading-relaxed"
                                        placeholder={`Введите ${f.label || f.name}...`}
                                      />
                                    ) : f.type === 'select' ? (
                                      <select
                                        value={val}
                                        onChange={(e) => setCustomFields({ ...customFields, [f.name]: e.target.value })}
                                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                                      >
                                        {f.options?.map((opt: any) => (
                                          <option key={opt.value} value={opt.value} className="bg-slate-950 text-white">
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : f.type === 'checkbox' ? (
                                      <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/5">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{f.label || f.name}</span>
                                        <button
                                          onClick={() => setCustomFields({ ...customFields, [f.name]: val === '1' ? '0' : '1' })}
                                          className="text-slate-400 hover:text-white transition-colors"
                                        >
                                          {val === '1' ? (
                                            <ToggleRight className="w-7 h-7 text-brand-cyan" />
                                          ) : (
                                            <ToggleLeft className="w-7 h-7 text-slate-600" />
                                          )}
                                        </button>
                                      </div>
                                    ) : (
                                      <input
                                        type="text"
                                        value={val}
                                        onChange={(e) => setCustomFields({ ...customFields, [f.name]: e.target.value })}
                                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                                        placeholder={`Введите ${f.label || f.name}...`}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}

                        <button
                          onClick={handleSaveNativeDelivery}
                          disabled={savingNative}
                          className="w-full py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10 sticky bottom-0 z-10 border border-brand-cyan/20"
                        >
                          {savingNative ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 fill-current" />}
                          <span>Сохранить настройки на Funpay</span>
                        </button>

                        <div className="pt-4 border-t border-white/5 mt-4">
                          <button
                            type="button"
                            onClick={handleDeleteLot}
                            disabled={deletingLotId !== null}
                            className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {deletingLotId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span>Удалить этот лот с FunPay</span>
                          </button>
                        </div>
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
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* МОДАЛКА СОЗДАНИЯ НОВОГО ЛОТА */}
      {createPortal(
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-white/5 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative"
              onMouseMove={handleMouseMove}
            >
              <div className="glow-bg rounded-3xl" />
              
              {/* Шапка модалки */}
              <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-brand-cyan animate-pulse" />
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    {selectedGlobalCategory ? 'Заполнение формы лота' : 'Добавить новый лот'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedGameName(null);
                    setSelectedGlobalCategory(null);
                    setCreationForm(null);
                    setSearchCategoryQuery('');
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Тело модалки */}
              <div className="p-4 sm:p-5 flex-1 overflow-y-auto no-scrollbar relative z-10 text-xs">
                {!selectedGlobalCategory && (
                  <div className="flex gap-1.5 p-1 bg-slate-950/40 border border-white/5 rounded-2xl w-full mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setModalMode('scratch');
                        setSelectedGameName(null);
                      }}
                      className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center border ${
                        modalMode === 'scratch'
                          ? 'bg-brand-cyan/15 text-brand-cyan border-brand-cyan/20'
                          : 'text-slate-400 hover:text-white border-transparent'
                      }`}
                    >
                      Обычное создание
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalMode('template')}
                      className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center border ${
                        modalMode === 'template'
                          ? 'bg-brand-cyan/15 text-brand-cyan border-brand-cyan/20'
                          : 'text-slate-400 hover:text-white border-transparent'
                      }`}
                    >
                      Выбрать из шаблонов ({creationTemplates.length})
                    </button>
                  </div>
                )}

                {!selectedGlobalCategory ? (
                  modalMode === 'template' ? (
                    /* ШАБЛОНЫ ПУБЛИКАЦИИ */
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                      {creationTemplates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                          У вас пока нет сохраненных шаблонов публикаций.<br />
                          Создать их можно во вкладке <b className="text-brand-cyan">«Шаблоны лотов»</b>.
                        </div>
                      ) : (
                        (() => {
                          const grouped = creationTemplates.reduce((acc, tpl) => {
                            const game = tpl.game_name || 'Разное';
                            if (!acc[game]) acc[game] = [];
                            acc[game].push(tpl);
                            return acc;
                          }, {} as Record<string, LotCreationTemplate[]>);

                          return Object.keys(grouped).map((gameName) => {
                            const tpls = grouped[gameName];
                            return (
                              <div key={gameName} className="rounded-2xl border border-white/5 bg-slate-950/20 overflow-hidden mb-3 last:mb-0">
                                <div className="bg-slate-950/40 px-3.5 py-2 border-b border-white/5 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400">
                                  <Folder className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                                  <span>{gameName}</span>
                                </div>
                                <div className="divide-y divide-white/5 p-1.5">
                                  {tpls.map((tpl) => (
                                    <button
                                      key={tpl.id}
                                      type="button"
                                      onClick={() => handleApplyCreationTemplate(tpl)}
                                      className="w-full text-left p-2.5 rounded-xl hover:bg-white/[0.02] flex items-center justify-between transition-all group cursor-pointer"
                                    >
                                      <div className="space-y-0.5">
                                        <span className="font-bold text-slate-200 group-hover:text-brand-cyan transition-colors text-[11px] block">{tpl.name}</span>
                                        <span className="text-[9px] text-slate-400 font-semibold">{tpl.subcategory_name}</span>
                                      </div>
                                      <span className="text-[9px] bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider group-hover:bg-brand-cyan group-hover:text-slate-950 transition-all shrink-0">
                                        Выбрать
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>
                  ) : !selectedGameName ? (
                    /* ШАГ 1: ВЫБОР ИГРЫ */
                    <div className="space-y-4">
                      <p className="text-slate-400 font-semibold leading-relaxed">
                        Введите название игры для поиска. Если база пуста — нажмите кнопку синхронизации, чтобы загрузить все доступные категории с Funpay.
                      </p>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Поиск игры (например, Roblox)..."
                            value={searchCategoryQuery}
                            onChange={(e) => {
                              setSearchCategoryQuery(e.target.value);
                              fetchGlobalCategories(e.target.value);
                            }}
                            className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                          />
                        </div>
                        
                        <button
                          onClick={handleSyncGlobalCategories}
                          disabled={syncingCategories}
                          className="py-2 px-3.5 bg-brand-cyan/10 hover:bg-brand-cyan/15 border border-brand-cyan/20 text-brand-cyan rounded-xl font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all shrink-0 text-[10px]"
                          title="Синхронизировать категории с главной страницы Funpay"
                        >
                          {syncingCategories ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Синхронизировать</span>
                        </button>
                      </div>

                      {/* Результаты поиска уникальных игр */}
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {categoriesLoading ? (
                          <div className="text-center text-slate-500 py-6 animate-pulse">Загрузка игр...</div>
                        ) : globalCategories.length === 0 ? (
                          <div className="text-center text-slate-500 py-6">
                            Игры не найдены. Введите поисковый запрос или сделайте синхронизацию.
                          </div>
                        ) : (
                          Array.from(new Set(globalCategories.map((cat: any) => cat.game_name))).map((gameName: string) => {
                            const count = globalCategories.filter((cat: any) => cat.game_name === gameName).length;
                            return (
                              <button
                                key={gameName}
                                onClick={() => setSelectedGameName(gameName)}
                                className="w-full text-left p-2.5 bg-slate-950/20 hover:bg-slate-950/40 border border-white/5 hover:border-brand-cyan/15 rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all cursor-pointer"
                              >
                                <span className="font-bold text-[11px] truncate text-slate-200">
                                  {gameName}
                                </span>
                                <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full shrink-0 font-bold ml-2">
                                  {count} подразд.
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ШАГ 1.5: ВЫБОР ПОДКАТЕГОРИИ ДЛЯ ВЫБРАННОЙ ИГРЫ */
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/5 justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedGameName(null)}
                          className="py-1 px-2.5 bg-white/5 hover:bg-white/10 text-brand-cyan rounded-lg font-bold text-[10px] transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Назад к играм</span>
                        </button>
                        <span className="text-slate-400 font-semibold truncate max-w-[250px]">
                          Игра: <b className="text-white">{selectedGameName}</b>
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {globalCategories
                          .filter((cat: any) => cat.game_name === selectedGameName)
                          .map((cat: any) => (
                            <button
                              key={cat.node_id}
                              onClick={() => handleSelectGlobalCategory(cat)}
                              className="w-full text-left p-2.5 bg-slate-950/20 hover:bg-slate-950/40 border border-white/5 hover:border-brand-cyan/15 rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                              <span className="font-bold text-[11px] truncate text-slate-200">
                                {cat.subcategory_name}
                              </span>
                              <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full uppercase shrink-0 font-mono font-bold ml-2">
                                node_id: {cat.node_id}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )
                ) : (
                  /* ШАГ 2: ЗАПОЛНЕНИЕ ФОРМЫ */
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-950/40 border border-white/5 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Выбранная категория:</span>
                        <span className="text-[11px] text-brand-cyan font-bold">
                          {selectedGlobalCategory.game_name} / {selectedGlobalCategory.subcategory_name}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedGlobalCategory(null)}
                        className="py-1 px-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                      >
                        Назад
                      </button>
                    </div>

                    {creationFormLoading ? (
                      <div className="py-12 flex flex-col items-center gap-2 text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
                        <span className="animate-pulse">Загрузка формы с Funpay...</span>
                      </div>
                    ) : creationForm ? (
                      <form onSubmit={handleCreateLotSubmit} className="space-y-3.5">
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1.5 no-scrollbar">
                          {creationForm.form_fields && creationForm.form_fields.map((f: any) => {
                            const val = creationFieldsValues[f.name] ?? '';

                            return (
                              <div key={f.name} className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                  {f.label || f.name}
                                </label>

                                {f.type === 'select' ? (
                                  <select
                                    value={val}
                                    onChange={(e) => setCreationFieldsValues({ ...creationFieldsValues, [f.name]: e.target.value })}
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                                  >
                                    {f.options && f.options.map((opt: any) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : f.type === 'textarea' ? (
                                  <textarea
                                    value={val}
                                    onChange={(e) => setCreationFieldsValues({ ...creationFieldsValues, [f.name]: e.target.value })}
                                    rows={3}
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40 placeholder:text-slate-600 font-sans"
                                    placeholder={`Введите ${f.label || f.name}...`}
                                    required={f.name === 'fields[summary][ru]' || f.name === 'fields[desc][ru]'}
                                  />
                                ) : f.type === 'checkbox' ? (
                                  <div className="flex items-center justify-between h-9 bg-slate-950/20 border border-white/5 px-3.5 rounded-xl">
                                    <span className="text-slate-300 font-semibold">{f.label || f.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => setCreationFieldsValues({ ...creationFieldsValues, [f.name]: val === '1' ? '0' : '1' })}
                                      className="cursor-pointer"
                                    >
                                      {val === '1' ? (
                                        <ToggleRight className="w-7 h-7 text-brand-cyan" />
                                      ) : (
                                        <ToggleLeft className="w-7 h-7 text-slate-600" />
                                      )}
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type={f.name === 'price' || f.name === 'amount' ? 'number' : 'text'}
                                    step={f.name === 'price' ? '0.01' : '1'}
                                    value={val}
                                    onChange={(e) => setCreationFieldsValues({ ...creationFieldsValues, [f.name]: e.target.value })}
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                                    placeholder={`Введите ${f.label || f.name}...`}
                                    required={f.name === 'price' || f.name === 'amount'}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="submit"
                          disabled={creatingLot}
                          className="w-full py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10 border border-brand-cyan/20 cursor-pointer mt-3"
                        >
                          {creatingLot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Опубликовать новый лот на Funpay</span>
                        </button>
                      </form>
                    ) : (
                      <div className="py-12 text-center text-slate-500 italic">
                        Не удалось получить структуру формы с Funpay.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}
