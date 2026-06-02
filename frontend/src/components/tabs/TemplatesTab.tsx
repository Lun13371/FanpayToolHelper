import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, Plus, RefreshCw, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, 
  Sparkles, Sliders, ChevronLeft, Search, FileText, Folder, Loader2,
  CheckSquare, Square, Play, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LotTemplate, LotCreationTemplate } from '../../types';

export default function TemplatesTab() {
  const { token, user, accounts, selectedAccountId } = useAppContext();
  
  // Вкладка активная
  const [activeTab, setActiveTab] = useState<'damping' | 'creation'>('damping');

  // =========================================================================
  // СОСТОЯНИЯ ДЛЯ ШАБЛОНОВ ДЕМПИНГА (DAMPING TEMPLATES)
  // =========================================================================
  const [templates, setTemplates] = useState<LotTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', min_price: '', undercut_value: '0.01', is_active: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', min_price: '', undercut_value: '0.01' });

  // =========================================================================
  // СОСТОЯНИЯ ДЛЯ ШАБЛОНОВ ПУБЛИКАЦИИ ЛОТОВ (LOT CREATION TEMPLATES)
  // =========================================================================
  const [creationTemplates, setCreationTemplates] = useState<LotCreationTemplate[]>([]);
  const [creationLoading, setCreationLoading] = useState(false);
  const [showCreateCreationModal, setShowCreateCreationModal] = useState(false);
  const [editingCreationTemplateId, setEditingCreationTemplateId] = useState<number | null>(null);
  const [creationFormName, setCreationFormName] = useState('');
  
  // Категории и динамические поля формы
  const [globalCategories, setGlobalCategories] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [searchCategoryQuery, setSearchCategoryQuery] = useState('');
  const [selectedGameName, setSelectedGameName] = useState<string | null>(null);
  const [selectedGlobalCategory, setSelectedGlobalCategory] = useState<any | null>(null);
  const [creationFormLoading, setCreationFormLoading] = useState(false);
  const [creationForm, setCreationForm] = useState<any | null>(null);
  const [creationFieldsValues, setCreationFieldsValues] = useState<Record<string, any>>({});
  const [savingCreationTemplate, setSavingCreationTemplate] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);

  // Состояния для мультивыбора и пакетной публикации шаблонов публикации лотов
  const [selectedCreationTplIds, setSelectedCreationTplIds] = useState<number[]>([]);
  const [batchTargetAccountId, setBatchTargetAccountId] = useState<number | null>(null);
  
  // Состояния для прогресса пакетной публикации (SSE)
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishingProgress] = useState(0); // Процент 0-100
  const [publishStatusText, setPublishingStatusText] = useState(''); // Текущий статус
  const [publishLogs, setPublishingLogs] = useState<{ id: string; time: string; type: 'info' | 'success' | 'error'; message: string }[]>([]);
  const [showPublishLogs, setShowPublishLogs] = useState(true);
  const [publishStats, setPublishingStats] = useState({ total: 0, success: 0, failed: 0 });
  const [publishCompleted, setPublishingCompleted] = useState(false);

  useEffect(() => {
    if (accounts && accounts.length > 0 && !batchTargetAccountId) {
      setBatchTargetAccountId(selectedAccountId || accounts[0].id);
    }
  }, [accounts, selectedAccountId, batchTargetAccountId]);

  useEffect(() => {
    if (token) {
      fetchTemplates();
      fetchCreationTemplates();
    }
  }, [token]);

  // =========================================================================
  // ЗАПРОСЫ: ШАБЛОНЫ ДЕМПИНГА
  // =========================================================================
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Ошибка получения шаблонов демпинга:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const minPriceNum = parseFloat(createForm.min_price);
    const undercutNum = parseFloat(createForm.undercut_value);
    
    if (isNaN(minPriceNum) || minPriceNum < 0) {
      alert('Пожалуйста, введите корректную цену');
      return;
    }
    if (isNaN(undercutNum) || undercutNum <= 0) {
      alert('Пожалуйста, введите корректный шаг демпинга');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: createForm.name,
          min_price: minPriceNum,
          undercut_value: undercutNum,
          is_active: createForm.is_active
        })
      });

      if (res.ok) {
        fetchTemplates();
        setCreateForm({ name: '', min_price: '', undercut_value: '0.01', is_active: true });
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка создания шаблона');
      }
    } catch {
      alert('Ошибка сети при создании шаблона');
    }
  };

  const handleStartEdit = (tpl: LotTemplate) => {
    setEditingId(tpl.id);
    setEditForm({
      name: tpl.name,
      min_price: tpl.min_price.toString(),
      undercut_value: tpl.undercut_value.toString()
    });
  };

  const handleSaveEdit = async (id: number) => {
    const minPriceNum = parseFloat(editForm.min_price);
    const undercutNum = parseFloat(editForm.undercut_value);
    
    if (isNaN(minPriceNum) || minPriceNum < 0) {
      alert('Введите корректную цену');
      return;
    }
    if (isNaN(undercutNum) || undercutNum <= 0) {
      alert('Введите шаг демпинга');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editForm.name,
          min_price: minPriceNum,
          undercut_value: undercutNum
        })
      });

      if (res.ok) {
        setEditingId(null);
        fetchTemplates();
      } else {
        const err = await res.json();
        alert(err.detail || 'Сбой сохранения');
      }
    } catch {
      alert('Ошибка сети');
    }
  };

  const handleToggleActive = async (tpl: LotTemplate) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/${tpl.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          is_active: !tpl.is_active
        })
      });
      if (res.ok) {
        fetchTemplates();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы действительно хотите удалить этот шаблон демпинга?')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTemplates();
      }
    } catch {
      alert('Ошибка при удалении шаблона');
    }
  };

  // =========================================================================
  // ЗАПРОСЫ: ШАБЛОНЫ ПУБЛИКАЦИИ ЛОТОВ (LOT CREATION TEMPLATES)
  // =========================================================================
  const fetchCreationTemplates = async () => {
    setCreationLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreationTemplates(data);
      }
    } catch (err) {
      console.error('Ошибка получения шаблонов публикации:', err);
    } finally {
      setCreationLoading(false);
    }
  };

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
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation/form-fields?node_id=${cat.node_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreationForm(data);
        
        const initialVals: Record<string, any> = {};
        if (data.form_fields) {
          data.form_fields.forEach((f: any) => {
            initialVals[f.name] = f.value;
          });
        }
        setCreationFieldsValues(initialVals);
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось получить структуру полей с Funpay. Проверьте, есть ли у вас активные аккаунты.');
        setSelectedGlobalCategory(null);
      }
    } catch {
      alert('Ошибка соединения');
      setSelectedGlobalCategory(null);
    } finally {
      setCreationFormLoading(false);
    }
  };

  const handleStartEditCreationTemplate = (tpl: LotCreationTemplate) => {
    setEditingCreationTemplateId(tpl.id);
    setCreationFormName(tpl.name);
    setSelectedGlobalCategory({
      node_id: tpl.node_id,
      game_name: tpl.game_name,
      subcategory_name: tpl.subcategory_name
    });
    
    setCreationFormLoading(true);
    setCreationForm(null);

    // Строим форму на основе сохраненных в БД полей (без единого запроса к Funpay/бэкенду!)
    const formFieldsFromDb = Object.keys(tpl.fields).map(key => {
      let type = 'input';
      let label = key;
      
      // Автоопределение типа поля по имени ключа
      if (key === 'price' || key === 'amount') {
        type = 'input';
      } else if (key.includes('desc') || key.includes('summary') || key.includes('secrets')) {
        type = 'textarea';
      } else if (key.includes('active') || key.includes('decline') || typeof tpl.fields[key] === 'boolean' || tpl.fields[key] === '1' || tpl.fields[key] === '0') {
        // Чекбоксы на Funpay обычно кодируются строками '1' / '0' или булевыми значениями
        type = 'checkbox';
      }
      
      // Понятные лейблы для стандартных полей Funpay
      if (key === 'price') label = 'Цена (₽)';
      else if (key === 'amount') label = 'Количество / Наличие';
      else if (key === 'fields[summary][ru]') label = 'Краткое описание (RU)';
      else if (key === 'fields[summary][en]') label = 'Краткое описание (EN)';
      else if (key === 'fields[desc][ru]') label = 'Подробное описание (RU)';
      else if (key === 'fields[desc][en]') label = 'Подробное описание (EN)';
      else if (key === 'secrets') label = 'Встроенная автовыдача (текст)';
      else {
        // Очищаем технические названия полей для вывода
        label = key
          .replace('fields[', '')
          .replace('][ru]', ' (RU)')
          .replace('][en]', ' (EN)')
          .replace(']', '')
          .replace('_', ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      
      return {
        name: key,
        label: label,
        type: type,
        value: tpl.fields[key]
      };
    });
    
    setCreationForm({
      form_fields: formFieldsFromDb
    });
    setCreationFieldsValues(tpl.fields);
    setCreationFormLoading(false);
    setShowCreateCreationModal(true);
  };

  const handleCreateCreationTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGlobalCategory || !creationFormName.trim()) return;
    setSavingCreationTemplate(true);
    try {
      const isEditing = editingCreationTemplateId !== null;
      const url = isEditing
        ? `${API_URL}/api/v1/lots/templates/creation/${editingCreationTemplateId}`
        : `${API_URL}/api/v1/lots/templates/creation`;
      const method = isEditing ? 'PUT' : 'POST';
      
      const payload = isEditing
        ? { name: creationFormName, fields: creationFieldsValues }
        : {
            name: creationFormName,
            node_id: selectedGlobalCategory.node_id,
            game_name: selectedGlobalCategory.game_name,
            subcategory_name: selectedGlobalCategory.subcategory_name,
            fields: creationFieldsValues
          };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        alert(isEditing ? 'Шаблон публикации успешно обновлен!' : 'Шаблон публикации успешно создан!');
        setShowCreateCreationModal(false);
        setEditingCreationTemplateId(null);
        setCreationFormName('');
        setSelectedGameName(null);
        setSelectedGlobalCategory(null);
        setCreationForm(null);
        setSearchCategoryQuery('');
        fetchCreationTemplates();
      } else {
        alert(data.detail || 'Сбой сохранения шаблона');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setSavingCreationTemplate(false);
    }
  };

  const handleDeleteCreationTemplate = async (id: number) => {
    if (!confirm('Вы действительно хотите удалить этот шаблон публикации?')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchCreationTemplates();
      }
    } catch {
      alert('Ошибка при удалении шаблона');
    }
  };

  const handlePublishEvent = (event: any) => {
    const timeStr = new Date().toLocaleTimeString();
    
    switch (event.type) {
      case 'init':
        setPublishingStats({ total: event.total, success: 0, failed: 0 });
        setPublishingProgress(0);
        break;

      case 'template_start':
        setPublishingStatusText(`Публикация: [${event.game_name}] ${event.template_name} (${event.current} из ${event.total})...`);
        setPublishingProgress(Math.round(((event.current - 1) / event.total) * 90)); // 0-90% под саму публикацию
        setPublishingLogs(prev => [
          ...prev,
          {
            id: `start-${event.template_id}-${Date.now()}`,
            time: timeStr,
            type: 'info',
            message: `[Шаг ${event.current}/${event.total}] Публикация лота "${event.template_name}" в раздел "${event.game_name} -> ${event.subcategory_name}"`
          }
        ]);
        break;

      case 'success':
        setPublishingStats(prev => {
          const nextSuccess = prev.success + 1;
          const totalSteps = prev.total || 1;
          const nextProgress = Math.round(((nextSuccess + prev.failed) / totalSteps) * 90);
          setPublishingProgress(nextProgress);
          return { ...prev, success: nextSuccess };
        });
        setPublishingLogs(prev => [
          ...prev,
          {
            id: `success-${event.template_id}-${Date.now()}`,
            time: timeStr,
            type: 'success',
            message: `✓ Шаблон "${event.template_name}" успешно опубликован на FunPay!`
          }
        ]);
        break;

      case 'error':
        setPublishingStats(prev => {
          const nextFailed = prev.failed + 1;
          const totalSteps = prev.total || 1;
          const nextProgress = Math.round(((prev.success + nextFailed) / totalSteps) * 90);
          setPublishingProgress(nextProgress);
          return { ...prev, failed: nextFailed };
        });
        setPublishingLogs(prev => [
          ...prev,
          {
            id: `error-${event.template_id}-${Date.now()}`,
            time: timeStr,
            type: 'error',
            message: `✗ Ошибка публикации шаблона "${event.template_name}": ${event.message}`
          }
        ]);
        break;

      case 'sync_start':
        setPublishingStatusText('Синхронизация кэша активных лотов с FunPay...');
        setPublishingProgress(93);
        setPublishingLogs(prev => [
          ...prev,
          {
            id: 'sync-start',
            time: timeStr,
            type: 'info',
            message: 'Запрос на синхронизацию списка активных лотов аккаунта...'
          }
        ]);
        break;

      case 'sync_success':
        setPublishingProgress(97);
        setPublishingLogs(prev => [
          ...prev,
          {
            id: 'sync-success',
            time: timeStr,
            type: 'success',
            message: '✓ Кэш лотов аккаунта успешно обновлен в базе данных!'
          }
        ]);
        break;

      case 'sync_error':
        setPublishingProgress(97);
        setPublishingLogs(prev => [
          ...prev,
          {
            id: 'sync-error',
            time: timeStr,
            type: 'error',
            message: `✗ Предупреждение синхронизации: ${event.message}`
          }
        ]);
        break;

      case 'done':
        setPublishingProgress(100);
        setPublishingStatusText('Публикация завершена!');
        setPublishingLogs(prev => [
          ...prev,
          {
            id: 'done',
            time: timeStr,
            type: 'info',
            message: `Завершено! Всего обработано шаблонов: ${event.total}. Успешно: ${event.success_count}, Ошибок: ${event.failed_count}.`
          }
        ]);
        setPublishingCompleted(true);
        setSelectedCreationTplIds([]); // Сбрасываем выбор после успешного окончания
        break;

      default:
        break;
    }
  };

  const handleStartBatchPublish = async () => {
    if (!batchTargetAccountId || selectedCreationTplIds.length === 0) return;
    
    const targetAccount = accounts.find(a => a.id === batchTargetAccountId);
    if (!targetAccount) return;
    
    setPublishing(true);
    setPublishingProgress(0);
    setPublishingStatusText('Подготовка к публикации...');
    setPublishingLogs([
      {
        id: 'start',
        time: new Date().toLocaleTimeString(),
        type: 'info',
        message: `Запуск пакетной публикации лотов на аккаунт ${targetAccount.name}. Выбрано шаблонов: ${selectedCreationTplIds.length}`
      }
    ]);
    setPublishingStats({ total: selectedCreationTplIds.length, success: 0, failed: 0 });
    setPublishingCompleted(false);

    try {
      const response = await fetch(`${API_URL}/api/v1/lots/templates/creation/publish-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          account_id: batchTargetAccountId,
          template_ids: selectedCreationTplIds
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Сбой подключения к серверу');
      }

      if (!response.body) {
        throw new Error('Ответ сервера пустой (отсутствует поток данных)');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.substring(6));
            handlePublishEvent(event);
          } catch (e) {
            console.error('Ошибка парсинга SSE события:', e);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setPublishingLogs(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          type: 'error',
          message: `Глобальный сбой публикации: ${err.message || 'Неизвестная ошибка'}`
        }
      ]);
      setPublishingStatusText('Сбой публикации');
      setPublishingCompleted(true);
    }
  };

  const isManager = user?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК (DAMPING / CREATION) */}
      <div className="flex gap-2 p-1 bg-slate-950/40 border border-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('damping')}
          className={`py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'damping'
              ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Шаблоны демпинга</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('creation');
            fetchGlobalCategories(searchCategoryQuery);
          }}
          className={`py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'creation'
              ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Шаблоны публикации лотов</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'damping' ? (
          /* =========================================================================
             ВКЛАДКА 1: ШАБЛОНЫ ДЕМПИНГА (УЖЕ СУЩЕСТВУЮЩИЕ)
             ========================================================================= */
          <motion.div
            key="damping_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* ЛЕВАЯ КОЛОНКА: ФОРМА СОЗДАНИЯ */}
            {!isManager && (
              <div className="lg:col-span-4">
                <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
                  <div className="glow-bg rounded-3xl" />
                  <h2 className="text-md font-bold text-white relative z-10 flex items-center justify-between mb-4">
                    <span>Новый шаблон демпинга</span>
                    <Sparkles className="w-4 h-4 text-brand-cyan shrink-0" />
                  </h2>

                  <form onSubmit={handleCreate} className="space-y-4 relative z-10">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Название шаблона</label>
                      <input 
                        type="text" 
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                        placeholder="CS2 скины демпинг"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Мин. цена (₽)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={createForm.min_price}
                          onChange={(e) => setCreateForm({ ...createForm, min_price: e.target.value })}
                          className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                          placeholder="100.00"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Шаг демпинга (₽)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={createForm.undercut_value}
                          onChange={(e) => setCreateForm({ ...createForm, undercut_value: e.target.value })}
                          className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                          placeholder="0.01"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <span className="text-xs text-slate-400 font-semibold">Активен сразу</span>
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, is_active: !createForm.is_active })}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {createForm.is_active ? (
                          <ToggleRight className="w-8 h-8 text-brand-cyan" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-600" />
                        )}
                      </button>
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Создать шаблон</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ПРАВАЯ КОЛОНКА: СПИСОК */}
            <div className={isManager ? "lg:col-span-12" : "lg:col-span-8"}>
              <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
                <div className="glow-bg rounded-3xl" />
                
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h2 className="text-md font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-brand-cyan" />
                    <span>Глобальные шаблоны демпинга</span>
                  </h2>
                  <button
                    onClick={fetchTemplates}
                    className="p-1.5 text-slate-400 hover:text-white bg-white/5 border border-white/5 rounded-lg transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="space-y-4 relative z-10 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
                  {loading && templates.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-500">Загрузка шаблонов...</div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-500">
                      {isManager 
                        ? "У вашего владельца еще нет настроенных шаблонов демпинга." 
                        : "У вас еще нет глобальных шаблонов демпинга. Создайте первый слева!"}
                    </div>
                  ) : (
                    templates.map((tpl) => {
                      const isEditing = editingId === tpl.id;

                      return (
                        <div 
                          key={tpl.id} 
                          className="p-4 rounded-2xl bg-slate-950/20 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-white/10 transition-all"
                        >
                          {isEditing ? (
                            <div className="w-full space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <input 
                                  type="text"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                  className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white"
                                />
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={editForm.min_price}
                                  onChange={(e) => setEditForm({ ...editForm, min_price: e.target.value })}
                                  className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white"
                                />
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={editForm.undercut_value}
                                  onChange={(e) => setEditForm({ ...editForm, undercut_value: e.target.value })}
                                  className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleSaveEdit(tpl.id)}
                                  className="py-1 px-3 bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-xs font-semibold rounded-lg"
                                >
                                  Сохранить
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="py-1 px-3 bg-white/5 border border-white/5 text-slate-400 text-xs font-semibold rounded-lg"
                                >
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-1">
                                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                  <span>{tpl.name}</span>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${tpl.is_active ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-slate-500/10 border border-slate-500/20 text-slate-500'}`}>
                                    {tpl.is_active ? 'АКТИВЕН' : 'ПАУЗА'}
                                  </span>
                                </h3>
                                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                  <span>Мин. цена: <b className="text-white font-bold">{tpl.min_price} ₽</b></span>
                                  <span>Шаг: <b className="text-brand-cyan font-bold">{tpl.undercut_value} ₽</b></span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                {!isManager && (
                                  <>
                                    <button
                                      onClick={() => handleToggleActive(tpl)}
                                      className="text-slate-400 hover:text-white transition-colors mr-1"
                                    >
                                      {tpl.is_active ? (
                                        <ToggleRight className="w-7 h-7 text-brand-cyan" />
                                      ) : (
                                        <ToggleLeft className="w-7 h-7 text-slate-600" />
                                      )}
                                    </button>

                                    <button
                                      onClick={() => handleStartEdit(tpl)}
                                      className="p-1.5 bg-white/5 border border-white/5 hover:text-white text-slate-400 rounded-lg transition-colors"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDelete(tpl.id)}
                                      className="p-1.5 bg-red-500/10 hover:bg-red-500/25 border border-transparent hover:border-red-500/15 text-red-400 rounded-lg transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* =========================================================================
             ВКЛАДКА 2: ШАБЛОНЫ ПУБЛИКАЦИИ ЛОТОВ (LOT CREATION TEMPLATES)
             ========================================================================= */
          <motion.div
            key="creation_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            <div className="p-5 sm:p-6 rounded-3xl glow-card relative w-full" onMouseMove={handleMouseMove}>
              <div className="glow-bg rounded-3xl" />
              
              <div className="flex items-center justify-between mb-4 relative z-10">
                <h2 className="text-md font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand-cyan" />
                  <span>Ваши шаблоны публикации лотов</span>
                </h2>
                
                <div className="flex gap-2">
                  {!isManager && (
                    <button
                      onClick={() => {
                        setShowCreateCreationModal(true);
                        fetchGlobalCategories(searchCategoryQuery);
                      }}
                      className="py-1.5 px-3 bg-brand-cyan/10 hover:bg-brand-cyan/15 border border-brand-cyan/20 text-brand-cyan rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Создать шаблон</span>
                    </button>
                  )}
                  <button
                    onClick={fetchCreationTemplates}
                    className="p-1.5 text-slate-400 hover:text-white bg-white/5 border border-white/5 rounded-lg transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${creationLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* ПАНЕЛЬ ПАКЕТНОЙ ПУБЛИКАЦИИ И ИНЛАЙН-ПРОГРЕСС */}
              <div className="relative z-10 space-y-4 mb-5">
                {/* 1. Блок управления массовой публикацией */}
                {selectedCreationTplIds.length > 0 && !publishing && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-brand-cyan/5 border border-brand-cyan/20 flex flex-col md:flex-row items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-semibold">
                        Выбрано шаблонов для публикации: <b className="text-brand-cyan font-bold">{selectedCreationTplIds.length} шт.</b>
                      </span>
                      <button
                        onClick={() => setSelectedCreationTplIds([])}
                        className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-2 py-1 rounded-lg font-bold transition-all uppercase tracking-wider cursor-pointer"
                      >
                        Сбросить выбор
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">На аккаунт:</span>
                        <select
                          value={batchTargetAccountId || ''}
                          onChange={(e) => setBatchTargetAccountId(Number(e.target.value))}
                          className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40 font-semibold"
                        >
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleStartBatchPublish}
                        disabled={!batchTargetAccountId}
                        className="py-2 px-4 bg-brand-cyan hover:bg-brand-cyan/95 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-brand-cyan/10 cursor-pointer shrink-0 border border-brand-cyan/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Опубликовать на аккаунт</span>
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* 2. Блок прогресса SSE пакетной публикации */}
                {publishing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-5 rounded-3xl bg-slate-950/40 border border-white/5 space-y-4"
                  >
                    {/* Шапка прогресса */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2">
                        {publishCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <Loader2 className="w-5 h-5 text-brand-cyan animate-spin shrink-0" />
                        )}
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            {publishCompleted ? 'Массовая публикация завершена' : 'Идет пакетная публикация...'}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[300px] sm:max-w-none">
                            {publishStatusText}
                          </p>
                        </div>
                      </div>

                      {/* Статистика */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] bg-slate-500/10 border border-slate-500/15 text-slate-400 px-2.5 py-1 rounded-full font-bold">
                          ВСЕГО: {publishStats.total}
                        </span>
                        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full font-bold">
                          УСПЕХ: {publishStats.success}
                        </span>
                        {publishStats.failed > 0 && (
                          <span className="text-[10px] bg-red-500/10 border border-red-500/15 text-red-400 px-2.5 py-1 rounded-full font-bold">
                            ОШИБОК: {publishStats.failed}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Прогресс-бар с анимацией */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Прогресс выполнения</span>
                        <span className="text-brand-cyan">{publishProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950/80 rounded-full overflow-hidden border border-white/5 relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${publishProgress}%` }}
                          transition={{ duration: 0.3 }}
                          className="h-full bg-gradient-to-r from-brand-cyan/50 via-brand-cyan to-emerald-400 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                        />
                      </div>
                    </div>

                    {/* Кнопки управления */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setShowPublishLogs(!showPublishLogs)}
                        className="text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span>{showPublishLogs ? 'Скрыть подробности' : 'Показать подробности'}</span>
                        {showPublishLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {publishCompleted && (
                        <button
                          onClick={() => {
                            setPublishing(false);
                            setPublishingCompleted(false);
                          }}
                          className="py-1 px-3 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                        >
                          Закрыть прогресс-бар
                        </button>
                      )}
                    </div>

                    {/* Логи событий */}
                    <AnimatePresence>
                      {showPublishLogs && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-white/5 pt-3.5"
                        >
                          <div className="max-h-44 overflow-y-auto pr-1 no-scrollbar space-y-2 text-[11px] font-semibold font-mono">
                            {publishLogs.map((log) => (
                              <div
                                key={log.id}
                                className={`p-2 rounded-xl border flex items-start gap-2.5 leading-relaxed ${
                                  log.type === 'success'
                                    ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                                    : log.type === 'error'
                                    ? 'bg-red-500/5 border-red-500/10 text-red-400'
                                    : 'bg-slate-950/30 border-white/5 text-slate-300'
                                }`}
                              >
                                <span className="text-slate-500 shrink-0 font-bold">[{log.time}]</span>
                                <span className="flex-1 whitespace-pre-wrap">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </div>

              {/* СПИСОК ШАБЛОНОВ ПУБЛИКАЦИИ, СГРУППИРОВАННЫХ ПО ИГРАМ */}
              <div className="space-y-6 relative z-10 max-h-[600px] overflow-y-auto pr-1 no-scrollbar text-xs">
                {creationLoading && creationTemplates.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">Загрузка шаблонов...</div>
                ) : creationTemplates.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">
                    {isManager 
                      ? "У вашего владельца еще нет настроенных шаблонов автопубликации." 
                      : "У вас еще нет шаблонов публикации. Создайте первый!"}
                  </div>
                ) : (
                  (() => {
                    // Группируем по играм
                    const grouped = creationTemplates.reduce((acc, tpl) => {
                      const game = tpl.game_name || 'Разное';
                      if (!acc[game]) acc[game] = [];
                      acc[game].push(tpl);
                      return acc;
                    }, {} as Record<string, LotCreationTemplate[]>);

                    return Object.keys(grouped).map((gameName) => {
                      const tpls = grouped[gameName];
                      const allGroupSelected = tpls.map(t => t.id).every(id => selectedCreationTplIds.includes(id));

                      return (
                        <div key={gameName} className="rounded-2xl border border-white/5 bg-slate-950/25 overflow-hidden">
                          {/* Шапка группы/игры */}
                          <div className="bg-slate-950/40 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-brand-cyan" />
                              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">{gameName}</h3>
                              <span className="text-[9px] bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                                {tpls.length} шт.
                              </span>
                            </div>
                            {!isManager && (
                              <button
                                onClick={() => {
                                  const tplIds = tpls.map(t => t.id);
                                  if (allGroupSelected) {
                                    // Снимаем выбор с шаблонов этой группы
                                    setSelectedCreationTplIds(prev => prev.filter(id => !tplIds.includes(id)));
                                  } else {
                                    // Выбираем все шаблоны этой группы (избегая дублирования)
                                    setSelectedCreationTplIds(prev => {
                                      const unique = new Set([...prev, ...tplIds]);
                                      return Array.from(unique);
                                    });
                                  }
                                }}
                                className="text-[10px] text-brand-cyan hover:text-brand-cyan/80 font-bold uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                {allGroupSelected ? 'Сбросить все' : 'Выбрать все'}
                              </button>
                            )}
                          </div>

                          {/* Элементы внутри игры */}
                          <div className="divide-y divide-white/5 p-4 space-y-4">
                            {tpls.map((tpl) => {
                              const isSelected = selectedCreationTplIds.includes(tpl.id);
                              return (
                                <div key={tpl.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 last:pb-0 border-b border-white/5 last:border-0 pb-4">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {!isManager && (
                                      <button
                                        onClick={() => {
                                          setSelectedCreationTplIds(prev => 
                                            prev.includes(tpl.id) ? prev.filter(id => id !== tpl.id) : [...prev, tpl.id]
                                          );
                                        }}
                                        className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                                      >
                                        {isSelected ? (
                                          <CheckSquare className="w-4.5 h-4.5 text-brand-cyan" />
                                        ) : (
                                          <Square className="w-4.5 h-4.5 text-slate-600 hover:text-slate-400" />
                                        )}
                                      </button>
                                    )}
                                    <div className="space-y-1 flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">{tpl.name}</span>
                                        <span className="text-[9px] bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan px-2 py-0.5 rounded-full font-semibold uppercase">
                                          {tpl.subcategory_name}
                                        </span>
                                      </div>
                                      
                                      {/* Выводим часть заполненных полей для наглядности */}
                                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 font-semibold tracking-wide">
                                        {tpl.fields && tpl.fields['price'] && (
                                          <span>Цена: <b className="text-white">{tpl.fields['price']} ₽</b></span>
                                        )}
                                        {tpl.fields && tpl.fields['amount'] && (
                                          <span>Наличие: <b className="text-white">{tpl.fields['amount']} шт.</b></span>
                                        )}
                                        {tpl.fields && tpl.fields['fields[summary][ru]'] && (
                                          <span className="truncate max-w-[250px]" title={tpl.fields['fields[summary][ru]']}>
                                            Описание: <i className="text-slate-300 font-normal">"{tpl.fields['fields[summary][ru]']}"</i>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                    {!isManager && (
                                      <>
                                        <button
                                          onClick={() => handleStartEditCreationTemplate(tpl)}
                                          className="p-1.5 bg-white/5 border border-white/5 hover:text-white text-slate-400 rounded-lg transition-colors cursor-pointer"
                                          title="Редактировать шаблон"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteCreationTemplate(tpl.id)}
                                          className="p-1.5 bg-red-500/10 hover:bg-red-500/25 border border-transparent hover:border-red-500/15 text-red-400 rounded-lg transition-colors cursor-pointer"
                                          title="Удалить шаблон"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛКА СОЗДАНИЯ ШАБЛОНА ПУБЛИКАЦИИ ЛОТА */}
      {createPortal(
        <AnimatePresence>
          {showCreateCreationModal && (
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
                    {selectedGlobalCategory 
                      ? (editingCreationTemplateId ? 'Редактирование шаблона' : 'Поля шаблона публикации') 
                      : 'Создать шаблон публикации'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowCreateCreationModal(false);
                    setEditingCreationTemplateId(null);
                    setSelectedGameName(null);
                    setSelectedGlobalCategory(null);
                    setCreationForm(null);
                    setSearchCategoryQuery('');
                    setCreationFormName('');
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Тело модалки */}
              <div className="p-4 sm:p-5 flex-1 overflow-y-auto no-scrollbar relative z-10 text-xs">
                {!selectedGlobalCategory ? (
                  !selectedGameName ? (
                    /* ШАГ 1: ВЫБОР ИГРЫ */
                    <div className="space-y-4">
                      <p className="text-slate-400 font-semibold leading-relaxed">
                        Выберите игру из каталога Funpay. Мы загрузим структуру формы лота прямо с сайта, чтобы вы могли настроить и сохранить шаблон!
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
                        >
                          {syncingCategories ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Синхронизировать</span>
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {categoriesLoading ? (
                          <div className="text-center text-slate-500 py-6 animate-pulse">Загрузка игр...</div>
                        ) : globalCategories.length === 0 ? (
                          <div className="text-center text-slate-500 py-6">
                            Игры не найдены. Выполните синхронизацию категорий.
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
                    /* ШАГ 1.5: ВЫБОР ПОДКАТЕГОРИИ */
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
                  /* ШАГ 2: ЗАПОЛНЕНИЕ ШАБЛОНА */
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-950/40 border border-white/5 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Настройка для категории:</span>
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
                        <span className="animate-pulse">Получение структуры формы...</span>
                      </div>
                    ) : creationForm ? (
                      <form onSubmit={handleCreateCreationTemplateSubmit} className="space-y-3.5">
                        {/* ИМЯ ШАБЛОНА */}
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                            Название этого шаблона (внутри бота)
                          </label>
                          <input
                            type="text"
                            value={creationFormName}
                            onChange={(e) => setCreationFormName(e.target.value)}
                            className="w-full bg-slate-950/60 border border-brand-cyan/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan font-semibold"
                            placeholder="например, Roblox дефолтный донат"
                            required
                          />
                        </div>

                        {/* ДИНАМИЧЕСКИЕ ПОЛЯ */}
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1.5 no-scrollbar border-t border-white/5 pt-3">
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
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
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
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none placeholder:text-slate-600 font-sans"
                                    placeholder={`По умолчанию: ${f.label || f.name}`}
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
                                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                                    placeholder={`По умолчанию: ${f.label || f.name}`}
                                    required={f.name === 'price' || f.name === 'amount'}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="submit"
                          disabled={savingCreationTemplate}
                          className="w-full py-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-cyan/10 border border-brand-cyan/20 cursor-pointer mt-3"
                        >
                          {savingCreationTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Сохранить шаблон публикации</span>
                        </button>
                      </form>
                    ) : (
                      <div className="py-12 text-center text-slate-500 italic">
                        Не удалось получить форму. Пожалуйста, убедитесь, что у вас верифицирован хотя бы один аккаунт в менеджере.
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
    </div>
  );
}
