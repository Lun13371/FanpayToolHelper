import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Radio, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LotSettings } from '../../types';

export default function DumpingTab() {
  const { token, selectedAccountId } = useAppContext();
  
  const [lotSettings, setLotSettings] = useState<LotSettings[]>([]);
  const [lotForm, setLotForm] = useState({ lot_id: '', lot_name: '', min_price: 0, undercut_value: 0.01 });

  useEffect(() => {
    if (selectedAccountId && token) {
      fetchLotSettings(selectedAccountId);
    }
  }, [selectedAccountId, token]);

  // Автозаполнение из localStorage при перенаправлении из вкладки Менеджер
  useEffect(() => {
    const preId = localStorage.getItem('prepopulate_dumping_lot_id');
    const preName = localStorage.getItem('prepopulate_dumping_lot_name');
    const prePrice = localStorage.getItem('prepopulate_dumping_price');
    
    if (preId && preName) {
      setLotForm({
        lot_id: preId,
        lot_name: preName,
        min_price: parseFloat(prePrice || '0') || 0,
        undercut_value: 0.01
      });
      
      localStorage.removeItem('prepopulate_dumping_lot_id');
      localStorage.removeItem('prepopulate_dumping_lot_name');
      localStorage.removeItem('prepopulate_dumping_price');
    }
  }, [selectedAccountId]);

  const fetchLotSettings = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLotSettings(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/lots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: selectedAccountId,
          ...lotForm
        })
      });
      if (res.ok) {
        fetchLotSettings(selectedAccountId);
        setLotForm({ lot_id: '', lot_name: '', min_price: 0, undercut_value: 0.01 });
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка создания лота');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLot = async (id: number, active: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: active })
      });
      if (res.ok && selectedAccountId) {
        fetchLotSettings(selectedAccountId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLot = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && selectedAccountId) {
        fetchLotSettings(selectedAccountId);
      }
    } catch (err) {
      console.error(err);
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
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center justify-between">
          <span>Автопонижение цен лотов</span>
          <Radio className="w-4 h-4 text-brand-cyan" />
        </h2>

        <form onSubmit={handleAddLot} className="grid grid-cols-1 sm:grid-cols-12 gap-3 relative z-10 mb-6">
          <div className="sm:col-span-3">
            <input 
              type="text" 
              value={lotForm.lot_id}
              onChange={(e) => setLotForm({ ...lotForm, lot_id: e.target.value })}
              className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
              placeholder="ID лота (с URL)"
              required
            />
          </div>
          <div className="sm:col-span-4">
            <input 
              type="text" 
              value={lotForm.lot_name}
              onChange={(e) => setLotForm({ ...lotForm, lot_name: e.target.value })}
              className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
              placeholder="Название для себя"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <input 
              type="number" 
              step="0.01"
              value={lotForm.min_price || ''}
              onChange={(e) => setLotForm({ ...lotForm, min_price: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
              placeholder="Миним. цена"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <input 
              type="number" 
              step="0.01"
              value={lotForm.undercut_value || ''}
              onChange={(e) => setLotForm({ ...lotForm, undercut_value: parseFloat(e.target.value) || 0.01 })}
              className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
              placeholder="Шаг среза"
              required
            />
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              className="w-full h-full bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 rounded-xl flex items-center justify-center py-2 transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Список настроек демпинга */}
        <div className="space-y-2 relative z-10">
          {lotSettings.length === 0 ? (
            <div className="text-slate-500 text-center py-8 text-xs">Демпинг не настроен ни для одного лота</div>
          ) : (
            lotSettings.map(lot => (
              <div key={lot.id} className="p-4 bg-slate-950/20 border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-white">{lot.lot_name}</span>
                  <div className="text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                    <span>ID: <code className="text-brand-cyan">{lot.lot_id}</code></span>
                    <span>Минимум: <b>{lot.min_price} руб</b></span>
                    <span>Срез: <b>{lot.undercut_value} руб</b></span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 justify-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase">Демпинг:</span>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleToggleLot(lot.id, !lot.is_active)}
                    >
                      {lot.is_active ? (
                        <ToggleRight className="w-7 h-7 text-brand-cyan filter drop-shadow-[0_0_5px_rgba(0,242,254,0.3)]" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-slate-600" />
                      )}
                    </motion.button>
                  </div>

                  <button
                    onClick={() => handleDeleteLot(lot.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
