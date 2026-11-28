"""Generic document extraction for the OCR service.

Aadhaar keeps its strict parser (Verhoeff checksum, Hindi labels, address/PIN).
This module handles the other beneficiary documents:

* UDID / Unique Disability ID cards
* Disability certificates
* plain documents where only the common fields are known

Everything works on the same line list Indra OCR returns, so the service can
return one consistent JSON shape for every document type.
"""

from __future__ import annotations

import re

from aadhaar import (
    Extraction,
    Field,
    _clean_lines,
    extract,
    extract_common_fields,
)

__all__ = ["normalize_doc_type", "extract_document", "DOC_TYPES"]

DOC_TYPES = ("aadhaar", "udid", "disability", "generic", "auto")

_ALIASES = {
    "aadhaar": "aadhaar",
    "aadhar": "aadhaar",
    "aadhaar card": "aadhaar",
    "aadhar card": "aadhaar",
    "uid": "aadhaar",
    "uidai": "aadhaar",
    "udid": "udid",
    "udid card": "udid",
    "unique disability id": "udid",
    "unique disability identity": "udid",
    "disability id": "udid",
    "swavlamban": "udid",
    "disability": "disability",
    "disability certificate": "disability",
    "certificate of disability": "disability",
    "medical certificate": "disability",
    "generic": "generic",
    "document": "generic",
    "doc": "generic",
    "other": "generic",
    "auto": "auto",
    "": "aadhaar",
}


def normalize_doc_type(value: str | None) -> str:
    """Map UI/API aliases to one of DOC_TYPES. Raises ValueError if unknown."""
    key = re.sub(r"[\s_]+", " ", str(value or "").strip().lower())
    if key in _ALIASES:
        return _ALIASES[key]
    if not key:
        return "aadhaar"
    raise ValueError(f"Unsupported doc_type '{value}'. Use one of: {', '.join(DOC_TYPES)}.")


# --------------------------------------------------------------------------
# UDID number
# --------------------------------------------------------------------------

_UDID_LABEL = re.compile(
    r"(?:udid|unique\s+disability\s+(?:id|identity)|disability\s+(?:id|identity)|"
    r"स्वावलंबन|यूडीआईडी|विकलांगता\s+आईडी)",
    re.IGNORECASE,
)
_UDID_PATTERN = re.compile(r"\b[A-Z]{2}(?:\s?\d){14,18}\b", re.ASCII)
_UDID_DIGITS = re.compile(r"(?<!\d)(?:\d[\s\-]?){17}\d(?!\d)")


def _normalize_id(value: str) -> str:
    return re.sub(r"[\s\-]", "", value).strip(".,;:#/").upper()


def _has_enough_digits(value: str, minimum: int = 14) -> bool:
    return sum(char.isdigit() for char in value) >= minimum


def _udid_from_text(lines: list[str]) -> Field:
    # A label is the strongest signal: "UDID No: MH12 3456 7890 1234 56".
    for index, line in enumerate(lines):
        label = _UDID_LABEL.search(line)
        if not label:
            continue
        window = " ".join(lines[index : index + 2])
        after = window[label.end() :]
        for pattern in (_UDID_PATTERN, _UDID_DIGITS):
            match = pattern.search(after)
            if match:
                value = _normalize_id(match.group(0))
                if _has_enough_digits(value):
                    return Field(value, 0.92)
        if index + 1 < len(lines):
            for pattern in (_UDID_PATTERN, _UDID_DIGITS):
                match = pattern.search(lines[index + 1])
                if match:
                    value = _normalize_id(match.group(0))
                    if _has_enough_digits(value):
                        return Field(value, 0.86)

    # No label: the UDID format is 2 letters + 14-18 digits (spaces allowed).
    for line in lines:
        match = _UDID_PATTERN.search(line)
        if match:
            value = _normalize_id(match.group(0))
            if _has_enough_digits(value):
                return Field(value, 0.78)

    # Some cards print the 18 digits without the two-letter prefix.
    for line in lines:
        match = _UDID_DIGITS.search(line)
        if match:
            value = _normalize_id(match.group(0))
            if _has_enough_digits(value, 18):
                return Field(value, 0.62)

    return Field(None, 0.0, "Not found")


# --------------------------------------------------------------------------
# Certificate number
# --------------------------------------------------------------------------

_CERT_LABEL = re.compile(
    r"(?:certificate|cert\.?|registration|reg\.?|serial|ref\.?)\s*"
    r"(?:no|number|#)?\s*[:\-#.]?\s*([A-Za-z0-9][A-Za-z0-9/\-\s]{3,40})",
    re.IGNORECASE,
)
_CERT_WORD = re.compile(
    r"(?:certificate|cert\.?\s*(?:no|number)|registration|reg\.?\s*(?:no|number)|serial|ref\.?)",
    re.IGNORECASE,
)


def _id_token(raw: str) -> str | None:
    """Take the first token plus following digit-only groups.

    "MH12 3456 7890" -> "MH1234567890"; "DL/2020/12345" stays one token;
    "No. 1234 5678" keeps both numeric groups; "of Disability" is rejected.
    """
    parts = raw.strip().split()
    if not parts:
        return None
    first = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", parts[0])
    if not first:
        return None
    out = [first]
    for part in parts[1:]:
        if re.fullmatch(r"\d+", part):
            out.append(part)
        else:
            break
    token = "".join(out)
    if len(token) < 5 or not re.search(r"\d", token):
        return None
    if re.fullmatch(r"(?:19|20)\d{2}", token):
        return None
    if re.fullmatch(r"\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}", token):
        return None
    return token


def _certificate_from_text(lines: list[str]) -> Field:
    for index, line in enumerate(lines):
        for match in _CERT_LABEL.finditer(line):
            token = _id_token(match.group(1))
            if token:
                return Field(token, 0.9)
        # OCR often puts the certificate number below its label:
        #   Certificate No.
        #   DL/2020/12345
        if _CERT_WORD.search(line) and index + 1 < len(lines):
            token = _id_token(lines[index + 1])
            if token:
                return Field(token, 0.84)
    return Field(None, 0.0, "Not found")


# --------------------------------------------------------------------------
# Disability percentage and type
# --------------------------------------------------------------------------

_PERCENT_SIGN = re.compile(
    r"(?<!\d)(\d{1,3})(?:\.\d+)?\s*(?:%|per\s*cent|percent|प्रतिशत)",
    re.IGNORECASE,
)
_PERCENT_LABEL = re.compile(
    r"(?:disability|impairment|percentage|विकलांगता)[^\d\n]{0,40}(\d{1,3})",
    re.IGNORECASE,
)


def _valid_percentage(value: int | None) -> bool:
    return value is not None and 1 <= value <= 100


def _percentage_from_text(lines: list[str]) -> Field:
    text = "\n".join(lines)
    for match in _PERCENT_SIGN.finditer(text):
        value = int(match.group(1))
        if _valid_percentage(value):
            return Field(str(value), 0.92)

    for line in lines:
        match = _PERCENT_LABEL.search(line)
        if match:
            value = int(match.group(1))
            if _valid_percentage(value):
                return Field(str(value), 0.7)
    return Field(None, 0.0, "Not found")


_DISABILITY_TYPES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("multiple disabilit", "बहु विकलांग", "बहुविकलांग"), "Multiple Disabilities"),
    (("cerebral palsy", "सेरेब्रल पाल्सी"), "Cerebral Palsy"),
    (("autism", "ऑटिज़्म", "ऑटिज्म"), "Autism Spectrum Disorder"),
    (("dwarf", "बौनापन"), "Dwarfism"),
    (("leprosy", "कुष्ठ"), "Leprosy Cured"),
    (("mental illness", "psychosocial", "मानसिक रोग"), "Mental Illness"),
    (("intellectual", "mental retardation", "learning disab", "बौद्धिक", "मानसिक मंदता"), "Intellectual Disability"),
    (("hearing", "deaf", "श्रवण", "बधिर"), "Hearing Impairment"),
    (("speech", "वाक्", "भाषा"), "Speech & Language"),
    (("visual", "blind", "low vision", "दृष्टि", "नेत्र", "अंध"), "Visual Impairment"),
    (("locomotor", "orthop", "amputat", "limb", "physical", "लोकोमोटर", "अस्थि", "शारीरिक"), "Locomotor / Orthopedic"),
)


def _disability_type_from_text(lines: list[str]) -> Field:
    low = "\n".join(lines).lower()
    hits: list[str] = []
    for keywords, label in _DISABILITY_TYPES:
        if any(keyword.lower() in low for keyword in keywords):
            if label == "Multiple Disabilities":
                return Field(label, 0.9)
            hits.append(label)
    unique = list(dict.fromkeys(hits))
    if len(unique) == 1:
        return Field(unique[0], 0.85)
    return Field(None, 0.0, "Not found" if not unique else "Type is ambiguous")


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def _empty_fields() -> dict[str, Field]:
    keys = (
        "name", "dob", "gender", "address", "pincode", "udid_number",
        "certificate_number", "disability_percentage", "disability_type",
    )
    return {key: Field(None, 0.0, "No readable text") for key in keys}


def _detect_type(text: str, side_hint: str) -> str:
    low = text.lower()
    if any(key in low for key in ("udid", "unique disability", "disability id", "स्वावलंबन")):
        return "udid"
    if any(key in low for key in ("disability certificate", "certificate of disability", "medical board")):
        return "disability"
    if any(key in low for key in ("aadhaar", "आधार", "uidai")):
        return "aadhaar"
    return "generic"


def extract_document(
    text: str, doc_type: str = "aadhaar", side_hint: str = "auto"
) -> tuple[Extraction, str]:
    """Extract fields for Aadhaar, UDID, disability certificates, or a document.

    Returns (extraction, resolved_doc_type). Aadhaar keeps its strict parser;
    the other types share the common name/DOB/gender/address fields and add
    document-specific identifiers.
    """
    requested = normalize_doc_type(doc_type)
    resolved = requested
    if requested == "auto":
        resolved = _detect_type(text, side_hint)

    if resolved == "aadhaar":
        return extract(text, side_hint), "aadhaar"

    lines = _clean_lines(text or "")
    if not lines:
        return (
            Extraction(_empty_fields(), "unknown", {}, ["No readable text found."]),
            resolved,
        )

    _, name, dob, gender, address, pincode = extract_common_fields(text)
    fields: dict[str, Field] = {
        "name": name,
        "dob": dob,
        "gender": gender,
        "address": address,
        "pincode": pincode,
        "udid_number": Field(None, 0.0, "Not found"),
        "certificate_number": Field(None, 0.0, "Not found"),
        "disability_percentage": Field(None, 0.0, "Not found"),
        "disability_type": Field(None, 0.0, "Not found"),
    }

    if resolved in ("udid", "disability", "generic"):
        fields["udid_number"] = _udid_from_text(lines)
        fields["certificate_number"] = _certificate_from_text(lines)
        fields["disability_percentage"] = _percentage_from_text(lines)
        fields["disability_type"] = _disability_type_from_text(lines)

    # A UDID card's number is its certificate/ID number. Keep the dedicated
    # udid_number field and fill certificate_number for forms that ask for one.
    if not fields["certificate_number"].value and fields["udid_number"].value:
        fields["certificate_number"] = Field(
            fields["udid_number"].value,
            fields["udid_number"].confidence,
            "Read from the UDID number",
        )

    warnings: list[str] = []
    if not name.value:
        warnings.append("Name not found.")
    if not dob.value:
        warnings.append("Date of birth not found.")
    if not address.value:
        warnings.append("Address not found.")
    if resolved == "udid" and not fields["udid_number"].value:
        warnings.append("UDID number not found.")
    if resolved == "disability" and not fields["certificate_number"].value:
        warnings.append("Certificate number not found.")
    if resolved == "disability" and not fields["disability_percentage"].value:
        warnings.append("Disability percentage not found.")
    if resolved == "disability" and not fields["disability_type"].value:
        warnings.append("Disability type not found.")

    side = side_hint if side_hint in ("front", "back") else "document"
    return Extraction(fields, side, {}, warnings), resolved
