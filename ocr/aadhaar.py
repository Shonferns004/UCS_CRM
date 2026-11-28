"""Extract Aadhaar fields from OCR text.

The parser works on plain text, one detected line per entry, as produced by
Indra OCR. It is deliberately tolerant of the usual scan noise: markdown
furniture, Devanagari digits, and the common 0/O, 1/I, 5/S, 8/B confusions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

__all__ = ["extract", "verify_aadhaar", "format_aadhaar"]


# --------------------------------------------------------------------------
# Text normalisation
# --------------------------------------------------------------------------

_DEVA_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_OCR_DIGITS = str.maketrans(
    {
        "O": "0", "o": "0",
        "I": "1", "l": "1", "|": "1",
        "S": "5", "s": "5",
        "B": "8",
        "Z": "2", "z": "2",
        "G": "6",
    }
)
_MARKDOWN = re.compile(r"[*_`~#>|]+")


def _normalise_digits(text: str) -> str:
    return text.translate(_DEVA_DIGITS)


def _clean_lines(text: str) -> list[str]:
    """Turn OCR markdown into compact, comparable lines."""
    lines: list[str] = []
    for raw in _normalise_digits(text).splitlines():
        line = raw.replace("\u00a0", " ").replace("\u200b", "")
        line = re.sub(r"<[^>]+>", " ", line)  # markdown tables
        line = _MARKDOWN.sub(" ", line)
        line = re.sub(r"\s+", " ", line).strip(" \t-–—:")
        if line:
            lines.append(line)
    return lines


def _clamp(value: float) -> float:
    return round(max(0.0, min(0.99, value)), 2)


def _tokens(line: str) -> list[str]:
    return [t for t in re.split(r"[^0-9A-Za-z\u0900-\u097f]+", line.lower()) if t]


# --------------------------------------------------------------------------
# Verhoeff checksum (base-10 dihedral check, used by UIDAI)
# --------------------------------------------------------------------------

_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)


def verify_aadhaar(number: str) -> bool:
    """Return True when a 12-digit Aadhaar number passes the Verhoeff check."""
    digits = re.sub(r"\D", "", _normalise_digits(number))
    if len(digits) != 12:
        return False
    check = 0
    for i, char in enumerate(reversed(digits)):
        check = _D[check][_P[i % 8][int(char)]]
    return check == 0


def format_aadhaar(number: str) -> str:
    digits = re.sub(r"\D", "", _normalise_digits(number))
    return " ".join(digits[i : i + 4] for i in range(0, len(digits), 4))


# --------------------------------------------------------------------------
# Field model
# --------------------------------------------------------------------------


@dataclass
class Field:
    value: str | None = None
    confidence: float = 0.0
    note: str | None = None

    def as_dict(self) -> dict:
        data: dict = {"value": self.value, "confidence": _clamp(self.confidence)}
        if self.note:
            data["note"] = self.note
        return data


@dataclass
class Extraction:
    fields: dict[str, Field]
    side: str
    checks: dict[str, bool | None]
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "fields": {name: value.as_dict() for name, value in self.fields.items()},
            "side": self.side,
            "checks": self.checks,
            "warnings": self.warnings,
        }


# --------------------------------------------------------------------------
# Aadhaar number
# --------------------------------------------------------------------------

_GROUP = r"[0-9OoIlSBZzG]"
_AADHAAR_STRICT = re.compile(r"(?<!\d)(\d{4})[\s\-·]?(\d{4})[\s\-·]?(\d{4})(?!\d)")
_AADHAAR_TOLERANT = re.compile(
    rf"(?<![0-9A-Za-z])({_GROUP}{{4}})[\s\-·]?({_GROUP}{{4}})[\s\-·]?({_GROUP}{{4}})(?![0-9A-Za-z])"
)
_AADHAAR_KEYWORDS = ("aadhaar", "आधार", "uidai", "unique identification", "आपकी पहचान")


def _near_keyword(lines: list[str], index: int, keywords: tuple[str, ...], radius: int = 2) -> bool:
    start = max(0, index - radius)
    end = min(len(lines), index + radius + 1)
    return any(any(key in lines[i].lower() for key in keywords) for i in range(start, end))


def _aadhaar_from_text(lines: list[str]) -> tuple[Field, bool | None]:
    best: tuple[float, str, bool] | None = None  # score, digits, checksum
    total = max(len(lines), 1)

    def consider(raw: str, index: int, tolerant: bool) -> None:
        nonlocal best
        digits = raw.translate(_OCR_DIGITS) if tolerant else raw
        if not re.fullmatch(r"\d{12}", digits):
            return
        if sum(ch.isdigit() for ch in raw) < (9 if tolerant else 12):
            return
        valid = verify_aadhaar(digits)
        score = 0.3
        score += 0.42 if valid else 0.0
        score += 0.14 if _near_keyword(lines, index, _AADHAAR_KEYWORDS) else 0.0
        score += 0.05 if digits[0] in "23456789" else -0.1
        score += 0.05 if index >= total * 0.45 else 0.0
        score += 0.03 if re.search(r"[\s\-·]", raw) else 0.0
        score -= 0.08 if tolerant else 0.0
        if best is None or score > best[0]:
            best = (score, digits, valid)

    for index, line in enumerate(lines):
        for match in _AADHAAR_STRICT.finditer(line):
            consider("".join(match.groups()), index, False)
        for match in _AADHAAR_TOLERANT.finditer(line):
            consider("".join(match.groups()), index, True)

    # Some cameras split the three groups over two lines. Rejoin number-only
    # neighbours when they add up to a 12-digit run.
    for index in range(len(lines) - 1):
        joined = f"{lines[index]} {lines[index + 1]}"
        if not re.fullmatch(r"[\dOoIlSBZzG\s\-·]{11,20}", joined):
            continue
        for match in _AADHAAR_TOLERANT.finditer(joined):
            consider("".join(match.groups()), index, True)

    if best is None:
        return Field(None, 0.0, "Not found"), None

    score, digits, valid = best
    note = None
    if not valid:
        note = "Checksum could not be verified — compare with the card"
    return Field(format_aadhaar(digits), score if valid else min(score, 0.55), note), valid


# --------------------------------------------------------------------------
# Date of birth and gender
# --------------------------------------------------------------------------

_DATE = re.compile(r"(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})(?!\d)")
_YEAR = re.compile(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)")
_DOB_LABEL = re.compile(
    r"(d\.?\s*o\.?\s*b\.?|date\s+of\s+birth|birth\s+date|year\s+of\s+birth|"
    r"जन्म\s*(?:तिथि|तारीख|दिनांक|वर्ष)|जन्मतिथि)",
    re.IGNORECASE,
)


def _valid_date(day: int, month: int, year: int) -> bool:
    if not (1900 <= year <= date.today().year):
        return False
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def _dob_from_text(lines: list[str], allow_plain: bool = True) -> Field:
    labelled: list[tuple[float, str]] = []
    plain: list[tuple[float, str]] = []

    for index, line in enumerate(lines):
        window = [line]
        if index + 1 < len(lines):
            window.append(lines[index + 1])
        has_label = bool(_DOB_LABEL.search(line))
        close_label = has_label or (
            index > 0 and bool(_DOB_LABEL.search(lines[index - 1]))
        )

        for offset, candidate_line in enumerate(window):
            match = _DATE.search(candidate_line)
            if match:
                day, month, year = (int(part) for part in match.groups())
                if not _valid_date(day, month, year):
                    continue
                value = f"{day:02d}/{month:02d}/{year:04d}"
                if has_label or close_label:
                    labelled.append((0.92 if offset == 0 else 0.86, value))
                elif allow_plain and line.strip() == match.group(0).strip():
                    plain.append((0.62, value))
            elif has_label:
                year_match = _YEAR.search(candidate_line)
                if year_match:
                    labelled.append((0.72, year_match.group(1)))

    if labelled:
        value = labelled[0][1]
        return Field(value, max(score for score, found in labelled if found == value))
    if plain:
        value = plain[0][1]
        return Field(value, max(score for score, found in plain if found == value))
    return Field(None, 0.0, "Not found")


def _find_dob_index(lines: list[str], dob: Field) -> int | None:
    """Locate the line the chosen DOB came from (used to position the name)."""
    if not dob.value:
        return None
    if "/" in dob.value:
        for index, line in enumerate(lines):
            for match in _DATE.finditer(line):
                day, month, year = (int(part) for part in match.groups())
                if f"{day:02d}/{month:02d}/{year:04d}" == dob.value:
                    return index
    else:
        for index, line in enumerate(lines):
            if dob.value in line and _DOB_LABEL.search(line):
                return index
    return None


_GENDERS = (
    ("transgender", "Other"),
    ("other", "Other"),
    ("female", "Female"),
    ("male", "Male"),
    ("महिला", "Female"),
    ("स्त्री", "Female"),
    ("पुरुष", "Male"),
    ("ट्रांसजेंडर", "Other"),
    ("अन्य", "Other"),
)


def _gender_from_text(lines: list[str]) -> Field:
    for index, line in enumerate(lines):
        low = line.lower()
        if not any(word in low for word in ("gender", "sex", "लिंग")):
            continue
        for token, value in _GENDERS:
            if token in low:
                return Field(value, 0.9)
        if index + 1 < len(lines):
            nxt = lines[index + 1].lower()
            for token, value in _GENDERS:
                if token in nxt:
                    return Field(value, 0.8)
    for line in lines:
        low = line.lower()
        if len(low) <= 24:
            for token, value in _GENDERS:
                if token in low:
                    return Field(value, 0.7)
    return Field(None, 0.0, "Not found")


# --------------------------------------------------------------------------
# Name
# --------------------------------------------------------------------------

_NAME_LABEL = re.compile(r"^(?:name|नाम)\s*(?:[/|]\s*(?:name|नाम))?\s*[:：\-]?\s*(.*)$", re.IGNORECASE)
_NAME_STOP = {
    "government", "india", "indian", "aadhaar", "आधार", "uidai", "unique",
    "identification", "authority", "address", "पता", "dob", "birth", "gender",
    "male", "female", "transgender", "other", "mobile", "email", "vid", "enrol",
    "enrolment", "enrollment", "proof", "identity", "signature", "download",
    "help", "www", "name", "नाम", "भारत", "सरकार", "जन्म", "लिंग", "पुरुष",
    "महिला", "हस्ताक्षर", "आपकी", "पहचान", "कार्ड", "number", "संख्या",
    "disability", "certificate", "udid", "medical", "board", "hospital",
    "department", "social", "justice", "empowerment", "registration", "serial",
    "document", "card", "aadhar", "unique disability",
}
_ADDRESS_WORDS = {
    "s/o", "w/o", "c/o", "d/o", "house", "street", "road", "nagar", "colony",
    "district", "dist", "state", "pin", "pincode", "post", "village", "tehsil",
    "taluk", "block", "sector", "flat", "apartment", "lane", "marg", "po",
    "ps", "near", "behind", "opp", "opposite",
}


def _strip_name_label(line: str) -> str | None:
    match = _NAME_LABEL.match(line)
    if not match:
        return None
    value = match.group(1).strip(" :：-/|")
    value = re.sub(r"^(?:name|नाम)\s*", "", value, flags=re.IGNORECASE).strip(" :：-/|")
    return value or None


def _looks_like_name(line: str) -> bool:
    if not (3 <= len(line) <= 60):
        return False
    if any(char.isdigit() for char in line):
        return False
    if re.search(r"(?:^|\s)(?:s|w|c|d)\s*/\s*o\b", line, re.IGNORECASE):
        return False
    tokens = _tokens(line)
    if not (1 <= len(tokens) <= 5):
        return False
    if any(token in _NAME_STOP for token in tokens):
        return False
    if any(token in _ADDRESS_WORDS for token in tokens):
        return False

    letters = [char for char in line if char.isalpha()]
    if len(letters) < 3:
        return False
    devanagari = any("\u0900" <= char <= "\u097f" for char in letters)
    latin = sum(char.isascii() and char.isalpha() for char in letters)
    if latin / len(letters) < 0.6 and not devanagari:
        return False
    if re.search(r"[/\\@#$%^&*+=<>{}[\]]", line):
        return False
    return True


def _name_from_text(lines: list[str], dob_index: int | None) -> Field:
    candidates: list[tuple[float, str]] = []

    for index, line in enumerate(lines):
        # "Name: Ravi Kumar" on one line.
        inline = _strip_name_label(line)
        if inline and _looks_like_name(inline):
            score = 0.7
            if index <= len(lines) * 0.4:
                score += 0.05
            candidates.append((score, inline))
            continue

        # "Name" / "नाम" on a label line, value below it.
        if re.fullmatch(r"(?:name|नाम)\s*(?:[/|]\s*(?:name|नाम))?\s*[:：\-]?", line, re.IGNORECASE):
            for offset in (1, 2):
                if index + offset >= len(lines):
                    break
                value = _strip_name_label(lines[index + offset]) or lines[index + offset]
                if _looks_like_name(value):
                    candidates.append((0.82 - (offset - 1) * 0.08, value))
                    break
            continue

        if not _looks_like_name(line):
            continue

        score = 0.35
        if dob_index is not None:
            distance = dob_index - index
            if distance == 1:
                score += 0.26
            elif distance == 2:
                score += 0.17
            elif 0 < distance <= 4:
                score += 0.08
            elif distance < 0:
                score -= 0.1
        elif index <= 5:
            score += 0.12
        if index <= len(lines) * 0.45:
            score += 0.06
        if 2 <= len(_tokens(line)) <= 4:
            score += 0.05
        if re.fullmatch(r"[A-Z][A-Z .'-]+", line):
            score += 0.03
        candidates.append((score, line))

    if not candidates:
        return Field(None, 0.0, "Not found")

    score, value = max(candidates, key=lambda item: (item[0], len(item[1])))
    # A lone word (a state name on an address line, for example) needs a strong
    # position next to the DOB to count as a name.
    if score < 0.52:
        return Field(None, 0.0, "Not found")
    return Field(value, score)


# --------------------------------------------------------------------------
# Address
# --------------------------------------------------------------------------

_PINCODE = re.compile(r"(?<!\d)([1-9]\d{5})(?!\d)")
_ADDRESS_LABEL = re.compile(r"\b(address|पता|पूरा\s+पता|निवास)\b", re.IGNORECASE)
_ADDRESS_STOP = re.compile(
    r"^(?:disability|udid|unique\s+disability|certificate|name|dob|date\s+of\s+birth|"
    r"gender|sex|mobile|phone|blood\s+group|aadhaar|vid|uidai|signature|"
    r"issue\s+date|valid\s+(?:from|upto|till))\b",
    re.IGNORECASE,
)
_ADDRESS_HINT = {
    "s/o", "w/o", "c/o", "d/o", "house", "street", "road", "nagar", "colony",
    "district", "dist", "state", "post", "village", "tehsil", "taluk", "block",
    "sector", "flat", "apartment", "lane", "marg", "near", "behind", "opp",
    "opposite", "po", "ps", "no", "hno", "plot",
}


def _clean_address(parts: list[str]) -> str:
    parts = [part.strip(" ,;") for part in parts if part.strip(" ,;")]
    text = ", ".join(parts)
    text = re.sub(r"\s*,\s*", ", ", text)
    text = re.sub(r",\s*([,;])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;")
    return text


def _is_address_noise(line: str) -> bool:
    low = line.lower()
    if _AADHAAR_STRICT.search(line):
        return True
    return any(
        key in low
        for key in (
            "aadhaar", "आधार", "uidai", "unique identification", "government of india",
            "भारत सरकार", "date of birth", "जन्म", "gender", "लिंग", "male", "female",
            "vid", "help", "download", "www.",
        )
    )


def _address_from_text(
    lines: list[str],
    aadhaar_value: str | None,
    name_value: str | None = None,
    require_label: bool = False,
) -> tuple[Field, Field]:
    address_parts: list[str] = []
    label_index: int | None = None
    restart_parts: list[str] = []

    def is_name_line(line: str) -> bool:
        return bool(name_value) and line.strip() == name_value.strip()

    for index, line in enumerate(lines):
        match = _ADDRESS_LABEL.search(line)
        if not match:
            continue
        label_index = index
        rest = line[match.end() :].strip(" :：-—,;/|")
        rest = re.sub(r"^(?:address|पता|पूरा\s+पता|निवास)\s*[:：\-]?\s*", "", rest, flags=re.IGNORECASE)
        if rest:
            address_parts.append(rest)
            if _PINCODE.search(rest):
                break
        for follow in lines[index + 1 : index + 11]:
            if _is_address_noise(follow) or _ADDRESS_STOP.search(follow) or is_name_line(follow):
                break
            if follow.strip().lower().startswith(("name", "नाम")):
                break
            address_parts.append(follow)
            if _PINCODE.search(follow):
                break
        if address_parts:
            break

    if not address_parts and label_index is None and not require_label:
        # No label: use the lines leading up to a PIN code.
        for index, line in enumerate(lines):
            pin_match = _PINCODE.search(line)
            if not pin_match or _is_address_noise(line):
                continue
            if aadhaar_value:
                compact = aadhaar_value.replace(" ", "")
                if pin_match.group(1) in compact:
                    continue
            start = max(0, index - 6)
            window = [
                candidate
                for candidate in lines[start : index + 1]
                if not _is_address_noise(candidate) and not is_name_line(candidate)
            ]
            if len(window) >= 2 or _PINCODE.search(line):
                restart_parts = window
                break

    if restart_parts:
        address_parts = restart_parts

    if not address_parts:
        return Field(None, 0.0, "Not found"), Field(None, 0.0, "Not found")

    text = _clean_address(address_parts)
    pins = _PINCODE.findall(text)
    pincode = pins[-1] if pins else None

    has_label = label_index is not None
    has_address_word = bool(_ADDRESS_HINT.intersection(_tokens(text)))
    score = 0.0
    if has_label:
        score = 0.88 if pincode else 0.72
    elif pincode and has_address_word:
        score = 0.65
    elif pincode:
        score = 0.55
    elif has_address_word:
        score = 0.45

    if text and len(text) >= 12:
        note = None if pincode else "PIN code not found — check the last line"
        return Field(text, score, note), Field(pincode, 0.9 if pincode else 0.0, None)
    return Field(None, 0.0, "Not found"), Field(None, 0.0, "Not found")


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def extract_common_fields(
    text: str,
    *,
    allow_plain_dob: bool = False,
    require_address_label: bool = True,
) -> tuple[list[str], Field, Field, Field, Field, Field]:
    """Fields shared by every non-Aadhaar document.

    Issue dates on certificates are common, so an unlabeled date is not treated
    as a DOB here. Address extraction is label-led to avoid mistaking a 6-digit
    certificate number for a PIN code.
    """
    lines = _clean_lines(text or "")
    dob = _dob_from_text(lines, allow_plain=allow_plain_dob)
    dob_index = _find_dob_index(lines, dob)
    name = _name_from_text(lines, dob_index)
    gender = _gender_from_text(lines)
    address, pincode = _address_from_text(
        lines, None, name.value, require_label=require_address_label
    )
    return lines, name, dob, gender, address, pincode


def extract(text: str, side_hint: str = "auto") -> Extraction:
    """Extract name, Aadhaar number, DOB, gender, address and PIN from OCR text."""
    lines = _clean_lines(text or "")

    if not lines:
        empty = {
            key: Field(None, 0.0, "No readable text")
            for key in ("name", "aadhaar", "dob", "gender", "address", "pincode")
        }
        return Extraction(empty, "unknown", {"aadhaar_valid": None}, ["No readable text found."])

    aadhaar, checksum = _aadhaar_from_text(lines)

    dob = _dob_from_text(lines)
    dob_index = _find_dob_index(lines, dob)

    name = _name_from_text(lines, dob_index)
    gender = _gender_from_text(lines)
    address, pincode = _address_from_text(lines, aadhaar.value, name.value)

    detected_side = "unknown"
    if address.value and (pincode.value or len(address.value) > 24):
        detected_side = "back"
    elif aadhaar.value or dob.value or name.value:
        detected_side = "front"
    side = detected_side if detected_side != "unknown" else (side_hint if side_hint in ("front", "back") else "unknown")

    warnings: list[str] = []
    if not aadhaar.value:
        warnings.append("Aadhaar number not found.")
    elif checksum is False:
        warnings.append("Aadhaar checksum did not validate — check the number.")
    if not name.value:
        warnings.append("Name not found.")
    if not dob.value:
        warnings.append("Date of birth not found.")
    if not address.value:
        warnings.append("Address not found — scan the back of the card.")

    return Extraction(
        fields={
            "name": name,
            "aadhaar": aadhaar,
            "dob": dob,
            "gender": gender,
            "address": address,
            "pincode": pincode,
        },
        side=side,
        checks={"aadhaar_valid": checksum},
        warnings=warnings,
    )
