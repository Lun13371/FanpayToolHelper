"""
Реестр тулов (function calling) для AI-чата.

Read-тулы исполняются автоматически в цикле агента:
  - search_categories        — поиск категорий/игр Funpay в локальной БД
  - get_category_form_fields — структура формы создания лота (парсинг Funpay)
  - list_lot_templates       — список шаблонов публикации
  - list_accounts            — верифицированные аккаунты (для публикации)

Write-тул:
  - propose_lot_template     — НЕ пишет в БД: возвращает черновик, который
                               фронтенд рендерит как интерактивную карточку
                               (сохранение/публикация — через существующие
                               REST-эндпоинты /lots/templates/creation*)
  - delete_lot_template      — удаляет шаблон (с проверкой владельца)
"""
import json
import time
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.models.account import FanpayAccount
from app.models.lot_template import LotCreationTemplate
from app.models.global_category import FunpayGlobalCategory

logger = logging.getLogger("fanpay.chat_tools")

# ---------------------------------------------------------------------------
# OpenAI-схемы тулов (передаются в tools= при вызове LLM)
# ---------------------------------------------------------------------------

OPEN_TOOLS: List[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_categories",
            "description": (
                "Поиск категорий (игр и подкатегорий) Funpay по названию. "
                "Используй ПЕРВЫМ, когда пользователь хочет создать шаблон лота: "
                "найди подходящие node_id и точные названия игры/подкатегории."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Поисковый запрос: название игры или подкатегории (например 'Brawl Stars' или 'аккаунты')",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_form_fields",
            "description": (
                "Получить структуру формы создания лота для конкретной категории (node_id): "
                "ВСЕ поля (input/select/textarea) и опции выпадающих списков. "
                "Вызывай ПЕРЕД созданием черновика шаблона, чтобы заполнить fields корректными ключами и значениями."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "description": "ID категории на Funpay (из search_categories)"},
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_lot_template",
            "description": (
                "Создать ЧЕРНОВИК шаблона публикации лота и показать его пользователю в виде интерактивной карточки "
                "со ВСЕМИ полями формы категории. НЕ сохраняет в БД — пользователь сам нажмёт «Сохранить» или «Опубликовать». "
                "Перед вызовом обязательно узнай структуру полей через get_category_form_fields и заполни КАЖДОЕ поле формы, "
                "включая select-поля (версия/регион/сервер, например EU) — значение бери из options этого поля."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Название шаблона"},
                    "node_id": {"type": "string", "description": "ID категории на Funpay"},
                    "game_name": {"type": "string", "description": "Название игры"},
                    "subcategory_name": {"type": "string", "description": "Название подкатегории"},
                    "fields": {
                        "type": "object",
                        "description": (
                            "Значения ВСЕХ полей формы создания лота (ключ → значение). "
                            "Для select-полей значение должно быть РОВНО одним из options (value). "
                            "Обязательно заполни description, price, amount и все остальные поля формы."
                        ),
                    },
                },
                "required": ["name", "node_id", "game_name", "subcategory_name", "fields"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_lot_templates",
            "description": "Список всех шаблонов публикации лотов пользователя (id, название, игра, подкатегория, поля).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_publish_lot",
            "description": (
                "Предложить публикацию лота на Funpay по существующему шаблону. "
                "НЕ публикует сразу: пользователю показывается карточка подтверждения, "
                "и лот будет опубликован только после того, как он сам нажмёт «Подтвердить». "
                "ID шаблона узнай через list_lot_templates."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "template_id": {"type": "integer", "description": "ID шаблона публикации (из list_lot_templates)"},
                },
                "required": ["template_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_delete_template",
            "description": (
                "Предложить удаление шаблона публикации. НЕ удаляет сразу: "
                "пользователь увидит карточку подтверждения и сам решит — удалить или отменить."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "template_id": {"type": "integer", "description": "ID шаблона (из list_lot_templates)"},
                },
                "required": ["template_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_accounts",
            "description": "Список аккаунтов Funpay пользователя (id, название, баланс, рейтинг, отзывы, кол-во лотов).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_account_overview",
            "description": (
                "Общая статистика аккаунта Funpay: баланс, рейтинг, отзывы, количество активных лотов, "
                "сводка продаж (выручка, средний чек, тренд), топ лотов. Используй, когда пользователь "
                "спрашивает «как дела у аккаунта», «покажи статы» и т.п."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "ID аккаунта (из list_accounts). Если не указан — берётся первый"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_account_lots",
            "description": "Список активных лотов аккаунта на Funpay (ID, название, цена, количество, игра/категория) — из кэша последней синхронизации.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "ID аккаунта. Если не указан — берётся первый"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lot_details",
            "description": "Подробности конкретного лота на Funpay (все поля формы, цена, количество, активность). Загружается вживую со страницы редактирования лота.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lot_id": {"type": "string", "description": "ID лота на Funpay (из list_account_lots)"},
                    "account_id": {"type": "integer", "description": "ID аккаунта, на котором размещён лот"},
                },
                "required": ["lot_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_account_reviews",
            "description": "Отзывы покупателей аккаунта с Funpay (оценка, текст, теги) — из кэша. Полезно для анализа репутации.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "ID аккаунта. Если не указан — берётся первый"},
                    "limit": {"type": "integer", "description": "Максимум отзывов (по умолчанию 15)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sales_stats",
            "description": (
                "Финансовая статистика продаж аккаунта: выручка, кол-во продаж, средний чек, сплит по играм/категориям, "
                "возвраты, топ покупателей, прогноз. Из кэша аналитики (обновляется во вкладке «Аналитика»)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "ID аккаунта. Если не указан — берётся первый"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_warehouse_items",
            "description": "Товары на складе автодоставки (ключи/ссылки): название лота, многоразовый/одноразовый, продан/свободен.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "integer", "description": "ID аккаунта. Если не указан — склад первого аккаунта"},
                },
            },
        },
    },
]


def get_owner_id(user: User) -> int:
    """ID владельца организации (общие шаблоны/аккаунты для менеджеров)."""
    if user.role == UserRole.MANAGER and user.parent_id:
        return user.parent_id
    return user.id


# ---------------------------------------------------------------------------
# Кэш структур форм (чтобы не скрейпить Funpay повторно в одном диалоге)
# ---------------------------------------------------------------------------

_FORM_CACHE_TTL = 600.0
_form_cache: Dict[str, Dict[str, Any]] = {}

# Скрытые/системные поля формы FunPay: их нельзя сохранять в шаблон —
# при публикации они перезапишут свежие значения (csrf_token, form_created_at)
# и FunPay вернёт 400
_SYSTEM_FORM_KEYS = {
    "csrf_token",
    "form_created_at",
    "offer_id",
    "node_id",
    "location",
    "deleted",
}


def invalidate_form_cache() -> None:
    _form_cache.clear()


async def _fetch_form_fields(db: AsyncSession, owner_id: int, node_id: str) -> Optional[dict]:
    """Загрузка структуры формы создания лота с Funpay (с кэшем 10 минут)."""
    cached = _form_cache.get(node_id)
    if cached and (time.monotonic() - cached["ts"]) < _FORM_CACHE_TTL:
        return cached["data"]

    query = select(FanpayAccount).where(
        FanpayAccount.user_id == owner_id,
        FanpayAccount.cookies != None,  # noqa: E711
    )
    res = await db.execute(query)
    account = res.scalars().first()
    if not account:
        return None

    from app.services.fanpay_client import FanpayClient
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    details = await client.get_creation_form_details(node_id)
    if not details:
        return None

    _form_cache[node_id] = {"ts": time.monotonic(), "data": details}
    return details


# ---------------------------------------------------------------------------
# Реализации тулов
# ---------------------------------------------------------------------------

async def _tool_search_categories(db: AsyncSession, args: dict) -> dict:
    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "Пустой запрос"}
    like = f"%{query}%"
    stmt = (
        select(FunpayGlobalCategory)
        .where(
            (FunpayGlobalCategory.game_name.ilike(like))  # type: ignore[union-attr]
            | (FunpayGlobalCategory.subcategory_name.ilike(like))  # type: ignore[union-attr]
        )
        .limit(25)
    )
    res = await db.execute(stmt)
    cats = res.scalars().all()
    if not cats:
        return {"results": [], "message": "Ничего не найдено. Попробуй другое название игры."}
    return {
        "results": [
            {
                "node_id": c.node_id,
                "game_name": c.game_name,
                "subcategory_name": c.subcategory_name,
                "category_type": c.category_type,
            }
            for c in cats
        ]
    }


async def _tool_get_category_form_fields(db: AsyncSession, owner_id: int, args: dict) -> dict:
    node_id = str(args.get("node_id") or "").strip()
    if not node_id:
        return {"error": "Не указан node_id"}
    details = await _fetch_form_fields(db, owner_id, node_id)
    if details is None:
        return {
            "error": (
                "Не удалось загрузить структуру полей: нужен хотя бы один верифицированный аккаунт "
                "в менеджере (с активными cookies)."
            )
        }
    # Ограничиваем объём, чтобы не раздувать контекст
    options = details.get("options") or {}
    trimmed_options = {
        k: (v[:60] if isinstance(v, list) else v) for k, v in options.items()
    }
    return {
        "node_id": node_id,
        "form_action": details.get("form_action"),
        "fields": details.get("fields", {}),
        "options": trimmed_options,
    }


async def _tool_propose_lot_template(
    db: AsyncSession, owner_id: int, args: dict
) -> Tuple[dict, Optional[dict]]:
    """Возвращает (результат_для_модели, ui_event_для_фронта)."""
    draft = {
        "name": str(args.get("name") or "Новый шаблон"),
        "node_id": str(args.get("node_id") or ""),
        "game_name": str(args.get("game_name") or ""),
        "subcategory_name": str(args.get("subcategory_name") or ""),
        "fields": args.get("fields") or {},
    }
    if not draft["node_id"]:
        return ({"error": "Не указан node_id — сначала найди категорию через search_categories"}, None)

    # Прикладываем ПОЛНУЮ структуру формы (все поля + опции select-полей),
    # чтобы фронтенд отрендерил каждое поле категории, даже не заполненное моделью
    form_meta: Optional[dict] = None
    details = await _fetch_form_fields(db, owner_id, draft["node_id"])
    if details:
        form_meta = {
            "fields": details.get("fields", {}),
            "options": details.get("options", {}) or {},
        }
    draft["form"] = form_meta

    # Объединяем: значения модели + дефолты формы (для полей, которые модель не заполнила).
    # Системные hidden-поля (csrf_token, form_created_at и т.п.) исключаем —
    # иначе они сохранятся в шаблон устаревшими и сломают публикацию (400 от FunPay)
    if form_meta:
        merged = {
            k: v for k, v in form_meta["fields"].items()
            if k not in _SYSTEM_FORM_KEYS
        }
        merged.update({
            k: v for k, v in draft["fields"].items()
            if v not in (None, "") and k not in _SYSTEM_FORM_KEYS
        })
        draft["fields"] = merged

    result = {
        "status": "draft_created",
        "message": (
            "Черновик шаблона показан пользователю в виде интерактивной карточки "
            "со ВСЕМИ полями формы категории (включая select-поля). "
            "Он сам решит: сохранить шаблон или сразу опубликовать лот. "
            "Кратко опиши пользователю, что ты подготовил."
        ),
        "draft": draft,
    }
    ui_event = {"type": "template_draft", "draft": draft}
    return (result, ui_event)


async def _tool_list_lot_templates(db: AsyncSession, owner_id: int) -> dict:
    res = await db.execute(
        select(LotCreationTemplate).where(LotCreationTemplate.user_id == owner_id).order_by(LotCreationTemplate.id.desc())
    )
    templates = res.scalars().all()
    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "node_id": t.node_id,
                "game_name": t.game_name,
                "subcategory_name": t.subcategory_name,
                "fields": t.fields,
            }
            for t in templates
        ]
    }


async def _tool_propose_publish_lot(db: AsyncSession, owner_id: int, args: dict) -> Tuple[dict, Optional[dict]]:
    """Предложение публикации: карточка подтверждения, публикация — только после клика юзера."""
    template_id = args.get("template_id")
    try:
        template_id = int(template_id)
    except (TypeError, ValueError):
        return ({"error": "Некорректный template_id"}, None)
    tpl = await db.get(LotCreationTemplate, template_id)
    if not tpl or tpl.user_id != owner_id:
        return ({"error": f"Шаблон {template_id} не найден"}, None)

    request = {
        "action": "publish",
        "template_id": tpl.id,
        "template_name": tpl.name,
        "game_name": tpl.game_name,
        "subcategory_name": tpl.subcategory_name,
        "node_id": tpl.node_id,
        "fields": tpl.fields,
    }
    result = {
        "status": "confirmation_required",
        "message": (
            "Пользователю показана карточка подтверждения публикации. "
            "Лот будет опубликован только после того, как он нажмёт «Подтвердить» "
            "(он также выберет аккаунт). Кратко скажи, что ждёшь подтверждения."
        ),
    }
    ui_event = {"type": "publish_request", "request": request}
    return (result, ui_event)


async def _tool_propose_delete_template(db: AsyncSession, owner_id: int, args: dict) -> Tuple[dict, Optional[dict]]:
    """Предложение удаления шаблона: карточка подтверждения."""
    template_id = args.get("template_id")
    try:
        template_id = int(template_id)
    except (TypeError, ValueError):
        return ({"error": "Некорректный template_id"}, None)
    tpl = await db.get(LotCreationTemplate, template_id)
    if not tpl or tpl.user_id != owner_id:
        return ({"error": f"Шаблон {template_id} не найден"}, None)

    request = {
        "action": "delete",
        "template_id": tpl.id,
        "template_name": tpl.name,
        "game_name": tpl.game_name,
        "subcategory_name": tpl.subcategory_name,
    }
    result = {
        "status": "confirmation_required",
        "message": (
            "Пользователю показана карточка подтверждения удаления. "
            "Шаблон будет удалён только после нажатия «Подтвердить»."
        ),
    }
    ui_event = {"type": "delete_request", "request": request}
    return (result, ui_event)


async def _get_account(db: AsyncSession, owner_id: int, account_id: Optional[int]) -> Optional[FanpayAccount]:
    """Аккаунт по ID (с проверкой владельца) или первый верифицированный аккаунт."""
    if account_id:
        account = await db.get(FanpayAccount, int(account_id))
        if account and account.user_id == owner_id:
            return account
        return None
    res = await db.execute(
        select(FanpayAccount).where(FanpayAccount.user_id == owner_id).order_by(FanpayAccount.id.asc())
    )
    return res.scalars().first()


async def _tool_list_accounts(db: AsyncSession, owner_id: int) -> dict:
    res = await db.execute(
        select(FanpayAccount).where(FanpayAccount.user_id == owner_id).order_by(FanpayAccount.id.asc())
    )
    accounts = res.scalars().all()
    return {
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "is_active": a.is_active,
                "balance": a.balance,
                "rating": a.rating,
                "reviews_count": a.reviews_count,
                "active_lots": len(a.lots_cache) if a.lots_cache else 0,
                "last_synced": a.last_synced.isoformat() if a.last_synced else None,
            }
            for a in accounts
        ]
    }


async def _tool_get_account_overview(db: AsyncSession, owner_id: int, args: dict) -> dict:
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account:
        return {"error": "Аккаунт не найден. Узнай ID через list_accounts."}
    overview: Dict[str, Any] = {
        "id": account.id,
        "name": account.name,
        "is_active": account.is_active,
        "balance": account.balance,
        "rating": account.rating,
        "reviews_count": account.reviews_count,
        "active_lots_count": len(account.lots_cache) if account.lots_cache else 0,
        "last_synced": account.last_synced.isoformat() if account.last_synced else None,
    }
    stats = account.sales_stats_cache or {}
    if stats:
        overview["sales_summary"] = {
            "revenue_total": stats.get("revenue_total"),
            "completed_count": stats.get("completed_count"),
            "average_ticket": stats.get("average_ticket"),
            "top_lots": stats.get("top_lots", [])[:5],
            "trend": stats.get("forecasting_stats", {}).get("trend_direction"),
            "projected_revenue": stats.get("forecasting_stats", {}).get("projected_revenue"),
        }
    else:
        overview["sales_summary"] = None
        overview["hint"] = "Открой вкладку «Аналитика» аккаунта, чтобы обновить кэш статистики продаж."
    return overview


async def _tool_list_account_lots(db: AsyncSession, owner_id: int, args: dict) -> dict:
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account:
        return {"error": "Аккаунт не найден. Узнай ID через list_accounts."}
    lots = account.lots_cache or []
    if not lots:
        return {
            "lots": [],
            "message": "Кэш лотов пуст — синхронизируй аккаунт в менеджере (или лотов действительно нет).",
        }
    return {
        "account_id": account.id,
        "lots": [
            {
                "lot_id": l.get("id") or l.get("lot_id"),
                "name": l.get("name") or l.get("lot_name"),
                "price": l.get("price"),
                "amount": l.get("amount"),
                "game": l.get("game") or l.get("game_name"),
                "category": l.get("category") or l.get("category_name"),
            }
            for l in lots
        ],
    }


async def _tool_get_lot_details(db: AsyncSession, owner_id: int, args: dict) -> dict:
    lot_id = str(args.get("lot_id") or "").strip()
    if not lot_id:
        return {"error": "Не указан lot_id"}
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account or not account.cookies:
        return {"error": "Нужен верифицированный аккаунт (с cookies) для загрузки деталей лота."}
    from app.services.fanpay_client import FanpayClient
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    details = await client.get_lot_details(lot_id)
    if not details:
        return {"error": f"Не удалось загрузить детали лота {lot_id}"}
    # Поля формы могут быть большими — отдаём как есть, но опции селектов подрезаем
    options = details.get("options") or {}
    details["options"] = {k: (v[:60] if isinstance(v, list) else v) for k, v in options.items()}
    return details


async def _tool_get_account_reviews(db: AsyncSession, owner_id: int, args: dict) -> dict:
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account:
        return {"error": "Аккаунт не найден. Узнай ID через list_accounts."}
    reviews = account.reviews_cache or []
    if not reviews:
        return {"reviews": [], "message": "Кэш отзывов пуст — открой вкладку отзывов аккаунта, чтобы обновить."}
    try:
        limit = int(args.get("limit") or 15)
    except (TypeError, ValueError):
        limit = 15
    return {
        "account_id": account.id,
        "total_cached": len(reviews),
        "reviews": [
            {
                "buyer": r.get("buyer"),
                "rating": r.get("rating"),
                "text": (r.get("text") or "")[:300],
                "date": r.get("date"),
                "tags": r.get("tags", []),
            }
            for r in reviews[:limit]
        ],
    }


async def _tool_get_sales_stats(db: AsyncSession, owner_id: int, args: dict) -> dict:
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account:
        return {"error": "Аккаунт не найден. Узнай ID через list_accounts."}
    stats = account.sales_stats_cache
    if not stats:
        return {
            "error": "Кэш аналитики пуст — открой вкладку «Аналитика» этого аккаунта, чтобы собрать статистику, затем спроси снова."
        }
    # Компактная выжимка для контекста модели
    return {
        "account_id": account.id,
        "revenue_total": stats.get("revenue_total"),
        "completed_count": stats.get("completed_count"),
        "average_ticket": stats.get("average_ticket"),
        "top_lots": stats.get("top_lots", [])[:10],
        "game_split": stats.get("game_split", {}),
        "category_split": stats.get("category_split", {}),
        "refund_stats": stats.get("refund_stats", {}),
        "loyalty_stats": stats.get("loyalty_stats", {}),
        "forecasting": stats.get("forecasting_stats", {}),
        "daily_sales_last7": stats.get("daily_sales", [])[-7:],
    }


async def _tool_list_warehouse_items(db: AsyncSession, owner_id: int, args: dict) -> dict:
    account = await _get_account(db, owner_id, args.get("account_id"))
    if not account:
        return {"error": "Аккаунт не найден. Узнай ID через list_accounts."}
    from app.models.delivery import AutoDeliveryItem
    res = await db.execute(
        select(AutoDeliveryItem)
        .where(AutoDeliveryItem.account_id == account.id)
        .order_by(AutoDeliveryItem.id.desc())
        .limit(50)
    )
    items = res.scalars().all()
    return {
        "account_id": account.id,
        "total": len(items),
        "items": [
            {
                "id": i.id,
                "lot_name": i.lot_name,
                "category_id": i.category_id,
                "is_multi_use": i.is_multi_use,
                "is_sold": i.is_sold,
                "content_preview": (i.content[:60] + "…") if len(i.content) > 60 else i.content,
            }
            for i in items
        ],
    }


# ---------------------------------------------------------------------------
# Единая точка исполнения тула
# ---------------------------------------------------------------------------

async def execute_tool(
    db: AsyncSession,
    user: User,
    name: str,
    args: dict,
) -> Tuple[dict, Optional[dict]]:
    """
    Исполняет тул по имени. Возвращает (result_for_model, ui_event | None).
    ui_event (если есть) отправляется фронтенду как отдельное SSE-событие.
    """
    owner_id = get_owner_id(user)
    try:
        if name == "search_categories":
            return (await _tool_search_categories(db, args), None)
        if name == "get_category_form_fields":
            return (await _tool_get_category_form_fields(db, owner_id, args), None)
        if name == "propose_lot_template":
            return await _tool_propose_lot_template(db, owner_id, args)
        if name == "list_lot_templates":
            return (await _tool_list_lot_templates(db, owner_id), None)
        if name == "propose_publish_lot":
            return await _tool_propose_publish_lot(db, owner_id, args)
        if name == "propose_delete_template":
            return await _tool_propose_delete_template(db, owner_id, args)
        if name == "list_accounts":
            return (await _tool_list_accounts(db, owner_id), None)
        if name == "get_account_overview":
            return (await _tool_get_account_overview(db, owner_id, args), None)
        if name == "list_account_lots":
            return (await _tool_list_account_lots(db, owner_id, args), None)
        if name == "get_lot_details":
            return (await _tool_get_lot_details(db, owner_id, args), None)
        if name == "get_account_reviews":
            return (await _tool_get_account_reviews(db, owner_id, args), None)
        if name == "get_sales_stats":
            return (await _tool_get_sales_stats(db, owner_id, args), None)
        if name == "list_warehouse_items":
            return (await _tool_list_warehouse_items(db, owner_id, args), None)
        return ({"error": f"Неизвестный тул: {name}"}, None)
    except Exception as e:
        logger.exception(f"Ошибка исполнения тула {name}: {e}")
        return ({"error": f"Ошибка исполнения тула: {e}"}, None)
