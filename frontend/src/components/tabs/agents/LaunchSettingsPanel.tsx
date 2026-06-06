import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown, ChevronUp, FileText, Loader2,
  Settings2, ShoppingBag, Sliders, Wrench, Zap,
} from 'lucide-react';
import type { FanpayAccount } from '../../../types';
import type { LaunchMode } from './types';
import { API_URL } from '../../../context/AppContext';

// ─── Типы настроек ────────────────────────────────────────────────────────────

export type LotTypePref  = 'classic' | 'digital' | 'resell' | 'service';
export type FocusMode    = 'balanced' | 'speed' | 'profit' | 'volume';
export type PriceStrategy = 'undercut' | 'median' | 'premium' | 'auto';

export interface AnalysisPrefs {
  // Блок 1: типы лотов
  lot_types: LotTypePref[];
  // Блок 2: стратегия
  focus_mode: FocusMode;
  price_strategy: PriceStrategy;
  min_margin_pct: number;       // мин. маржа % для resell (0 = не фильтровать)
  // Блок 3: дополнительно
  generate_seo: boolean;
  prefer_no_account: boolean;   // предпочитать ниши без игрового аккаунта
  max_price: number;            // 0 = без ограничения
  min_competition: number;      // мин. кол-во конкурентов в нише (0 = любое)
}

export const DEFAULT_PREFS: AnalysisPrefs = {
  lot_types: ['classic', 'digital', 'resell', 'service'],
  focus_mode: 'balanced',
  price_strategy: 'auto',
  min_margin_pct: 10,
  generate_seo: true,
  prefer_no_account: false,
  max_price: 0,
  min_competition: 0,
};

// ─── Локальные метаданные ────────────────────────────────────────────────────

const LOT_TYPE_OPTIONS: { value: LotTypePref; label: string; emoji: string; desc: string; color: string }[] = [
  { value: 'classic',  emoji: '🎮', label: 'Классик',     desc: 'Валюта, ресурсы, аккаунты',              color: 'border-slate-400/30  bg-slate-400/5  text-slate-300' },
  { value: 'digital',  emoji: '📄', label: 'Цифровой',    desc: 'Гайды, PDF, чеклисты, файлы',            color: 'border-violet-400/30 bg-violet-400/5 text-violet-300' },
  { value: 'resell',   emoji: '🔄', label: 'Перепродажа', desc: 'Купить дешевле — продать дороже',        color: 'border-amber-400/30  bg-amber-400/5  text-amber-300' },
  { value: 'service',  emoji: '🛠', label: 'Услуга',      desc: 'Буст, консультация без аккаунта',        color: 'border-sky-400/30    bg-sky-400/5    text-sky-300' },
];

const FOCUS_OPTIONS: { value: FocusMode; label: string; emoji: string; desc: string }[] = [
  { value: 'balanced', emoji: '⚖️',  label: 'Баланс',       desc: 'Оптимально по всем параметрам' },
  { value: 'profit',   emoji: '💰',  label: 'Прибыль',      desc: 'Максимальная маржа и чек' },
  { value: 'volume',   emoji: '📦',  label: 'Объём',        desc: 'Много дешёвых быстрых лотов' },
  { value: 'speed',    emoji: '⚡',  label: 'Скорость',     desc: 'Быстрые продажи, частый выкуп' },
];

const PRICE_OPTIONS: { value: PriceStrategy; label: string; desc: string }[] = [
  { value: 'auto',    label: 'Авто',       desc: 'Агент выбирает сам' },
  { value: 'undercut',label: 'Демпинг',    desc: 'Ниже рынка на 5–15%' },
  { value: 'median',  label: 'Медиана',    desc: 'По среднерыночной цене' },
  { value: 'premium', label: 'Премиум',    desc: 'Выше рынка, акцент на качество' },
];

// ─── Интерфейс компонента ─────────────────────────────────────────────────────

interface Category { node_id: string; game_name: string; subcategory_name: string; category_type: string; }

interface LaunchSettingsPanelProps {
  visible: boolean;
  mode: LaunchMode;
  limit: number;
  tavilyKey: string;
  targetAccountId: number | null;
  accounts: FanpayAccount[];
  isStarting: boolean;
  manualNodeIds: string[];
  prefs: AnalysisPrefs;
  onModeChange: (m: LaunchMode) => void;
  onLimitChange: (v: number) => void;
  onTavilyKeyChange: (v: string) => void;
  onTargetAccountChange: (v: number | null) => void;
  onManualNodeIdsChange: (ids: string[]) => void;
  onPrefsChange: (p: AnalysisPrefs) => void;
  onSubmit: () => void;
}

export function LaunchSettingsPanel({
  visible, mode, limit, tavilyKey, targetAccountId, accounts,
  isStarting, manualNodeIds, prefs,
  onModeChange, onLimitChange, onTavilyKeyChange, onTargetAccountChange,
  onManualNodeIdsChange, onPrefsChange, onSubmit,
}: LaunchSettingsPanelProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [openSection, setOpenSection] = useState<'types' | 'strategy' | 'extra' | null>('types');

  useEffect(() => {
    if (mode !== 'manual') return;
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    fetch(`${API_URL}/api/v1/agents/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setCategories).catch(() => setCategories([]));
  }, [mode]);

  const filtered = categories.filter(c =>
    !catSearch || c.game_name.toLowerCase().includes(catSearch.toLowerCase()) ||
    c.subcategory_name.toLowerCase().includes(catSearch.toLowerCase())
  );
  const toggleCat = (id: string) => onManualNodeIdsChange(
    manualNodeIds.includes(id) ? manualNodeIds.filter(x => x !== id) : [...manualNodeIds, id]
  );
  const toggleLotType = (t: LotTypePref) => onPrefsChange({
    ...prefs,
    lot_types: prefs.lot_types.includes(t)
      ? prefs.lot_types.filter(x => x !== t)
      : [...prefs.lot_types, t],
  });

  const Section = ({ id, icon: Icon, title, badge, children }: {
    id: 'types' | 'strategy' | 'extra'; icon: React.ElementType;
    title: string; badge?: string; children: React.ReactNode;
  }) => (
    <div className="rounded-2xl bg-slate-950/40 border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpenSection(openSection === id ? null : id)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.02] transition"
      >
        <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-xs font-semibold text-white flex-1">{title}</span>
        {badge && (
          <span className="rounded-full bg-brand-cyan/10 border border-brand-cyan/20 px-2 py-0.5 text-[9px] font-semibold text-brand-cyan">
            {badge}
          </span>
        )}
        {openSection === id
          ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        }
      </button>
      <AnimatePresence initial={false}>
        {openSection === id && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.05]"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
          className="p-5 sm:p-6 rounded-3xl glow-card relative"
        >
          <div className="glow-bg rounded-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-brand-cyan" />
              <h2 className="text-md font-bold text-white">Параметры запуска</h2>
            </div>

            {/* ── Базовые настройки (всегда видны) ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Режим</label>
                <div className="flex gap-1 rounded-2xl bg-slate-950/40 border border-white/5 p-1">
                  {(['auto', 'manual'] as LaunchMode[]).map(m => (
                    <button key={m} onClick={() => onModeChange(m)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${mode === m ? 'bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20' : 'text-slate-400 hover:text-white'}`}
                    >{m === 'auto' ? 'Авто' : 'Ручной'}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Лимит категорий</label>
                <input type="number" min={2} max={12} value={limit}
                  onChange={e => onLimitChange(Number(e.target.value) || 5)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Аккаунт</label>
                <select value={targetAccountId ?? ''}
                  onChange={e => onTargetAccountChange(Number(e.target.value) || null)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                >
                  <option value="">— Без привязки —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tavily API Key</label>
                <input type="password" value={tavilyKey} placeholder="tvly-…"
                  onChange={e => onTavilyKeyChange(e.target.value)}
                  className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                />
              </div>
            </div>

            {/* ── Три раскрывающихся блока ── */}
            <div className="space-y-2 mb-4">

              {/* Блок 1: Типы лотов */}
              <Section
                id="types"
                icon={ShoppingBag}
                title="Типы лотов"
                badge={`${prefs.lot_types.length}/4 выбрано`}
              >
                <p className="text-[10px] text-slate-600 mb-3">
                  Выбери какие форматы будет генерировать агент. Можно выбрать несколько.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LOT_TYPE_OPTIONS.map(opt => {
                    const active = prefs.lot_types.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleLotType(opt.value)}
                        className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${active ? opt.color : 'border-white/5 bg-white/[0.02] text-slate-500 hover:border-white/10 hover:text-slate-300'}`}
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="text-base leading-none">{opt.emoji}</span>
                          <span className="text-xs font-bold truncate">{opt.label}</span>
                          {active && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-current opacity-80 shrink-0" />
                          )}
                        </div>
                        <span className="text-[9px] leading-3 opacity-60">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {prefs.lot_types.length === 0 && (
                  <p className="mt-2 text-[10px] text-rose-400">⚠ Выбери хотя бы один тип</p>
                )}
              </Section>

              {/* Блок 2: Стратегия */}
              <Section
                id="strategy"
                icon={Sliders}
                title="Стратегия генерации"
                badge={FOCUS_OPTIONS.find(f => f.value === prefs.focus_mode)?.label}
              >
                <div className="space-y-4">
                  {/* Фокус */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2 block">Фокус анализа</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FOCUS_OPTIONS.map(opt => {
                        const active = prefs.focus_mode === opt.value;
                        return (
                          <button key={opt.value}
                            onClick={() => onPrefsChange({ ...prefs, focus_mode: opt.value })}
                            className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${active ? 'border-brand-cyan/30 bg-brand-cyan/5 text-brand-cyan' : 'border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/10 hover:text-slate-300'}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm leading-none">{opt.emoji}</span>
                              <span className="text-xs font-bold">{opt.label}</span>
                            </div>
                            <span className="text-[9px] leading-3 opacity-60">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ценовая стратегия */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2 block">Ценовая стратегия</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRICE_OPTIONS.map(opt => {
                        const active = prefs.price_strategy === opt.value;
                        return (
                          <button key={opt.value}
                            onClick={() => onPrefsChange({ ...prefs, price_strategy: opt.value })}
                            title={opt.desc}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/5 bg-white/[0.02] text-slate-500 hover:border-white/10 hover:text-slate-300'}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Мин. маржа перепродажи */}
                  {prefs.lot_types.includes('resell') && (
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2 block">
                        Мин. маржа перепродажи — <span className="text-amber-400 normal-case">{prefs.min_margin_pct}%</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0} max={50} step={5} value={prefs.min_margin_pct}
                          onChange={e => onPrefsChange({ ...prefs, min_margin_pct: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1"
                        />
                        <span className="text-xs font-bold text-amber-400 w-10 text-right">{prefs.min_margin_pct}%</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-700 mt-1">
                        <span>0% — любой</span><span>25%+</span><span>50%</span>
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Блок 3: Дополнительные настройки */}
              <Section id="extra" icon={Settings2} title="Дополнительно">
                <div className="space-y-3">
                  {/* Чекбоксы */}
                  <div className="space-y-2">
                    {[
                      {
                        key: 'generate_seo' as const,
                        label: 'Генерировать SEO-ключи',
                        desc: 'Агент добавит теги для поиска FunPay',
                        icon: FileText,
                      },
                      {
                        key: 'prefer_no_account' as const,
                        label: 'Предпочитать ниши без аккаунта',
                        desc: 'Отдавать приоритет digital/service категориям',
                        icon: Wrench,
                      },
                    ].map(item => (
                      <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={prefs[item.key]}
                            onChange={e => onPrefsChange({ ...prefs, [item.key]: e.target.checked })}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition ${prefs[item.key] ? 'bg-brand-cyan/20 border-brand-cyan/50' : 'bg-white/[0.03] border-white/10 group-hover:border-white/20'}`}>
                            {prefs[item.key] && <div className="w-2 h-2 rounded-sm bg-brand-cyan" />}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                            <item.icon className="w-3 h-3 text-slate-500" />
                            {item.label}
                          </div>
                          <div className="text-[9px] text-slate-600 mt-0.5">{item.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Числовые фильтры */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Макс. цена лота (₽)
                      </label>
                      <div className="relative">
                        <input type="number" min={0} step={50} value={prefs.max_price || ''}
                          onChange={e => onPrefsChange({ ...prefs, max_price: Number(e.target.value) || 0 })}
                          placeholder="0 = без ограничений"
                          className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Мин. конкурентов в нише
                      </label>
                      <input type="number" min={0} step={1} value={prefs.min_competition || ''}
                        onChange={e => onPrefsChange({ ...prefs, min_competition: Number(e.target.value) || 0 })}
                        placeholder="0 = любое"
                        className="w-full h-9 rounded-2xl bg-slate-950/40 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 transition"
                      />
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Ручной выбор категорий */}
            {mode === 'manual' && (
              <div className="mb-4">
                <button onClick={() => setShowCatPicker(p => !p)}
                  className="flex items-center gap-2 text-xs font-semibold text-brand-cyan mb-2 hover:text-cyan-300 transition"
                >
                  {showCatPicker ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Выбрать категории вручную
                  {manualNodeIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-brand-cyan/15 border border-brand-cyan/25 px-2 py-0.5 text-[9px] text-brand-cyan">
                      {manualNodeIds.length} выбрано
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {showCatPicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl bg-slate-950/40 border border-white/5 p-3">
                        <input value={catSearch} onChange={e => setCatSearch(e.target.value)}
                          placeholder="Поиск игры или категории…"
                          className="w-full h-8 rounded-xl bg-black/20 border border-white/5 px-3 text-xs text-white outline-none focus:border-brand-cyan/40 mb-3 transition"
                        />
                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {filtered.length === 0 && (
                            <div className="text-xs text-slate-600 py-4 text-center">
                              {categories.length === 0 ? 'Загрузка категорий…' : 'Ничего не найдено'}
                            </div>
                          )}
                          {filtered.slice(0, 80).map(cat => {
                            const sel = manualNodeIds.includes(cat.node_id);
                            return (
                              <button key={cat.node_id} onClick={() => toggleCat(cat.node_id)}
                                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition ${sel ? 'bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan' : 'bg-white/[0.02] border border-white/5 text-slate-300 hover:bg-white/[0.05]'}`}
                              >
                                <span>{cat.game_name} <span className="text-slate-500">→</span> {cat.subcategory_name}</span>
                                <span className={`shrink-0 text-[9px] font-mono ${sel ? 'text-brand-cyan' : 'text-slate-600'}`}>
                                  #{cat.node_id}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {manualNodeIds.length > 0 && (
                          <button onClick={() => onManualNodeIdsChange([])}
                            className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 transition"
                          >
                            Сбросить выбор
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Кнопка запуска ── */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={onSubmit} disabled={isStarting || prefs.lot_types.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20 py-2.5 px-5 text-xs font-semibold transition disabled:opacity-50"
              >
                {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {isStarting ? 'Запускаем…' : 'Запустить анализ'}
              </button>
              {/* Краткое превью настроек */}
              <div className="flex flex-wrap gap-1.5">
                {prefs.lot_types.map(t => {
                  const meta: Record<string, string> = { classic:'🎮', digital:'📄', resell:'🔄', service:'🛠' };
                  return (
                    <span key={t} className="text-[9px] text-slate-600 bg-white/[0.03] border border-white/5 rounded-full px-2 py-0.5">
                      {meta[t]} {t}
                    </span>
                  );
                })}
                <span className="text-[9px] text-slate-600 bg-white/[0.03] border border-white/5 rounded-full px-2 py-0.5">
                  {FOCUS_OPTIONS.find(f => f.value === prefs.focus_mode)?.emoji} {prefs.focus_mode}
                </span>
                <span className="text-[9px] text-slate-600 bg-white/[0.03] border border-white/5 rounded-full px-2 py-0.5">
                  💲 {prefs.price_strategy}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
