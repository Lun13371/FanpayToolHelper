import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layers, Plus, Trash2, MessageSquare } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { WarehouseItem, ReviewTemplate } from '../../types';

export default function DeliveryTab() {
  const { token, selectedAccountId } = useAppContext();
  
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [reviewTemplates, setReviewTemplates] = useState<ReviewTemplate[]>([]);
  const [itemForm, setItemForm] = useState({ lot_name: '', content: '', is_multi_use: false });
  const [reviewForm, setReviewForm] = useState({ text: '' });

  useEffect(() => {
    if (selectedAccountId && token) {
      fetchWarehouseItems(selectedAccountId);
      fetchReviewTemplates(selectedAccountId);
    }
  }, [selectedAccountId, token]);

  const fetchWarehouseItems = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/items?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWarehouseItems(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddWarehouseItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: selectedAccountId,
          ...itemForm
        })
      });
      if (res.ok) {
        fetchWarehouseItems(selectedAccountId);
        setItemForm({ lot_name: '', content: '', is_multi_use: false });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteWarehouseItem = async (itemId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && selectedAccountId) {
        fetchWarehouseItems(selectedAccountId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReviewTemplates = async (accId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/reviews?account_id=${accId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReviewTemplates(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddReviewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/reviews`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: selectedAccountId,
          ...reviewForm
        })
      });
      if (res.ok) {
        fetchReviewTemplates(selectedAccountId);
        setReviewForm({ text: '' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReviewTemplate = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/delivery/reviews/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && selectedAccountId) {
        fetchReviewTemplates(selectedAccountId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedAccountId) {
    return (
      <div className="text-slate-400 text-center py-12 glow-card rounded-3xl">
        Сначала выберите активную сессию во вкладке "Главная"
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Левая сторона: управление ключами */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
            <div className="glow-bg rounded-3xl" />
            <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center justify-between">
              <span>Склад товаров автовыдачи</span>
              <Layers className="w-4 h-4 text-brand-cyan" />
            </h2>

            <form onSubmit={handleAddWarehouseItem} className="grid grid-cols-1 sm:grid-cols-12 gap-3 relative z-10 mb-6">
              <div className="sm:col-span-4">
                <input 
                  type="text" 
                  value={itemForm.lot_name}
                  onChange={(e) => setItemForm({ ...itemForm, lot_name: e.target.value })}
                  className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                  placeholder="Точное название лота"
                  required
                />
              </div>
              <div className="sm:col-span-5">
                <input 
                  type="text" 
                  value={itemForm.content}
                  onChange={(e) => setItemForm({ ...itemForm, content: e.target.value })}
                  className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                  placeholder="Ключ выдачи / Инструкция"
                  required
                />
              </div>
              <div className="sm:col-span-2 flex items-center pl-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 text-[10px] font-bold">
                  <input 
                    type="checkbox" 
                    checked={itemForm.is_multi_use}
                    onChange={(e) => setItemForm({ ...itemForm, is_multi_use: e.target.checked })}
                  />
                  <span>Многораз.</span>
                </label>
              </div>
              <div className="sm:col-span-1">
                <button
                  type="submit"
                  className="w-full bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 p-2 rounded-xl flex items-center justify-center transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="space-y-2 relative z-10 overflow-y-auto max-h-[400px] pr-2">
              {warehouseItems.length === 0 ? (
                <div className="text-slate-500 text-center py-8 text-xs">На складе нет товаров</div>
              ) : (
                warehouseItems.map(item => (
                  <div key={item.id} className="p-3 bg-slate-950/20 border border-white/5 rounded-xl flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-grow pr-4">
                      <span className="font-bold text-white block">{item.lot_name}</span>
                      <span className="text-slate-400 block mt-0.5 truncate font-mono text-[10px]">{item.content}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${
                        item.is_multi_use ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' : 'bg-cyan-500/10 text-brand-cyan border border-brand-cyan/15'
                      }`}>
                        {item.is_multi_use ? 'МНОГОРАЗ' : 'ОДНОРАЗ'}
                      </span>
                      {item.is_sold && (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/15 px-2 py-0.5 rounded-md font-bold text-[9px]">
                          ПРОДАН
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteWarehouseItem(item.id)}
                        className="text-slate-500 hover:text-red-400 p-1 rounded transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Правая сторона: шаблоны автоотзывов */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
            <div className="glow-bg rounded-3xl" />
            <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center justify-between">
              <span>Шаблоны автоотзывов</span>
              <MessageSquare className="w-4 h-4 text-brand-indigo" />
            </h2>

            <form onSubmit={handleAddReviewTemplate} className="space-y-3 relative z-10 mb-4">
              <textarea 
                value={reviewForm.text}
                onChange={(e) => setReviewForm({ text: e.target.value })}
                className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                placeholder="Шаблон отзыва (например: Спасибо за покупку!)"
                rows={3}
                required
              />
              <button
                type="submit"
                className="w-full bg-white/10 hover:bg-white/15 text-white py-2 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить шаблон</span>
              </button>
            </form>

            <div className="space-y-2 relative z-10 overflow-y-auto max-h-[300px]">
              {reviewTemplates.length === 0 ? (
                <div className="text-slate-500 text-center py-4 text-xs">Нет заготовленных отзывов</div>
              ) : (
                reviewTemplates.map(rev => (
                  <div key={rev.id} className="p-3 bg-slate-950/20 border border-white/5 rounded-xl flex items-start justify-between text-xs">
                    <p className="text-slate-300 pr-3">{rev.text}</p>
                    <button
                      onClick={() => handleDeleteReviewTemplate(rev.id)}
                      className="text-slate-500 hover:text-red-400 transition-all shrink-0 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
