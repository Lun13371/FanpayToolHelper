import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Wallet, Star, User, RefreshCw, Edit2, X, 
  ArrowUpCircle, Zap, Check, Loader2, Link2, PlusCircle
} from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LotSettings } from '../../types';

interface FunpayLot {
  lot_id: string;
  lot_name: string;
  price: number;
  amount: number;
  category: string;
}

export default function FunpayManagerTab() {
  const { token, selectedAccountId, setActiveTab, accounts, fetchAccounts } = useAppContext();
  
  const [statsLoading, setStatsLoading] = useState(false);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [raising, setRaising] = useState(false);
  const [lots, setLots] = useState<FunpayLot[]>([]);
  const [localLots, setLocalLots] = useState<LotSettings[]>([]);
  
  // Inline editing
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingLotId, setUpdatingLotId] = useState<string | null>(null);

  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  useEffect(() => {
    if (selectedAccountId && token) {
      loadData();
    }
  }, [selectedAccountId, token]);

  const loadData = async () => {
    setLotsLoading(true);
    await Promise.all([
      fetchLots(selectedAccountId!),
      fetchLocalLots(selectedAccountId!)
    ]);
    setLotsLoading(false);
  };

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
      console.error('Ошибка получения лотов Funpay:', err);
    }
  };

  const fetchLocalLots = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLocalLots(data);
      }
    } catch (err) {
      console.error('Ошибка получения локального демпинга:', err);
    }
  };

  const handleSyncStats = async () => {
    if (!selectedAccountId) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/sync-stats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось обновить статистику');
      }
    } catch {
      alert('Ошибка соединения с сервером');
    } finally {
      setStatsLoading(false);
    }
  };

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

  const handleStartEdit = (lot: FunpayLot) => {
    setEditingLotId(lot.lot_id);
    setEditPrice(lot.price.toString());
  };

  const handleSavePrice = async (lotId: string) => {
    if (!selectedAccountId) return;
    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Пожалуйста, введите корректную цену');
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
        alert(err.detail || 'Сбой обновления цены на Funpay');
      }
    } catch {
      alert('Ошибка сети при обновлении цены');
    } finally {
      setUpdatingLotId(null);
    }
  };

  const handleSetupDumpingRedirect = (lot: FunpayLot) => {
    // Сохраняем в localStorage для автозаполнения
    localStorage.setItem('prepopulate_dumping_lot_id', lot.lot_id);
    localStorage.setItem('prepopulate_dumping_lot_name', lot.lot_name);
    localStorage.setItem('prepopulate_dumping_price', lot.price.toString());
    
    // Перенаправляем на вкладку демпинга
    setActiveTab('dumping');
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
      {/* 1. БЛОК СТАТИСТИКИ (STATS GRID) */}
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-brand-cyan" />
            <h2 className="text-md font-bold text-white">Профиль и статистика Funpay</h2>
          </div>
          <button
            onClick={handleSyncStats}
            disabled={statsLoading || lotsLoading}
            className="p-2 bg-white/5 border border-white/10 text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-xs disabled:opacity-50"
            title="Обновить данные"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
            <span>Обновить профиль</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
          {/* Баланс */}
          <div className="p-4 rounded-2xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Баланс Funpay</span>
              <h3 className="text-md sm:text-lg font-bold text-white mt-0.5">
                {currentAccount?.balance !== undefined ? `${currentAccount.balance.toLocaleString('ru-RU')} ₽` : '0.00 ₽'}
              </h3>
            </div>
          </div>

          {/* Рейтинг */}
          <div className="p-4 rounded-2xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400/20" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Рейтинг продавца</span>
              <h3 className="text-md sm:text-lg font-bold text-white mt-0.5 flex items-center gap-1">
                <span>{currentAccount?.rating ? currentAccount.rating.toFixed(2) : '0.00'}</span>
                <span className="text-slate-500 text-xs font-medium">({currentAccount?.reviews_count || 0} отз.)</span>
              </h3>
            </div>
          </div>

          {/* Никнейм */}
          <div className="p-4 rounded-2xl bg-slate-950/30 border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-brand-cyan" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Профиль</span>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className="text-xs sm:text-sm font-bold text-white truncate max-w-full">
                  {currentAccount?.name.includes('(') ? currentAccount.name.substring(currentAccount.name.indexOf('(') + 1, currentAccount.name.length - 1) : 'Unknown'}
                </span>
                {currentAccount?.funpay_user_id && (
                  <a
                    href={`https://funpay.com/users/${currentAccount.funpay_user_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-brand-cyan transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Ручной подъем лотов */}
          <div className="p-4 rounded-2xl bg-slate-950/30 border border-white/5 flex items-center justify-between gap-4 col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center shrink-0">
                <ArrowUpCircle className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Автоподнятие</span>
                <span className="text-[10px] text-slate-400 mt-0.5 truncate block">
                  {currentAccount?.last_raised 
                    ? `Поднято: ${new Date(currentAccount.last_raised).toLocaleTimeString()}`
                    : 'Не поднималось'
                  }
                </span>
              </div>
            </div>

            <button
              onClick={handleRaiseOffers}
              disabled={raising || lotsLoading}
              className="py-1.5 px-3.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              {raising ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Поднять 🚀</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. ТАБЛИЦА ЛОТОВ С FUNPAY */}
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        
        <div className="flex items-center justify-between mb-4 relative z-10 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-cyan" />
            <h2 className="text-md font-bold text-white">Список лотов на Funpay</h2>
          </div>
          <span className="text-[10px] bg-white/5 border border-white/10 text-slate-400 px-2.5 py-0.5 rounded-full font-semibold">
            {lots.length} АКТИВНЫХ ЛОТОВ
          </span>
        </div>

        {/* Лоадер */}
        {lotsLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 relative z-10">
            <Loader2 className="w-8 h-8 animate-spin text-brand-cyan" />
            <span className="text-xs font-medium">Синхронизация лотов с Funpay...</span>
          </div>
        ) : lots.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs relative z-10">
            Активные лоты на Funpay не найдены. Убедитесь, что сессия верифицирована и у вас есть активные лоты на продажу.
          </div>
        ) : (
          <div className="overflow-x-auto relative z-10 no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase font-semibold border-b border-white/5">
                  <th className="py-3 px-1">Категория</th>
                  <th className="py-3 px-3">Название лота (Funpay)</th>
                  <th className="py-3 px-3">Кол-во</th>
                  <th className="py-3 px-3 text-right">Цена на Funpay</th>
                  <th className="py-3 px-3 text-right">Демпинг</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lots.map((lot) => {
                  const isEditing = editingLotId === lot.lot_id;
                  const isUpdating = updatingLotId === lot.lot_id;
                  
                  // Проверяем привязан ли к демпингу локально
                  const localRule = localLots.find(l => l.lot_id === lot.lot_id);

                  return (
                    <tr key={lot.lot_id} className="hover:bg-white/[0.01] transition-all">
                      <td className="py-4 px-1 text-brand-cyan font-semibold text-[10px] max-w-[120px] truncate" title={lot.category}>
                        {lot.category}
                      </td>
                      <td className="py-4 px-3 font-medium text-white max-w-[250px] truncate" title={lot.lot_name}>
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
                              title="Сохранить"
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => setEditingLotId(null)}
                              disabled={isUpdating}
                              className="p-1.5 bg-white/5 border border-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5 group">
                            <span className="font-bold text-white text-xs">{lot.price.toLocaleString('ru-RU')} ₽</span>
                            <button
                              onClick={() => handleStartEdit(lot)}
                              className="p-1 border border-transparent hover:border-white/5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-all opacity-0 group-hover:opacity-100"
                              title="Редактировать цену"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-3 text-right">
                        {localRule ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[9px] bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                              АКТИВЕН
                            </span>
                            <span className="text-[8px] text-slate-500 font-semibold uppercase mt-0.5">
                              Мин: {localRule.min_price} ₽
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSetupDumpingRedirect(lot)}
                            className="py-1 px-2.5 bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 rounded-lg text-[10px] font-bold tracking-wide transition-all inline-flex items-center gap-1 uppercase"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>Демпинг</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
