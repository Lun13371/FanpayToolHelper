import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Plus, Trash2, MessageSquare, Loader2, AlertCircle, Sparkles, FileText,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { ChatModelInfo, ChatSessionInfo, ChatMessageInfo } from '../../types';
import { ChatItem, SSEEvent, parseSSEStream } from './ai-chat/types';
import ModelPicker from './ai-chat/ModelPicker';
import ChatMessages from './ai-chat/ChatMessages';
import ChatInput from './ai-chat/ChatInput';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SUGGESTIONS = [
  'Создай шаблон продажи аккаунтов Brawl Stars за 350₽',
  'Покажи статистику моих аккаунтов и последние продажи',
  'Какие лоты сейчас висят на моих аккаунтах?',
  'Опубликуй шаблон «Brawl Stars аккаунты» — жду подтверждения',
];

let itemSeq = 0;
const nextId = () => `local-${Date.now()}-${itemSeq++}`;

export default function AIChatTab() {
  const { token, accounts } = useAppContext();
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [models, setModels] = useState<ChatModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('chat_model') || ''
  );
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const loadSessions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/sessions`, { headers: authHeaders });
      if (res.ok) setSessions(await res.json());
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadModels = useCallback(async () => {
    if (!token) return;
    setModelsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/models`, { headers: authHeaders });
      if (res.ok) {
        const list: ChatModelInfo[] = await res.json();
        setModels(list);
        // Приоритет: сохранённая → первая с поддержкой tools → первая
        const saved = list.find((m) => m.id === selectedModel);
        if (!saved) {
          const withTools = list.find((m) => m.supports_tools);
          const pick = withTools?.id || list[0]?.id || '';
          if (pick) {
            setSelectedModel(pick);
            localStorage.setItem('chat_model', pick);
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setModelsLoading(false);
    }
  }, [token, selectedModel]);

  useEffect(() => {
    loadSessions();
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  const mapHistory = (msgs: ChatMessageInfo[]): ChatItem[] => {
    const result: ChatItem[] = [];
    for (const m of msgs) {
      if (m.role === 'user') {
        result.push({ kind: 'text', id: `db-${m.id}`, role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        if (m.content) {
          result.push({ kind: 'text', id: `db-${m.id}`, role: 'assistant', content: m.content });
        }
        for (const tc of m.tool_payload?.tool_calls || []) {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            /* ignore */
          }
          result.push({
            kind: 'tool',
            id: `db-${m.id}-${tc.id}`,
            callId: tc.id,
            name: tc.function.name,
            args,
            running: true,
          });
        }
      } else if (m.role === 'tool') {
        const callId = m.tool_payload?.tool_call_id;
        const idx = result.findIndex((i) => i.kind === 'tool' && i.callId === callId);
        let parsed: any = m.content;
        try {
          parsed = JSON.parse(m.content);
        } catch {
          /* ignore */
        }
        if (idx >= 0) {
          const target = result[idx] as Extract<ChatItem, { kind: 'tool' }>;
          result[idx] = { ...target, result: parsed, running: false };
        }
        const draft = m.tool_payload?.ui?.draft;
        if (draft) {
          result.push({ kind: 'draft', id: `db-${m.id}-draft`, draft });
        }
        const request = m.tool_payload?.ui?.request;
        if (request) {
          result.push({ kind: 'confirm', id: `db-${m.id}-confirm`, request: request as any });
        }
      }
    }
    return result;
  };

  const openSession = async (id: number) => {
    if (streaming) return;
    setError(null);
    setActiveSessionId(id);
    setItems([]);
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/sessions/${id}/messages`, { headers: authHeaders });
      if (!res.ok) throw new Error('Не удалось загрузить историю');
      const msgs: ChatMessageInfo[] = await res.json();
      setItems(mapHistory(msgs));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const newChat = () => {
    if (streaming) return;
    setActiveSessionId(null);
    setItems([]);
    setError(null);
  };

  const deleteSession = async (id: number) => {
    if (streaming) return;
    try {
      await fetch(`${API_URL}/api/v1/chat/sessions/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      setSessions((s) => s.filter((x) => x.id !== id));
      if (activeSessionId === id) newChat();
    } catch {
      /* ignore */
    }
  };

  const appendToken = (text: string) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === 'text' && last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...prev, { kind: 'text', id: nextId(), role: 'assistant', content: text, streaming: true }];
    });
  };

  const finishStreaming = () => {
    setItems((prev) =>
      prev.map((i) => (i.kind === 'text' && i.streaming ? { ...i, streaming: false } : i))
    );
  };

  const send = async (message: string) => {
    if (streaming || !token) return;
    setError(null);
    setItems((prev) => [...prev, { kind: 'text', id: nextId(), role: 'user', content: message }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/stream`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session_id: activeSessionId,
          message,
          model: selectedModel || null,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Ошибка сервера (${res.status})`);
      }

      await parseSSEStream(
        res,
        (ev: SSEEvent) => {
          switch (ev.type) {
            case 'session':
              if (!activeSessionId && ev.session_id) {
                setActiveSessionId(ev.session_id);
                loadSessions();
              }
              break;
            case 'token':
              if (ev.data) appendToken(ev.data);
              break;
            case 'tool_call':
              setItems((prev) => [
                ...prev,
                {
                  kind: 'tool',
                  id: nextId(),
                  callId: ev.call_id || nextId(),
                  name: ev.name || '',
                  args: ev.args || {},
                  running: true,
                },
              ]);
              break;
            case 'tool_result':
              setItems((prev) =>
                prev.map((i) =>
                  i.kind === 'tool' && i.callId === ev.call_id
                    ? { ...i, result: ev.result, running: false }
                    : i
                )
              );
              break;
            case 'template_draft':
              if (ev.draft) {
                setItems((prev) => [...prev, { kind: 'draft', id: nextId(), draft: ev.draft! }]);
              }
              break;
            case 'publish_request':
            case 'delete_request':
              if (ev.request) {
                setItems((prev) => [
                  ...prev,
                  { kind: 'confirm', id: nextId(), request: ev.request as any },
                ]);
              }
              break;
            case 'error':
              setError(ev.message || 'Неизвестная ошибка');
              break;
            default:
              break;
          }
        },
        controller.signal
      );
      loadSessions();
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      finishStreaming();
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid lg:grid-cols-[250px_1fr] gap-4 h-[calc(100vh-190px)] min-h-[520px]"
    >
      {/* Сайдбар сессий */}
      <aside className="hidden lg:flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="p-3 border-b border-white/5">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-xs font-semibold text-brand-cyan hover:bg-brand-cyan/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Новый чат
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <div className="text-[11px] text-slate-600 text-center px-3 py-6">
              История чатов появится здесь
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                s.id === activeSessionId
                  ? 'bg-white/10 border border-white/10'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
              onClick={() => openSession(s.id)}
            >
              <MessageSquare
                className={`w-3.5 h-3.5 shrink-0 ${s.id === activeSessionId ? 'text-brand-cyan' : 'text-slate-500'}`}
              />
              <span className="flex-1 text-[11px] text-slate-300 truncate">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
                title="Удалить чат"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Основная область чата */}
      <section className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <div className="w-8 h-8 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-brand-cyan" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {activeSession?.title || 'Новый чат'}
            </div>
            <div className="text-[10px] text-slate-500">
              {streaming ? 'Ассистент печатает…' : 'AI-ассистент Funpay Helper'}
            </div>
          </div>
          <ModelPicker
            models={models}
            value={selectedModel}
            loading={modelsLoading}
            onChange={(id) => {
              setSelectedModel(id);
              localStorage.setItem('chat_model', id);
            }}
          />
          <button
            onClick={newChat}
            disabled={streaming}
            className="lg:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-xs font-semibold text-brand-cyan"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Лента сообщений */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-6">
              <div className="w-14 h-14 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-brand-cyan" />
              </div>
              <div>
                <div className="text-base font-bold text-white">Чем помочь?</div>
                <div className="text-xs text-slate-500 mt-1 max-w-md">
                  Я могу найти категорию на Funpay, подготовить полный шаблон публикации лота
                  с описанием и ценой — вам останется нажать одну кнопку.
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 hover:border-brand-cyan/30 hover:text-white transition-all text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ChatMessages items={items} accounts={accounts} token={token || ''} />
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Ошибка */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}

        {/* Ввод */}
        <div className="px-4 pb-4">
          <ChatInput onSend={send} onStop={stop} streaming={streaming} />
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-slate-600">
              Enter — отправить, Shift+Enter — новая строка
            </span>
            {streaming && (
              <span className="flex items-center gap-1 text-[10px] text-brand-cyan">
                <Loader2 className="w-3 h-3 animate-spin" /> генерация…
              </span>
            )}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
