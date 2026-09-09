import { TemplateDraft, PublishRequest, DeleteRequest } from '../../../types';

/** Элемент ленты чата (UI-модель, в которую разворачиваются сообщения и SSE-события) */
export type ChatItem =
  | { kind: 'text'; id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean }
  | {
      kind: 'tool';
      id: string;
      callId: string;
      name: string;
      args: Record<string, any>;
      result?: any;
      running: boolean;
    }
  | { kind: 'draft'; id: string; draft: TemplateDraft }
  | { kind: 'confirm'; id: string; request: PublishRequest | DeleteRequest };

export interface SSEEvent {
  type: string;
  data?: string;
  call_id?: string;
  name?: string;
  args?: Record<string, any>;
  result?: any;
  draft?: TemplateDraft;
  request?: PublishRequest | DeleteRequest;
  session_id?: number;
  title?: string;
  message?: string;
}

/** Парсит поток SSE из fetch-ответа, вызывает onEvent на каждое событие */
export async function parseSSEStream(
  response: Response,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Стриминг не поддерживается');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            onEvent(JSON.parse(raw));
          } catch {
            // игнорируем битые фрагменты
          }
        }
      }
    }
  }
}
