"""Validation of partial updates against the live editable Funpay form."""
from decimal import Decimal, InvalidOperation
from typing import Any


def validate_existing_lot_form(details: dict, lot_id: str) -> None:
    """Verify the form's actual identity, not the request's echoed lot_id."""
    fields = details.get("fields") or {}
    identities = [str(fields[k]).strip() for k in ("offer_id", "offer") if k in fields]
    if not identities or any(identity != str(lot_id) for identity in identities):
        raise ValueError("Форма не содержит ID нужного существующего лота (offer_id/offer). Проверь доступ к лоту и авторизацию аккаунта; не повторяй тот же вызов")
    if not details.get("form_fields"):
        raise ValueError("В форме лота не найдены редактируемые поля")


def validate_lot_patch(details: dict, changes: Any) -> dict:
    if not isinstance(changes, dict) or not changes or len(changes) > 50:
        raise ValueError("Передай непустой объект changes только с изменяемыми полями")
    editable = {
        f["name"]: f for f in details.get("form_fields", [])
        if f.get("name") and f.get("type") not in ("hidden", "submit", "button", "file")
        and f["name"] not in ("csrf_token", "form_created_at", "offer", "offer_id", "node", "id", "fields[method]")
    }
    patch = {}
    for key, value in changes.items():
        if key not in editable:
            raise ValueError(f"Поле {key} недоступно для редактирования. Используй ключи из get_lot_details.form_fields")
        if value is None or isinstance(value, (dict, list)):
            raise ValueError(f"Некорректное значение поля {key}")
        meta = editable[key]
        if meta.get("type") == "checkbox":
            if value not in (True, False, 0, 1, "0", "1"):
                raise ValueError(f"Поле {key}: допустимы true/false или 1/0")
            patch[key] = "1" if value in (True, 1, "1") else "0"
        else:
            if isinstance(value, bool):
                raise ValueError(f"Поле {key} не является флажком")
            patch[key] = str(value)
        if meta.get("type") == "select":
            if patch[key] not in {str(o["value"]) for o in meta.get("options") or []}:
                raise ValueError(f"Поле {key}: выбери value из options")
        if key in ("price", "amount"):
            try:
                number = Decimal(patch[key].replace(",", "."))
            except InvalidOperation:
                raise ValueError(f"Поле {key}: требуется число") from None
            if not number.is_finite() or number < 0 or (key == "price" and number == 0):
                raise ValueError(f"Поле {key}: недопустимое число")
            if key == "amount" and number != number.to_integral_value():
                raise ValueError("Количество должно быть целым")
            patch[key] = str(number)
    return patch
