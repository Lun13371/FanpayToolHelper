import { useState } from 'react';
import {
  FileText, Save, Rocket, Loader2, CheckCircle2, AlertCircle, Gamepad2, Hash,
} from 'lucide-react';
import { TemplateDraft, FanpayAccount } from '../../../types';
import { parseSSEStream } from './types';

interface Props {
  draft: TemplateDraft;
  token: string;
  accounts: FanpayAccount[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function TemplateDraftCard({ draft, token, accounts }: Props) {
  const [name, setName] = useState(draft.name);
  const [fields, setFields] = useState<Record<string, any>>({ ...draft.fields });
  const [savedTemplateId, setSavedTemplateId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishLog, setPublishLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(
    accounts.length === 1 ? accounts[0].id : null
  );

  const setField = (key: string, value: any) =>
    setFields((f) => ({ ...f, [key]: value }));

  const saveTemplate = async (): Promise<number | null> => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          node_id: draft.node_id,
          game_name: draft.game_name,
          subcategory_name: draft.subcategory_name,
          fields,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Ошибка сохранения (${res.status})`);
      }
      const tpl = await res.json();
      setSavedTemplateId(tpl.id);
      return tpl.id as number;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setError(null);
    setPublishLog([]);
    const templateId = savedTemplateId ?? (await saveTemplate());
    if (!templateId) return;
    if (!accountId) {
      setError('Выберите аккаунт для публикации');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lots/templates/creation/publish-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ account_id: accountId, template_ids: [templateId] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Ошибка публикации (${res.status})`);
      }
      await parseSSEStream(res, (ev) => {
        if (ev.type === 'template_start')
          setPublishLog((l) => [...l, `Публикация «${(ev as any).template_name ?? ''}»…`]);
        if (ev.type === 'success') setPublishLog((l) => [...l, `✅ ${ev.message ?? 'Лот опубликован'}`]);
        if (ev.type === 'error') setPublishLog((l) => [...l, `❌ ${ev.message ?? 'Ошибка'}`]);
        if (ev.type === 'sync_start') setPublishLog((l) => [...l, 'Синхронизация кэша лотов…']);
        if (ev.type === 'done')
          setPublishLog((l) => [
            ...l,
            `Готово: успешно ${(ev as any).success_count ?? 0}, ошибок ${(ev as any).failed_count ?? 0}`,
          ]);
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  // ─── Структура формы: все поля категории + опции select-полей ───
  const form = draft.form ?? null;
  const formFields = form?.fields ?? {};
  const formOptions = form?.options ?? {};

  // Все ключи полей: порядок формы + поля, добавленные моделью сверх структуры
  const allKeys = Array.from(new Set([...Object.keys(formFields), ...Object.keys(fields)]));

  const isPriceKey = (k: string) => k === 'price' || k.endsWith('[price]');
  const isAmountKey = (k: string) => k === 'amount' || k.endsWith('[amount]');
  const isDescKey = (k: string) =>
    k.toLowerCase().includes('desc') || k.toLowerCase().includes('text');

  const priceKeys = allKeys.filter(isPriceKey);
  const amountKeys = allKeys.filter(isAmountKey);
  const descKeys = allKeys.filter((k) => !isPriceKey(k) && !isAmountKey(k) && isDescKey(k));
  const otherFields = allKeys.filter(
    (k) => !isPriceKey(k) && !isAmountKey(k) && !isDescKey(k)
  );

  const humanize = (k: string) =>
    k
      .replace(/^data\[/i, '')
      .replace(/[\[\]]/g, ' ')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || k;

  const inputCls =
    'w-full mt-1 px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/10 text-xs text-white outline-none focus:border-brand-cyan/40';

  /** Рендер одного «прочего» поля: select если есть опции, иначе input */
  const renderOtherField = (k: string) => {
    const opts = formOptions[k];
    const current = String(fields[k] ?? '');
    if (Array.isArray(opts) && opts.length > 0) {
      const known = opts.some((o) => String(o.value) === current);
      return (
        <label key={k} className="block">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate block">
            {humanize(k)}
          </span>
          <select
            value={current}
            onChange={(e) => setField(k, e.target.value)}
            className={inputCls}
          >
            {!known && current && <option value={current}>{current}</option>}
            {opts.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.text || String(o.value)}
              </option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={k} className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate block">
          {humanize(k)}
        </span>
        <input
          value={current}
          onChange={(e) => setField(k, e.target.value)}
          className={inputCls}
        />
      </label>
    );
  };

  return (
    <div className="rounded-2xl border border-brand-cyan/20 bg-gradient-to-br from-brand-cyan/[0.06] to-transparent p-4 max-w-2xl">
      {/* Заголовок */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-brand-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-brand-cyan font-semibold">
            Черновик шаблона публикации
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-brand-cyan/40 py-0.5"
          />
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Gamepad2 className="w-3 h-3" /> {draft.game_name}
            </span>
            <span className="text-slate-600">/</span>
            <span>{draft.subcategory_name}</span>
            <span className="flex items-center gap-1 text-slate-500 font-mono">
              <Hash className="w-3 h-3" /> {draft.node_id}
            </span>
          </div>
        </div>
        {savedTemplateId && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Сохранён #{savedTemplateId}
          </span>
        )}
      </div>

      {/* Цена / количество */}
      {(priceKeys.length > 0 || amountKeys.length > 0) && (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {priceKeys.map((k) => (
            <label key={k} className="block">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Цена, ₽</span>
              <input
                type="number"
                step="0.01"
                value={fields[k] ?? ''}
                onChange={(e) => setField(k, e.target.value)}
                className={inputCls}
              />
            </label>
          ))}
          {amountKeys.map((k) => (
            <label key={k} className="block">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Количество</span>
              <input
                type="number"
                value={fields[k] ?? ''}
                onChange={(e) => setField(k, e.target.value)}
                className={inputCls}
              />
            </label>
          ))}
        </div>
      )}

      {/* Описания (textarea) */}
      {descKeys.map((k) => (
        <label key={k} className="block mb-3">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {humanize(k)}
          </span>
          <textarea
            value={fields[k] ?? ''}
            onChange={(e) => setField(k, e.target.value)}
            rows={5}
            className="w-full mt-1 px-2.5 py-2 rounded-lg bg-black/20 border border-white/10 text-xs text-slate-200 outline-none focus:border-brand-cyan/40 resize-y"
          />
        </label>
      ))}

      {/* Остальные поля формы (select — с опциями, input — обычные) */}
      {otherFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {otherFields.map(renderOtherField)}
        </div>
      )}

      {!form && (
        <div className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 mb-3">
          Структура формы категории недоступна — показаны только поля, заполненные ИИ.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {publishLog.length > 0 && (
        <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 mb-3 space-y-1 max-h-40 overflow-y-auto">
          {publishLog.map((line, i) => (
            <div key={i} className="text-[11px] text-slate-300 font-mono">{line}</div>
          ))}
        </div>
      )}

      {/* Действия */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={saveTemplate}
          disabled={saving || publishing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {savedTemplateId ? 'Обновить' : 'Сохранить шаблон'}
        </button>

        <select
          value={accountId ?? ''}
          onChange={(e) => setAccountId(Number(e.target.value) || null)}
          disabled={publishing}
          className="px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-xs text-slate-200 outline-none focus:border-brand-cyan/40 disabled:opacity-50"
        >
          <option value="">Аккаунт…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <button
          onClick={publish}
          disabled={saving || publishing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-xs font-semibold text-brand-cyan hover:bg-brand-cyan/20 transition-all disabled:opacity-50"
        >
          {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
          Опубликовать лот
        </button>
      </div>
    </div>
  );
}
