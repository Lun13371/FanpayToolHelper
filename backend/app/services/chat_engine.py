"""
Agent-луп AI-чата: стриминг ответа LLM + исполнение тулов (function calling).

Схема работы:
  1. Загружаем историю сессии из БД → сообщения OpenAI-формата
  2. Цикл (до MAX_TOOL_ROUNDS):
     - вызов gateway_completion(stream=True, tools=OPEN_TOOLS)
     - стримим текстовые токены через emit({"type": "token", ...})
     - если модель запросила тулы → исполняем, отправляем результаты модели
     - если тулов нет → выходим из цикла
  3. Все сообщения (user / assistant / tool) сохраняются в chat_messages
"""
import json
import logging
from typing import Any, AsyncIterator, Callable, Dict, List, Optional

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.chat import ChatSession, ChatMessage
from app.services import llm_client
from app.services import chat_tools

logger = logging.getLogger("fanpay.chat_engine")

MAX_TOOL_ROUNDS = 8
MAX_HISTORY_MESSAGES = 60

SYSTEM_PROMPT = """Ты — встроенный AI-ассистент панели Fanpay Helper для продавцов Funpay.
Общайся на языке пользователя (по умолчанию — русский). Отвечай кратко и по делу.

Твои главные возможности — работа с шаблонами публикации лотов Funpay:

ТИПЧИНЫЙ СЦЕНАРИЙ СОЗДАНИЯ ШАБЛОНА:
1. Пользователь просит создать шаблон лота (например: «сделай шаблон продажи аккаунтов Brawl Stars»).
2. Вызови search_categories("Brawl Stars") — получи node_id и точные названия игры/подкатегории.
   Если результатов несколько — уточни у пользователя или выбери наиболее подходящий, объяснив выбор.
3. Вызови get_category_form_fields(node_id) — узнай точные ключи полей формы.
   Обязательно заполни: description — продающее описание лота, price — адекватная цена в рублях,
   amount — количество, а также КАЖДОЕ оставшееся поле формы.
   Для select-полей (версия/регион/сервер, например «версия для EU») значение бери
   РОВНО из options этого поля (атрибут value).
4. Вызови propose_lot_template(...) — пользователю покажется интерактивная карточка черновика
   со ВСЕМИ полями формы категории (карточка сама подгрузит структуру формы),
   где он сам отредактирует поля и решит: сохранить шаблон или сразу опубликовать лот.
5. Кратко подытожь, что ты подготовил и что можно нажать.

ПРАВИЛА:
- НИКОГДА не выдумывай node_id — только из результатов search_categories.
- Перед propose_lot_template ВСЕГДА вызывай get_category_form_fields, чтобы использовать
  реальные ключи полей этой категории.
- Заполняй ВСЕ поля формы, которые вернул get_category_form_fields, включая select-поля —
  не пропускай поля версий/регионов/серверов (EU, Global и т.п.).
- Если пользователь не указал параметр (например, версию для EU) — выбери наиболее
  популярное значение из options и упомяни это в ответе.
- Описание лота (description) пиши продающее: заголовок, выгоды, гарантии, призыв к действию.

ПОДТВЕРЖДЕНИЯ (ВАЖНО):
- Публикация лота и удаление шаблона выполняются ТОЛЬКО через карточки подтверждения:
  propose_publish_lot(template_id) / propose_delete_template(template_id).
- Ты не публикуешь и не удаляешь ничего сам — пользователь видит карточку и сам жмёт
  «Подтвердить» или «Отмена». После вызова скажи, что ждёшь подтверждения.
- Если пользователь просит «опубликуй шаблон X» — найди его через list_lot_templates
  и вызови propose_publish_lot.

АНАЛИТИКА И ДАННЫЕ АККАУНТОВ:
- «Покажи аккаунты / статы / как дела» → list_accounts → get_account_overview(account_id).
- «Какие лоты у меня висят» → list_account_lots(account_id); детали лота → get_lot_details.
- «Отзывы / репутация» → get_account_reviews(account_id).
- «Продажи / выручка / аналитика» → get_sales_stats(account_id).
- «Что на складе» → list_warehouse_items(account_id).
- Данные берутся из кэшей панели: если кэш пуст — честно скажи пользователю,
  какую вкладку открыть, чтобы обновить данные, и предложи спросить снова после.
- Анализируя статистику, давай полезные выводы: тренды, топ-лоты, что поднять/опустить,
  где вернуть деньги (возвраты), советы по описаниям.

РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩИХ ЛОТОВ:
- Ты МОЖЕШЬ менять существующие лоты через propose_update_lot(account_id, lot_id, changes).
- Найди аккаунт и нужные лоты через list_accounts/list_account_lots, затем get_lot_details.
- В changes передавай ТОЛЬКО запрошенные изменения с точными ключами из form_fields.
  Например {"price": 80}; не присылай всю форму, не меняй описание/остаток/активность без просьбы.
- Для группы лотов вызови propose_update_lot для каждого; не создавай вместо них новые шаблоны.
- price — «Вы получите» (цена продавца). Цена покупателя с комиссией может отличаться:
  если пользователь явно хочет цену покупателя, уточни расчёт, не приравнивай её к price.
- После предложения говори «подготовлено, ждёт подтверждения», а НЕ «цены изменены».
- Если тул вернул ошибку, НЕ повторяй тот же вызов с теми же аргументами.
  Объясни причину. Если недоступна форма/авторизация аккаунта — останови пакет,
  не перебирай все лоты и не создавай шаблоны в обход ошибки.

ПРОЧЕЕ:
- Пользователь может также попросить: показать шаблоны (list_lot_templates).
- Форматируй ответы в Markdown: заголовки, **жирный**, списки, а статистику — таблицами
  (| Аккаунт | Баланс | Рейтинг |). Таблицы и списки читаются лучше простыни текста.
- Обычные вопросы (не про лоты и аккаунты) отвечай обычным текстом без тулов.
"""


def _sse(emit: Callable[[dict], Any], event: dict) -> None:
    emit(event)


async def load_history(db: AsyncSession, session_id: int) -> List[dict]:
    """Загружает историю сессии и восстанавливает сообщения OpenAI-формата."""
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.asc())
    )
    rows = res.scalars().all()
    # Ограничиваем контекст последними N сообщениями
    rows = rows[-MAX_HISTORY_MESSAGES:]
    # Обрезка могла разорвать пару assistant(tool_calls)+tool — не начинаем историю с tool-сообщений
    while rows and rows[0].role == "tool":
        rows = rows[1:]

    messages: List[dict] = []
    for row in rows:
        if row.role == "user":
            messages.append({"role": "user", "content": row.content})
        elif row.role == "assistant":
            msg: Dict[str, Any] = {"role": "assistant", "content": row.content or ""}
            payload = row.tool_payload or {}
            if payload.get("tool_calls"):
                msg["tool_calls"] = payload["tool_calls"]
            messages.append(msg)
        elif row.role == "tool":
            payload = row.tool_payload or {}
            messages.append({
                "role": "tool",
                "tool_call_id": payload.get("tool_call_id", ""),
                "content": row.content or "",
            })
    return messages


async def save_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    tool_name: Optional[str] = None,
    tool_payload: Optional[dict] = None,
) -> ChatMessage:
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content or "",
        tool_name=tool_name,
        tool_payload=tool_payload,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


def _accumulate_tool_calls(
    acc: Dict[int, dict],
    deltas: List[Any],
) -> None:
    """Аккумулирует фрагменты tool_calls из streaming-чанков по index."""
    for tc in deltas or []:
        idx = tc.index if tc.index is not None else 0
        slot = acc.setdefault(idx, {
            "id": tc.id or "",
            "type": "function",
            "function": {"name": "", "arguments": ""},
        })
        if tc.id:
            slot["id"] = tc.id
        fn = getattr(tc, "function", None)
        if fn is not None:
            if fn.name:
                slot["function"]["name"] += fn.name
            if fn.arguments:
                slot["function"]["arguments"] += fn.arguments


async def _stream_llm(
    db: AsyncSession,
    model: str,
    messages: List[dict],
    emit: Callable[[dict], Any],
    use_tools: bool,
) -> tuple[str, List[dict]]:
    """
    Один стриминговый вызов LLM. Возвращает (текст, tool_calls).
    Ретрай с другим ключом при ошибке — 1 раз.
    """
    last_err: Optional[Exception] = None
    for attempt in range(2):
        key = await llm_client._pick_key(db)
        if not key:
            raise RuntimeError("Нет активных ключей ИИ — добавьте ключи sk-syntee-... во вкладке «Глобальные ключи»")
        try:
            kwargs: Dict[str, Any] = {"stream": True}
            if use_tools:
                kwargs["tools"] = chat_tools.OPEN_TOOLS
                kwargs["tool_choice"] = "auto"
            stream = await llm_client.gateway_completion(
                db,
                model=model,
                messages=messages,
                api_key=key.key_value,
                **kwargs,
            )
            text = ""
            acc: Dict[int, dict] = {}
            async for chunk in stream:
                choices = getattr(chunk, "choices", None)
                if not choices:
                    continue
                delta = choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    text += content
                    emit({"type": "token", "data": content})
                tc_deltas = getattr(delta, "tool_calls", None)
                if tc_deltas:
                    _accumulate_tool_calls(acc, tc_deltas)
            tool_calls = [acc[i] for i in sorted(acc.keys())]
            return text, tool_calls
        except Exception as e:
            last_err = e
            logger.warning(f"Ошибка LLM-вызова (попытка {attempt + 1}): {e}")
            # при следующей итерации _pick_key вернёт другой ключ (last_used_at обновится при ошибке — просто ждём)
            await _touch_key(db, key)
    raise RuntimeError(f"LLM не ответил после повторных попыток: {last_err}")


async def _touch_key(db: AsyncSession, key) -> None:
    """Обновляет last_used_at ключа, чтобы следующий _pick_key взял другой."""
    try:
        from datetime import datetime
        key.last_used_at = datetime.utcnow()
        db.add(key)
        await db.commit()
    except Exception:
        pass


async def run_chat_turn(
    db: AsyncSession,
    user: User,
    session: ChatSession,
    user_message: str,
    model: Optional[str],
    emit: Callable[[dict], Any],
) -> str:
    """
    Полный ход диалога: user_message уже сохранён в БД вызывающим кодом.
    Возвращает финальный текст ассистента.
    """
    # Определяем модель
    if not model:
        candidates = await llm_client.resolve_chat_models(db, "text")
        model = candidates[0] if candidates else "gpt-4o-mini"
    session.model = model

    messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += await load_history(db, session.id)

    final_text = ""
    failed_calls: Dict[str, dict] = {}
    stop_repeated_tools = False
    for round_no in range(MAX_TOOL_ROUNDS):
        text, tool_calls = await _stream_llm(
            db, model, messages, emit, use_tools=not stop_repeated_tools
        )

        if not tool_calls:
            final_text = text
            if text:
                await save_message(db, session.id, "assistant", text)
            break

        # Сохраняем assistant-сообщение с tool_calls
        await save_message(
            db, session.id, "assistant", text,
            tool_payload={"tool_calls": tool_calls},
        )
        messages.append({
            "role": "assistant",
            "content": text or "",
            "tool_calls": tool_calls,
        })

        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            raw_args = fn.get("arguments", "") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
            except json.JSONDecodeError:
                args = {}
            call_id = tc.get("id") or f"call_{round_no}_{name}"

            emit({"type": "tool_call", "call_id": call_id, "name": name, "args": args})

            signature = name + ":" + json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
            if signature in failed_calls:
                result = {
                    "error": "Повтор одинакового неудачного вызова остановлен. Объясни пользователю причину ошибки; изменения не выполнены.",
                    "previous_error": failed_calls[signature].get("error"),
                }
                ui_event = None
                stop_repeated_tools = True
            else:
                result, ui_event = await chat_tools.execute_tool(db, user, name, args)
                if "error" in result:
                    failed_calls[signature] = result

            emit({"type": "tool_result", "call_id": call_id, "name": name, "result": result})
            result_json = json.dumps(result, ensure_ascii=False, default=str)
            # Сохраняем предложение до отправки карточки клиенту.
            saved_tool = await save_message(
                db, session.id, "tool", result_json,
                tool_name=name,
                tool_payload={
                    "tool_call_id": call_id,
                    "args": args,
                    # UI-данные (черновик шаблона) — фронтенд рендерит карточку при загрузке истории
                    **({"ui": ui_event} if ui_event else {}),
                },
            )
            if ui_event:
                if ui_event.get("type") == "update_lot_request":
                    ui_event["request"]["message_id"] = saved_tool.id
                    saved_tool.tool_payload = {**saved_tool.tool_payload, "ui": ui_event}
                    db.add(saved_tool)
                    await db.commit()
                emit(ui_event)
            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": result_json,
            })

        # следующий раунд: модель увидит результаты тулов
    else:
        # Исчерпали лимит раундов — просим модель подытожить без тулов
        text, _ = await _stream_llm(db, model, messages, emit, use_tools=False)
        final_text = text
        if text:
            await save_message(db, session.id, "assistant", text)

    # Обновляем время сессии
    from datetime import datetime
    session.updated_at = datetime.utcnow()
    db.add(session)
    await db.commit()

    return final_text
