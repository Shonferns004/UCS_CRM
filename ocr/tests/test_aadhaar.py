from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aadhaar import extract, verify_aadhaar  # noqa: E402


class ChecksumTests(unittest.TestCase):
    def test_valid_number(self) -> None:
        self.assertTrue(verify_aadhaar("4821 9376 5049"))

    def test_invalid_number(self) -> None:
        self.assertFalse(verify_aadhaar("4821 9376 5041"))
        self.assertFalse(verify_aadhaar("1234"))

    def test_checksum_is_position_sensitive(self) -> None:
        self.assertFalse(verify_aadhaar("5821 9376 5049"))


class FrontTests(unittest.TestCase):
    def test_english_front(self) -> None:
        text = """भारत सरकार
Government of India
Ravi Kumar Sharma
जन्म तिथि / DOB: 14/08/1991
पुरुष / Male
4821 9376 5049
आधार - आपकी पहचान का एक कार्ड
Aadhaar - A card of your identity
"""
        result = extract(text, side_hint="front").as_dict()
        self.assertEqual(result["fields"]["name"]["value"], "Ravi Kumar Sharma")
        self.assertEqual(result["fields"]["aadhaar"]["value"], "4821 9376 5049")
        self.assertTrue(result["checks"]["aadhaar_valid"])
        self.assertEqual(result["fields"]["dob"]["value"], "14/08/1991")
        self.assertEqual(result["fields"]["gender"]["value"], "Male")
        self.assertEqual(result["side"], "front")
        self.assertGreater(result["fields"]["name"]["confidence"], 0.6)

    def test_name_label_and_ocr_digits(self) -> None:
        text = """Name: Ravi Kumar
DOB: ०१/०१/१९९०
Aadhaar 4821 9376 5049
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["name"]["value"], "Ravi Kumar")
        self.assertEqual(result["fields"]["dob"]["value"], "01/01/1990")

    def test_tolerant_number(self) -> None:
        text = """Ravi Kumar
DOB: 14/08/1991
Aadhaar: 4B21 9376 5O49
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["aadhaar"]["value"], "4821 9376 5049")
        self.assertTrue(result["checks"]["aadhaar_valid"])

    def test_invalid_checksum_is_flagged(self) -> None:
        text = """Ravi Kumar
DOB: 14/08/1991
Aadhaar: 4821 9376 5041
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["aadhaar"]["value"], "4821 9376 5041")
        self.assertFalse(result["checks"]["aadhaar_valid"])
        self.assertIn("checksum", result["fields"]["aadhaar"]["note"].lower())

    def test_year_of_birth(self) -> None:
        text = """Ravi Kumar
Year of Birth: 1991
Aadhaar: 4821 9376 5049
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["dob"]["value"], "1991")

    def test_does_not_take_aadhaar_digits_as_dob(self) -> None:
        text = """Ravi Kumar
Aadhaar: 4821 9376 5049
"""
        result = extract(text).as_dict()
        self.assertIsNone(result["fields"]["dob"]["value"])


class BackTests(unittest.TestCase):
    def test_address_on_back(self) -> None:
        text = """Address: S/O Ram Kumar Sharma,
House No. 24, Sector 12,
Vasant Nagar, Bengaluru,
Karnataka - 560001
Aadhaar No. 4821 9376 5049
"""
        result = extract(text, side_hint="back").as_dict()
        self.assertEqual(result["side"], "back")
        address = result["fields"]["address"]["value"]
        self.assertIn("House No. 24", address)
        self.assertIn("Vasant Nagar", address)
        self.assertTrue(address.endswith("560001"))
        self.assertEqual(result["fields"]["pincode"]["value"], "560001")
        self.assertGreater(result["fields"]["address"]["confidence"], 0.8)
        # A state name on the back must not become a person's name.
        self.assertIsNone(result["fields"]["name"]["value"])

    def test_address_without_label(self) -> None:
        text = """S/O Ram Kumar Sharma
House No. 24, Sector 12
Vasant Nagar, Bengaluru, Karnataka
560001
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["pincode"]["value"], "560001")
        self.assertIn("Vasant Nagar", result["fields"]["address"]["value"])
        self.assertEqual(result["side"], "back")

    def test_hindi_front(self) -> None:
        text = """नाम / Name
Ravi Kumar
जन्म तिथि: ०१/०१/१९९०
लिंग: पुरुष
आधार संख्या: 4821 9376 5049
पता: 12, गांधी नगर, नई दिल्ली - 110001
"""
        result = extract(text).as_dict()
        self.assertEqual(result["fields"]["name"]["value"], "Ravi Kumar")
        self.assertEqual(result["fields"]["dob"]["value"], "01/01/1990")
        self.assertEqual(result["fields"]["gender"]["value"], "Male")
        self.assertEqual(result["fields"]["pincode"]["value"], "110001")
        self.assertIn("गांधी नगर", result["fields"]["address"]["value"])


class EmptyTests(unittest.TestCase):
    def test_no_text(self) -> None:
        result = extract("").as_dict()
        self.assertIsNone(result["fields"]["aadhaar"]["value"])
        self.assertEqual(result["side"], "unknown")
        self.assertIn("No readable text", result["warnings"][0])


if __name__ == "__main__":
    unittest.main()
