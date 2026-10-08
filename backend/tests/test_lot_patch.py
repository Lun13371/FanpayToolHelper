import unittest
from app.services.lot_patch import validate_lot_patch, validate_existing_lot_form


class LotPatchTests(unittest.TestCase):
    def setUp(self):
        self.details = {
            "fields": {"price": "105.40", "fields[desc][ru]": "Keep", "offer": "123"},
            "form_fields": [
                {"name": "price", "type": "text"},
                {"name": "amount", "type": "text"},
                {"name": "active", "type": "checkbox"},
                {"name": "fields[desc][ru]", "type": "textarea"},
                {"name": "fields[region]", "type": "select", "options": [{"value": "eu"}]},
                {"name": "offer", "type": "hidden"},
            ],
        }

    def test_existing_form_offer_id(self):
        self.details["fields"].pop("offer")
        self.details["fields"]["offer_id"] = "123"
        validate_existing_lot_form(self.details, "123")
        self.assertEqual(validate_lot_patch(self.details, {"price": 80}), {"price": "80"})

    def test_existing_form_legacy_offer(self):
        validate_existing_lot_form(self.details, "123")

    def test_reject_wrong_or_new_or_missing_identity(self):
        for fields in ({"offer_id": "456"}, {"offer_id": "0"}, {"offer": ""}, {},
                       {"offer_id": "123", "offer": "456"}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                validate_existing_lot_form({"fields": fields, "form_fields": self.details["form_fields"]}, "123")
        with self.assertRaises(ValueError):
            validate_existing_lot_form({"fields": {"offer_id": "123"}}, "123")

    def test_identity_is_never_editable(self):
        self.details["form_fields"].append({"name": "offer_id", "type": "text"})
        with self.assertRaises(ValueError):
            validate_lot_patch(self.details, {"offer_id": "456"})

    def test_only_requested_field(self):
        self.assertEqual(validate_lot_patch(self.details, {"price": 80}), {"price": "80"})
        self.assertEqual(self.details["fields"]["fields[desc][ru]"], "Keep")

    def test_checkbox_and_empty_text(self):
        self.assertEqual(validate_lot_patch(self.details, {"active": False, "fields[desc][ru]": ""}),
                         {"active": "0", "fields[desc][ru]": ""})

    def test_select_values(self):
        self.assertEqual(validate_lot_patch(self.details, {"fields[region]": "eu"}), {"fields[region]": "eu"})
        with self.assertRaises(ValueError):
            validate_lot_patch(self.details, {"fields[region]": "Europe"})

    def test_reject_invalid_changes(self):
        for patch in ({}, {"offer": "456"}, {"csrf_token": "evil"}, {"unknown": 1},
                      {"price": 0}, {"price": -1}, {"price": "NaN"}, {"price": "Infinity"},
                      {"amount": 1.5}, {"amount": -1}, {"active": "false"}, {"price": True},
                      {"price": None}, {"price": {"nested": 1}}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate_lot_patch(self.details, patch)


if __name__ == "__main__":
    unittest.main()
