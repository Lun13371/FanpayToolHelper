import React, { useState, useEffect } from 'react';
import { 
  Radio, Sliders, ToggleLeft, ToggleRight, Trash2, Edit3, Check, X,
  Save, ShieldCheck, Sparkles, Search, ArrowRightLeft
} from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';
import { LotSettings } from '../../../types';

interface FunpayLot {
  lot_id: string;
  lot_name: string;
  price: number;
  amount: number;
  category: string;
}

interface DampingSubTabProps {
  lots: FunpayLot[];
}

export default function DampingSubTab({ lots }: DampingSubTabProps) {
  const { token, selectedAccountId, accounts, fetchAccounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  // Состояния для глобальных настроек
  const [globalActive, setGlobalActive] = useState(false);
  const [globalUndercut, setGlobalUndercut] = useState(0.01);
  const [globalMinPrice, setGlobalMinPrice] = useState(0.0);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Состояния для локальных правил
  const [localRules, setLocalRules] = useState<LotSettings[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Поиск и фильтрация
  const [searchQuery, setSearchSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Редактирование конкретного лота в списке
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState({ min_price: '', undercut_value: '0.01', is_active: true });
  const [savingLotId, setSavingLotId] = useState<string | null>(null);

  // Инициализация глобальных настроек при смене аккаунта
  useEffect(() => {
    if (currentAccount) {
      setGlobalActive(currentAccount.global_damping_active ?? false);
      setGlobalUndercut(currentAccount.global_undercut_value ?? 0.01);
      setGlobalMinPrice(currentAccount.global_min_price ?? 0.0);
    }
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (selectedAccountId && token) {
      fetchLocalRules();
    }
  }, [selectedAccountId, token]);

  const fetchLocalRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots?account_id=${selectedAccountId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLocalRules(data);
      }
    } catch (err) {
      console.error('Ошибка загрузки правил демпинга:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  // Сохранение глобальных настроек
  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    setSavingGlobal(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          global_damping_active: globalActive,
          global_undercut_value: globalUndercut,
          global_min_price: globalMinPrice
        })
      });
      if (res.ok) {
        await fetchAccounts(); // Обновляем сессию в глобальном контексте
        alert('Глобальные настройки демпинга успешно сохранены!');
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось сохранить настройки');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка соединения');
    } finally {
      setSavingGlobal(false);
    }
  };

  // Начать индивидуальное редактирование лота
  const startEditLot = (lotId: string, rule?: LotSettings) => {
    setEditingLotId(lotId);
    if (rule) {
      setLotForm({
        min_price: rule.min_price.toString(),
        undercut_value: rule.undercut_value.toString(),
        is_active: rule.is_active
      });
    } else {
      setLotForm({
        min_price: '',
        undercut_value: '0.01',
        is_active: true
      });
    }
  };

  // Сохранить индивидуальные настройки для лота
  const handleSaveLotRule = async (lot: FunpayLot, rule?: LotSettings) => {
    if (!selectedAccountId) return;
    const minPriceNum = parseFloat(lotForm.min_price);
    const undercutNum = parseFloat(lotForm.undercut_value);

    if (isNaN(minPriceNum) || minPriceNum < 0) {
      alert('Введите корректную минимальную цену (не меньше 0)');
      return;
    }
    if (isNaN(undercutNum) || undercutNum <= 0) {
      alert('Введите корректный шаг среза цены (больше 0)');
      return;
    }

    setSavingLotId(lot.lot_id);
    try {
      const url = rule 
        ? `${API_URL}/api/v1/lots/${rule.id}` 
        : `${API_URL}/api/v1/lots`;
        
      const method = rule ? 'PUT' : 'POST';
      
      const payload = rule 
        ? { min_price: minPriceNum, undercut_value: undercutNum, is_active: lotForm.is_active }
        : { account_id: selectedAccountId, lot_id: lot.lot_id, lot_name: lot.lot_name, min_price: minPriceNum, undercut_value: undercutNum };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditingLotId(null);
        await fetchLocalRules();
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось сохранить настройки лота');
      }
    } catch {
      alert('Ошибка соединения');
    } finally {
      setSavingLotId(null);
    }
  };

  // Удалить/сбросить индивидуальные настройки до глобальных
  const handleResetLotRule = async (ruleId: number, lotId: string) => {
    if (!confirm('Вы уверены, что хотите сбросить индивидуальные настройки? Этот лот вернется к использованию глобальных настроек.')) {
      return;
    }
    setSavingLotId(lotId);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/${ruleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEditingLotId(null);
        await fetchLocalRules();
      } else {
        alert('Не удалось сбросить настройки лота');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setSavingLotId(null);
    }
  };

  // Категории для фильтрации
  const categories = ['all', ...Array.from(new Set(lots.map(l => l.category)))];

  // Фильтруем лоты
  const filteredLots = lots.filter(lot => {
    const matchesSearch = lot.lot_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          lot.lot_id.includes(searchQuery);
    const matchesCategory = selectedCategory === 'all' || lot.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* ПАНЕЛЬ ГЛОБАЛЬНЫХ НАСТРОЕК */}
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        <div className="relative z-10">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Radio className="w-4 h-4 text-brand-cyan animate-pulse" />
            <span>Глобальные настройки автодемпинга</span>
          </h2>

          <form onSubmit={handleSaveGlobal} className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            <div className="md:col-span-3">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                Глобальный демпинг
              </label>
              <div className="flex items-center gap-2 h-9">
                <button
                  type="button"
                  onClick={() => setGlobalActive(!globalActive)}
                  className="cursor-pointer"
                >
                  {globalActive ? (
                    <ToggleRight className="w-8 h-8 text-brand-cyan filter drop-shadow-[0_0_5px_rgba(0,242,254,0.3)]" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600" />
                  )}
                </button>
                <span className="text-xs font-semibold text-slate-300">
                  {globalActive ? 'Активен для всех лотов' : 'Выключен глобально'}
                </span>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                Шаг демпинга по умолчанию (руб.)
              </label>
              <input 
                type="number" 
                step="0.01"
                min="0.01"
                value={globalUndercut}
                onChange={(e) => setGlobalUndercut(parseFloat(e.target.value) || 0.01)}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="Например, 0.01"
                required
              />
            </div>

            <div className="md:col-span-4">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                Минимальная цена по умолчанию (руб.)
              </label>
              <input 
                type="number" 
                step="0.01"
                min="0.0"
                value={globalMinPrice}
                onChange={(e) => setGlobalMinPrice(parseFloat(e.target.value) || 0.0)}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="Минимум, ниже которого бот не опустит цену"
                required
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={savingGlobal}
                className="w-full h-9 bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingGlobal ? 'Сохранение...' : 'Сохранить'}</span>
              </button>
            </div>
          </form>

          {/* Информационная подсказка */}
          <div className="mt-4 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed">
            <Sparkles className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5 animate-pulse" />
            <span>
              <b>Как это работает:</b> если для конкретного лота ниже настроена индивидуальная минимальная цена — бот использует её. Если лот не настроен индивидуально, но включен глобальный демпинг — бот будет демпинговать этот лот с использованием шага <b>{globalUndercut} руб.</b> и не опустит цену ниже <b>{globalMinPrice} руб.</b>
            </span>
          </div>
        </div>
      </div>

      {/* ФИЛЬТРЫ И СПИСОК ЛОТОВ */}
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        <div className="relative z-10 space-y-4">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-brand-cyan" />
              <span>Демпинг отдельных лотов ({lots.length})</span>
            </h2>

            {/* Поиск и выбор категории */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Поиск лота..."
                  value={searchQuery}
                  onChange={(e) => setSearchSearchQuery(e.target.value)}
                  className="bg-slate-950/40 border border-white/5 rounded-xl py-1.5 pl-9 pr-3 text-[11px] text-white focus:outline-none focus:border-brand-cyan/40 w-44"
                />
              </div>

              {categories.length > 2 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-950/40 border border-white/5 rounded-xl py-1.5 px-3 text-[11px] text-white focus:outline-none focus:border-brand-cyan/40 max-w-48"
                >
                  <option value="all">Все категории</option>
                  {categories.filter(c => c !== 'all').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Список лотов */}
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {loadingRules ? (
              <div className="text-center text-slate-500 text-xs py-8 animate-pulse">Загрузка правил демпинга...</div>
            ) : filteredLots.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-8">Лоты не найдены</div>
            ) : (
              filteredLots.map(lot => {
                const rule = localRules.find(r => r.lot_id === lot.lot_id);
                const isEditing = editingLotId === lot.lot_id;
                const isSaving = savingLotId === lot.lot_id;

                return (
                  <div 
                    key={lot.lot_id}
                    className="p-4 bg-slate-950/20 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate max-w-xs md:max-w-md block">
                          {lot.lot_name}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                          {lot.category}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                        <span>ID: <code className="text-brand-cyan">{lot.lot_id}</code></span>
                        <span>Цена на FP: <b className="text-white">{lot.price} руб</b></span>
                        
                        {rule ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded-lg">
                            <ShieldCheck className="w-3 h-3" />
                            Индивидуальный демпинг (Мин: {rule.min_price} руб, срез: {rule.undercut_value} руб, {rule.is_active ? 'Активен' : 'Пауза'})
                          </span>
                        ) : globalActive ? (
                          <span className="flex items-center gap-1 text-brand-cyan font-semibold bg-brand-cyan/5 border border-brand-cyan/10 px-1.5 py-0.5 rounded-lg">
                            <ArrowRightLeft className="w-3 h-3" />
                            Глобальный демпинг (Мин: {globalMinPrice} руб, срез: {globalUndercut} руб)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-500 bg-slate-800/20 border border-white/5 px-1.5 py-0.5 rounded-lg">
                            <X className="w-3 h-3" />
                            Демпинг выключен
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                      {isEditing ? (
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                          <div className="w-24">
                            <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">Мин. цена</label>
                            <input 
                              type="number"
                              step="0.1"
                              placeholder="Мин. цена"
                              value={lotForm.min_price}
                              onChange={(e) => setLotForm({ ...lotForm, min_price: e.target.value })}
                              className="w-full bg-slate-950/60 border border-white/5 rounded-lg py-1 px-2 text-[11px] text-white focus:outline-none"
                            />
                          </div>

                          <div className="w-20">
                            <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">Шаг среза</label>
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="Срез"
                              value={lotForm.undercut_value}
                              onChange={(e) => setLotForm({ ...lotForm, undercut_value: e.target.value })}
                              className="w-full bg-slate-950/60 border border-white/5 rounded-lg py-1 px-2 text-[11px] text-white focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 px-2">
                            <label className="text-[8px] font-bold text-slate-500 uppercase block">Демпинг</label>
                            <button
                              type="button"
                              onClick={() => setLotForm({ ...lotForm, is_active: !lotForm.is_active })}
                              className="cursor-pointer"
                            >
                              {lotForm.is_active ? (
                                <ToggleRight className="w-6 h-6 text-brand-cyan" />
                              ) : (
                                <ToggleLeft className="w-6 h-6 text-slate-600" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSaveLotRule(lot, rule)}
                              disabled={isSaving}
                              className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 rounded-lg transition-all cursor-pointer"
                              title="Сохранить"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingLotId(null)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400 rounded-lg transition-all cursor-pointer"
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditLot(lot.lot_id, rule)}
                            className="bg-white/5 hover:bg-white/10 border border-white/5 py-1.5 px-3 rounded-xl font-bold transition-all text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Настроить индивидуально</span>
                          </button>

                          {rule && (
                            <button
                              onClick={() => handleResetLotRule(rule.id!, lot.lot_id)}
                              disabled={isSaving}
                              className="p-1.5 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/10 rounded-xl text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                              title="Сбросить до глобальных"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
