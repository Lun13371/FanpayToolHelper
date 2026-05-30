import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Loader2, Check } from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';

export default function SettingsSubTab() {
  const { token, selectedAccountId, accounts, fetchAccounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    system_prompt: '',
    fallback_template: '',
    proxy_url: '',
    telegram_chat_id: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync with currentAccount
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
  }, [currentAccount]);

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

  return (
    <motion.div
      key="tab_settings"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="p-5 sm:p-6 rounded-3xl glow-card relative w-full"
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
  );
}
