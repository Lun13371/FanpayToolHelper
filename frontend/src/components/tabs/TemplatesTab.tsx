import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layers, Plus, RefreshCw, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { LotTemplate } from '../../types';

export default function TemplatesTab() {
  const { token, user } = useAppContext();
  
  const [templates, setTemplates] = useState<LotTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', min_price: '', undercut_value: '0.01', is_active: true });
  
  // Редактирование
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', min_price: '', undercut_value: '0.01' });

  useEffect(() => {
    if (token) {
      fetchTemplates();
    }
  }, [token]);

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
      console.error('Ошибка получения шаблонов:', err);
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
    if (!confirm('Вы действительно хотите удалить этот шаблон?')) return;
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

  const isManager = user?.role === 'manager';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* ЛЕВАЯ КОЛОНКА: ФОРМА СОЗДАНИЯ ШАБЛОНА */}
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
                  placeholder="например, CS2 скины демпинг"
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

      {/* ПРАВАЯ КОЛОНКА: СПИСОК ШАБЛОНОВ */}
      <div className={isManager ? "lg:col-span-12" : "lg:col-span-8"}>
        <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
          <div className="glow-bg rounded-3xl" />
          
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h2 className="text-md font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-cyan" />
              <span>Глобальные шаблоны лотов</span>
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
                  ? "У вашего владельца еще нет настроенных шаблонов лотов." 
                  : "У вас еще нет глобальных шаблонов лотов. Создайте первый слева!"}
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
                            placeholder="Название"
                          />
                          <input 
                            type="number"
                            step="0.01"
                            value={editForm.min_price}
                            onChange={(e) => setEditForm({ ...editForm, min_price: e.target.value })}
                            className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white"
                            placeholder="Мин. цена"
                          />
                          <input 
                            type="number"
                            step="0.01"
                            value={editForm.undercut_value}
                            onChange={(e) => setEditForm({ ...editForm, undercut_value: e.target.value })}
                            className="bg-slate-950/60 border border-white/5 rounded-xl py-1.5 px-3 text-xs text-white"
                            placeholder="Шаг демпинга"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSaveEdit(tpl.id)}
                            className="py-1 px-3 bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Сохранить</span>
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="py-1 px-3 bg-white/5 border border-white/5 text-slate-400 text-xs font-semibold rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                            <span>{tpl.name}</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${tpl.is_active ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-slate-500/10 border border-slate-500/20 text-slate-500'}`}>
                              {tpl.is_active ? 'АКТИВЕН' : 'НЕАКТИВЕН'}
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
                                title="Переключить статус по умолчанию"
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
                                title="Редактировать"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDelete(tpl.id)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/25 border border-transparent hover:border-red-500/15 text-red-400 rounded-lg transition-colors"
                                title="Удалить"
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
  );
}
