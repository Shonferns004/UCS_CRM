from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents import extract_document, normalize_doc_type  # noqa: E402

UDID = """UNIQUE DISABILITY ID CARD
Government of India
Name: Ravi Kumar Sharma
UDID No: MH12 3456 7890 1234 56
DOB: 14/08/1991
Gender: Male
Address: S/O Ram Kumar Sharma, House No. 24, Sector 12, Vasant Nagar, Bengaluru, Karnataka - 560001
Disability: Locomotor 45%
"""

CERTIFICATE = """GOVERNMENT OF INDIA
DISABILITY CERTIFICATE
Certificate No: DL/2020/12345
Name: Ravi Kumar Sharma
Date of Birth: 14/08/1991
Gender: Male
Address: S/O Ram Kumar Sharma, House No. 24, Sector 12, Vasant Nagar, Bengaluru, Karnataka - 560001
Disability Type: Visual Impairment
Disability Percentage: 60%
"""


class DocTypeTests(unittest.TestCase):
    def test_aliases(self) -> None:
        self.assertEqual(normalize_doc_type("aadhar"), "aadhaar")
        self.assertEqual(normalize_doc_type("UDID Card"), "udid")
        self.assertEqual(normalize_doc_type("disability certificate"), "disability")
        self.assertEqual(normalize_doc_type(""), "aadhaar")

    def test_unknown_type_rejected(self) -> None:
        with self.assertRaises(ValueError):
            normalize_doc_type("passport")


class UdidTests(unittest.TestCase):
    def test_udid_card(self) -> None:
        result, resolved = extract_document(UDID, "udid")
        fields = result.as_dict()["fields"]
        self.assertEqual(resolved, "udid")
        self.assertEqual(fields["name"]["value"], "Ravi Kumar Sharma")
        self.assertEqual(fields["udid_number"]["value"], "MH1234567890123456")
        self.assertEqual(fields["certificate_number"]["value"], "MH1234567890123456")
        self.assertEqual(fields["disability_percentage"]["value"], "45")
        self.assertEqual(fields["disability_type"]["value"], "Locomotor / Orthopedic")
        self.assertEqual(fields["pincode"]["value"], "560001")

    def test_18_digit_udid_without_letters(self) -> None:
        text = """UDID Card
Name: Ravi Kumar
UDID Number: 1234 5678 9012 3456 78
DOB: 01/01/1990
"""
        result, _ = extract_document(text, "udid")
        self.assertEqual(result.as_dict()["fields"]["udid_number"]["value"], "123456789012345678")

    def test_auto_detects_udid(self) -> None:
        result, resolved = extract_document(UDID, "auto")
        self.assertEqual(resolved, "udid")
        self.assertEqual(result.as_dict()["fields"]["udid_number"]["value"], "MH1234567890123456")


class DisabilityCertificateTests(unittest.TestCase):
    def test_certificate(self) -> None:
        result, resolved = extract_document(CERTIFICATE, "disability")
        fields = result.as_dict()["fields"]
        self.assertEqual(resolved, "disability")
        self.assertEqual(fields["certificate_number"]["value"], "DL/2020/12345")
        self.assertEqual(fields["disability_percentage"]["value"], "60")
        self.assertEqual(fields["disability_type"]["value"], "Visual Impairment")
        self.assertEqual(fields["name"]["value"], "Ravi Kumar Sharma")
        self.assertEqual(fields["dob"]["value"], "14/08/1991")

    def test_issue_date_is_not_dob(self) -> None:
        text = """DISABILITY CERTIFICATE
Certificate No: DL/2020/12345
Name: Ravi Kumar
Date of Issue: 12/03/2020
Disability: Visual Impairment
Percentage: 40%
"""
        result, _ = extract_document(text, "disability")
        self.assertIsNone(result.as_dict()["fields"]["dob"]["value"])

    def test_certificate_number_is_not_a_pincode(self) -> None:
        text = """DISABILITY CERTIFICATE
Certificate No: 123456
Name: Ravi Kumar
Disability: Hearing Impairment
Percentage: 40%
"""
        result, _ = extract_document(text, "disability")
        fields = result.as_dict()["fields"]
        self.assertEqual(fields["certificate_number"]["value"], "123456")
        self.assertIsNone(fields["pincode"]["value"])

    def test_ambiguous_type_is_not_guessed(self) -> None:
        text = """DISABILITY CERTIFICATE
Certificate No: DL/2020/12345
Name: Ravi Kumar
Disability: Locomotor and Visual Impairment
Percentage: 40%
"""
        result, _ = extract_document(text, "disability")
        self.assertIsNone(result.as_dict()["fields"]["disability_type"]["value"])

    def test_multiple_disabilities(self) -> None:
        text = """DISABILITY CERTIFICATE
Certificate No: DL/2020/12345
Name: Ravi Kumar
Disability: Multiple Disabilities (Locomotor and Visual)
Percentage: 70%
"""
        result, _ = extract_document(text, "disability")
        self.assertEqual(result.as_dict()["fields"]["disability_type"]["value"], "Multiple Disabilities")


class AutoTests(unittest.TestCase):
    def test_auto_detects_disability(self) -> None:
        result, resolved = extract_document(CERTIFICATE, "auto")
        self.assertEqual(resolved, "disability")
        self.assertEqual(result.as_dict()["fields"]["certificate_number"]["value"], "DL/2020/12345")

    def test_auto_detects_aadhaar(self) -> None:
        text = """Government of India
Ravi Kumar Sharma
DOB: 14/08/1991
Aadhaar: 4821 9376 5049
"""
        result, resolved = extract_document(text, "auto")
        self.assertEqual(resolved, "aadhaar")
        self.assertEqual(result.as_dict()["fields"]["aadhaar"]["value"], "4821 9376 5049")


if __name__ == "__main__":
    unittest.main()
