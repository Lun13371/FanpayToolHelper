import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Loader2, Check } from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div 
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-brand-cyan/20 hover:bg-slate-950/20 cursor-pointer select-none transition-all duration-300 group"
    >
      <div className="flex flex-col pr-4">
        <span className="text-xs font-bold text-slate-100 block group-hover:text-brand-cyan transition-colors duration-300">{label}</span>
        <span className="text-[10px] text-slate-400 block mt-0.5 leading-normal">{description}</span>
      </div>
      <button
        type="button"
        className={`relative w-10 h-5.5 rounded-full transition-all duration-300 flex items-center p-0.5 border outline-none focus:outline-none shrink-0 ${
          checked 
            ? 'bg-brand-cyan/15 border-brand-cyan/30 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
            : 'bg-slate-950/80 border-white/10'
        }`}
      >
        <motion.div
          animate={{ x: checked ? 18 : 0 }}
          transition={{ type: 'spring', stiffness: 550, damping: 28 }}
          className={`w-4 h-4 rounded-full transition-all duration-300 ${
            checked 
              ? 'bg-brand-cyan shadow-[0_0_8px_rgba(6,182,212,0.6)]' 
              : 'bg-slate-600'
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsSubTab() {
  const { token, selectedAccountId, accounts, fetchAccounts } = useAppContext();
  const currentAccount = accounts.find(a => a.id === selectedAccountId);

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    system_prompt: '',
    fallback_template: '',
    proxy_url: '',
    telegram_chat_id: '',
    always_online: true,
    auto_raise_active: true,
    auto_delivery_active: true,
    ai_reply_active: true,
    operator_snooze_minutes: 20,
    review_followup_active: true
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
        telegram_chat_id: currentAccount.telegram_chat_id || '',
        always_online: currentAccount.always_online !== undefined ? currentAccount.always_online : true,
        auto_raise_active: currentAccount.auto_raise_active !== undefined ? currentAccount.auto_raise_active : true,
        auto_delivery_active: currentAccount.auto_delivery_active !== undefined ? currentAccount.auto_delivery_active : true,
        ai_reply_active: currentAccount.ai_reply_active !== undefined ? currentAccount.ai_reply_active : true,
        operator_snooze_minutes: currentAccount.operator_snooze_minutes !== undefined ? currentAccount.operator_snooze_minutes : 20,
        review_followup_active: currentAccount.review_followup_active !== undefined ? currentAccount.review_followup_active : true
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
          telegram_chat_id: settingsForm.telegram_chat_id,
          always_online: settingsForm.always_online,
          auto_raise_active: settingsForm.auto_raise_active,
          auto_delivery_active: settingsForm.auto_delivery_active,
          ai_reply_active: settingsForm.ai_reply_active,
          operator_snooze_minutes: Number(settingsForm.operator_snooze_minutes),
          review_followup_active: settingsForm.review_followup_active
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

            <div className="space-y-3 pt-3 border-t border-white/5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Фоновые автоматические задачи</span>
              
              <Toggle
                checked={settingsForm.always_online}
                onChange={(checked) => setSettingsForm({ ...settingsForm, always_online: checked })}
                label="Вечный онлайн (Always Online)"
                description="Держать профиль постоянно в сети на FunPay"
              />

              <Toggle
                checked={settingsForm.auto_raise_active}
                onChange={(checked) => setSettingsForm({ ...settingsForm, auto_raise_active: checked })}
                label="Автоподнятие лотов"
                description="Периодический подъем лотов по расписанию"
              />

              <Toggle
                checked={settingsForm.auto_delivery_active}
                onChange={(checked) => setSettingsForm({ ...settingsForm, auto_delivery_active: checked })}
                label="Автовыдача товаров"
                description="Автоматическая отправка товаров покупателям"
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

            <div className="space-y-3 pt-3 border-t border-white/5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Дополнительные параметры</span>

              <Toggle
                checked={settingsForm.ai_reply_active}
                onChange={(checked) => setSettingsForm({ ...settingsForm, ai_reply_active: checked })}
                label="Ответы ИИ (AI Reply)"
                description="Включить автоматические ИИ-ответы на сообщения"
              />

              <Toggle
                checked={settingsForm.review_followup_active}
                onChange={(checked) => setSettingsForm({ ...settingsForm, review_followup_active: checked })}
                label="Напоминание об отзыве"
                description="Рассылка напоминаний через 1 час после выдачи"
              />

              {/* Snooze Minutes */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Засыпание ИИ после ручного ответа оператора (минут)</label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={settingsForm.operator_snooze_minutes}
                  onChange={(e) => setSettingsForm({ ...settingsForm, operator_snooze_minutes: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                  placeholder="Обычно 20 минут"
                  required
                />
              </div>
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
