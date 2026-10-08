import { useState } from 'react';
import { LotEditRequest } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function LotEditCard({ request, token }: { request: LotEditRequest; token: string }) {
  const [status, setStatus] = useState(request.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(request.error || '');
  const decide = async (confirm: boolean) => {
    if (busy || status !== 'pending') return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/v1/chat/lot-edits/${request.message_id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 409) setStatus('failed');
        throw new Error(body.detail || 'Не удалось обработать предложение');
      }
      setStatus(body.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const labels = {
    pending: 'Требуется подтверждение', executing: 'Операция начата — не повторяйте запрос',
    confirmed: 'Изменения сохранены', cancelled: 'Отменено', failed: 'Не выполнено — запросите новое предложение',
  };
  return (
    <div className="max-w-2xl rounded-2xl border border-brand-cyan/20 bg-brand-cyan/5 p-4 space-y-3">
      <div className="text-xs font-semibold text-brand-cyan">Редактирование существующего лота · {labels[status]}</div>
      <div className="text-sm font-bold text-white break-words">{request.lot_name}</div>
      <div className="text-xs text-slate-400">{request.account_name} · Лот #{request.lot_id}</div>
      <div className="space-y-2">
        {request.changes.map((c) => (
          <div key={c.key} className="rounded-lg bg-black/20 p-2 text-xs">
            <div className="text-slate-400">{c.label} <span className="text-slate-600">({c.key})</span></div>
            <div className="grid grid-cols-2 gap-3 mt-1 whitespace-pre-wrap break-words max-h-52 overflow-auto">
              <div className="text-slate-400">Было: {String(c.before) || 'пусто'}</div>
              <div className="text-white">Станет: {String(c.after) || 'пусто'}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Остальные поля сохраняются. price — цена продавца («Вы получите»), без комиссии покупателя.</p>
      {error && <div className="text-xs text-red-400">{error}</div>}
      {status === 'pending' && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => decide(true)} className="px-3 py-2 rounded-lg bg-brand-cyan/15 text-brand-cyan text-xs disabled:opacity-50">
            {busy ? 'Обработка…' : 'Подтвердить изменения'}
          </button>
          <button disabled={busy} onClick={() => decide(false)} className="px-3 py-2 rounded-lg bg-white/5 text-slate-300 text-xs disabled:opacity-50">Отмена</button>
        </div>
      )}
    </div>
  );
}
