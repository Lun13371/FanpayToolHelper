import { useState } from 'react';
import {
  Rocket, Trash2, Loader2, CheckCircle2, AlertCircle, XCircle, Gamepad2, Hash,
} from 'lucide-react';
import { PublishRequest, DeleteRequest, FanpayAccount } from '../../../types';
import { parseSSEStream } from './types';

interface Props {
  request: PublishRequest | DeleteRequest;
  token: string;
  accounts: FanpayAccount[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ConfirmCard({ request, token, accounts }: Props) {
  const isPublish = request.action === 'publish';
  const [accountId, setAccountId] = useState<number | null>(
    accounts.length === 1 ? accounts[0].id : null
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'confirmed' | 'cancelled' | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    if (busy) return;
    setDone('cancelled');
  };

  const confirm = async () => {
    setError(null);
    if (isPublish) {
      if (!accountId) {
        setError('Выберите аккаунт для публикации');
        return;
      }
      setBusy(true);
      setLog([]);
      try {
        const res = await fetch(`${API_URL}/api/v1/lots/templates/creation/publish-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ account_id: accountId, template_ids: [request.template_id] }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Ошибка публикации (${res.status})`);
        }
        await parseSSEStream(res, (ev) => {
          if (ev.type === 'template_start')
            setLog((l) => [...l, `Публикация «${(ev as any).template_name ?? ''}»…`]);
          if (ev.type === 'success') setLog((l) => [...l, `✅ ${ev.message ?? 'Лот опубликован'}`]);
          if (ev.type === 'error') setLog((l) => [...l, `❌ ${ev.message ?? 'Ошибка'}`]);
          if (ev.type === 'sync_start') setLog((l) => [...l, 'Синхронизация кэша лотов…']);
          if (ev.type === 'done')
            setLog((l) => [
              ...l,
              `Готово: успешно ${(ev as any).success_count ?? 0}, ошибок ${(ev as any).failed_count ?? 0}`,
            ]);
        });
        setDone('confirmed');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    } else {
      // delete
      setBusy(true);
      try {
        const res = await fetch(`${API_URL}/api/v1/lots/templates/creation/${request.template_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Ошибка удаления (${res.status})`);
        }
        setDone('confirmed');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
  };

  const borderCls = isPublish
    ? 'border-brand-cyan/20 bg-gradient-to-br from-brand-cyan/[0.06] to-transparent'
    : 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-transparent';

  return (
    <div className={`rounded-2xl border ${borderCls} p-4 max-w-2xl`}>
      {/* Заголовок */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
            isPublish
              ? 'bg-brand-cyan/10 border-brand-cyan/20'
              : 'bg-amber-500/10 border-amber-500/20'
          }`}
        >
          {isPublish ? (
            <Rocket className="w-4 h-4 text-brand-cyan" />
          ) : (
            <Trash2 className="w-4 h-4 text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              isPublish ? 'text-brand-cyan' : 'text-amber-400'
            }`}
          >
            {isPublish ? 'Требуется подтверждение: публикация лота' : 'Требуется подтверждение: удаление шаблона'}
          </div>
          <div className="text-sm font-bold text-white truncate mt-0.5">
            «{request.template_name}»
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Gamepad2 className="w-3 h-3" /> {request.game_name}
            </span>
            <span className="text-slate-600">/</span>
            <span>{request.subcategory_name}</span>
            {'node_id' in request && (
              <span className="flex items-center gap-1 text-slate-500 font-mono">
                <Hash className="w-3 h-3" /> {request.node_id}
              </span>
            )}
          </div>
        </div>
        {done === 'confirmed' && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Выполнено
          </span>
        )}
        {done === 'cancelled' && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 font-semibold shrink-0">
            <XCircle className="w-3 h-3" /> Отменено
          </span>
        )}
      </div>

      {/* Превью полей для публикации */}
      {isPublish && !done && (
        <div className="rounded-lg bg-black/20 border border-white/10 p-2.5 mb-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {request.fields?.price !== undefined && (
              <div className="text-slate-400">
                Цена: <span className="text-white font-semibold">{String(request.fields.price)} ₽</span>
              </div>
            )}
            {request.fields?.amount !== undefined && (
              <div className="text-slate-400">
                Количество: <span className="text-white font-semibold">{String(request.fields.amount)}</span>
              </div>
            )}
          </div>
          {request.fields?.description && (
            <div className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
              {String(request.fields.description).slice(0, 200)}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 mb-3 space-y-1 max-h-40 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i} className="text-[11px] text-slate-300 font-mono">{line}</div>
          ))}
        </div>
      )}

      {/* Действия */}
      {!done && (
        <div className="flex items-center gap-2 flex-wrap">
          {isPublish && (
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(Number(e.target.value) || null)}
              disabled={busy}
              className="px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-xs text-slate-200 outline-none focus:border-brand-cyan/40 disabled:opacity-50"
            >
              <option value="">Аккаунт…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={confirm}
            disabled={busy}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
              isPublish
                ? 'bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/20'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPublish ? (
              <Rocket className="w-3.5 h-3.5" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {isPublish ? 'Подтвердить публикацию' : 'Подтвердить удаление'}
          </button>
          <button
            onClick={cancel}
            disabled={busy}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}
