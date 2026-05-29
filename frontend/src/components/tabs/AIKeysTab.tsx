import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { AIKey } from '../../types';

export default function AIKeysTab() {
  const { token } = useAppContext();
  
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [aiKeysBulkText, setAiKeysBulkText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchAIKeys();
    }
  }, [token]);

  const fetchAIKeys = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAiKeys(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportAIKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keys_string: aiKeysBulkText })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchAIKeys();
        setAiKeysBulkText('');
      } else {
        alert(data.detail || 'Сбой импорта');
      }
    } catch {
      alert('Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAIKey = async (id: number, active: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/${id}/toggle?active=${active}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAIKeys();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAIKey = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/ai-keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAIKeys();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
    >
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center gap-2">
          <Key className="w-4 h-4 text-brand-cyan" />
          <span>Управление глобальными ключами ИИ (Fireworks API)</span>
        </h2>

        <form onSubmit={handleImportAIKeys} className="space-y-3 relative z-10 mb-6">
          <textarea 
            value={aiKeysBulkText}
            onChange={(e) => setAiKeysBulkText(e.target.value)}
            className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40 placeholder:text-slate-600"
            placeholder="Вставьте ключи Fireworks API. Поддерживается пакетный ввод (через запятые или переносы строк)..."
            rows={4}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 py-2.5 px-6 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Пакетно импортировать ключи</span>
          </button>
        </form>

        {/* Таблица API ключей */}
        <div className="space-y-2 relative z-10 max-h-[400px] overflow-y-auto">
          {aiKeys.length === 0 ? (
            <div className="text-slate-500 text-center py-6 text-xs">Нет добавленных ключей</div>
          ) : (
            aiKeys.map(keyObj => (
              <div key={keyObj.id} className="p-3.5 bg-slate-950/20 border border-white/5 rounded-2xl flex items-center justify-between text-xs gap-3">
                <div className="min-w-0">
                  <code className="text-brand-cyan block truncate font-mono text-[11px] sm:text-xs">{keyObj.key_value}</code>
                  <div className="text-slate-400 mt-1 flex gap-4 text-[10px]">
                    <span>Запросов: <b>{keyObj.total_calls}</b></span>
                    <span>Ошибок: <b>{keyObj.error_count}</b></span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleToggleAIKey(keyObj.id, !keyObj.is_active)}
                  >
                    {keyObj.is_active ? (
                      <ToggleRight className="w-7 h-7 text-brand-cyan filter drop-shadow-[0_0_5px_rgba(0,242,254,0.3)]" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-slate-600" />
                    )}
                  </motion.button>
                  
                  <button
                    onClick={() => handleDeleteAIKey(keyObj.id)}
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
