# -*- coding: utf-8 -*-
"""Build an NGO donor workbook, station-wise and average-donation-wise."""
import json
import os
import re
from collections import Counter, OrderedDict
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

NGO_CODE = os.environ.get("NGO_CODE", "BSCT").upper()
NGO_NAME = os.environ.get("NGO_NAME", "BSCT")
PREFIX = os.environ.get("STATION_PREFIX", "BOD").upper()
MAX_STATION = int(os.environ.get("MAX_STATION_NO", "18"))
SRC = os.environ.get(
    "SRC_FILE",
    rf"C:\Users\Shon\AppData\Local\Temp\opencode\{NGO_CODE.lower()}_donors.ndjson",
)
OUT = os.environ.get(
    "OUT_FILE",
    rf"C:\Users\Shon\Desktop\pro\UCS_CRM\{NGO_NAME}_{PREFIX}_Donors_Stationwise_Average_Range.xlsx",
)

AS_ON = date(2026, 11, 24)
STATUS_CUTOFF = date(2025, 11, 24)  # 1 year before AS_ON: on/after this = Active

CATEGORIES = [
    ("Premium",  "PREMIUM DONORS",      "Average \u20b95,000 and above",          "FFB8860B"),
    ("High",     "HIGH VALUE DONORS",   "Average \u20b92,000 \u2013 \u20b94,999",   "FF6A1B9A"),
    ("Medium",   "MEDIUM DONORS",       "Average \u20b9500 \u2013 \u20b91,999",     "FF1565C0"),
    ("Low",      "LOW VALUE DONORS",    "Average \u20b9251 \u2013 \u20b9499",       "FF2E7D32"),
    ("BelowLow", "BELOW LOW",           "Average \u20b90 \u2013 \u20b9250",         "FF616161"),
]
CAT_ORDER = {c[0]: i for i, c in enumerate(CATEGORIES)}
CAT_META = {c[0]: c for c in CATEGORIES}
CAT_RANGE = {
    "Premium": "\u20b95,000+",
    "High": "\u20b92,000 \u2013 \u20b94,999",
    "Medium": "\u20b9500 \u2013 \u20b91,999",
    "Low": "\u20b9251 \u2013 \u20b9499",
    "BelowLow": "\u20b90 \u2013 \u20b9250",
}

HEADER_FILL = PatternFill("solid", fgColor="FF1F2937")
HEADER_FONT = Font(bold=True, color="FFFFFFFF", size=10)
TITLE_FONT = Font(bold=True, color="FF0F172A", size=15)
SUBTITLE_FONT = Font(italic=True, color="FF475569", size=9)
SECTION_FONT = Font(bold=True, color="FFFFFFFF", size=10)
BODY_FONT = Font(size=10)
THIN = Side(style="thin", color="FFE2E8F0")
BORDER = Border(bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center")
RIGHT = Alignment(horizontal="right", vertical="center")


def parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def age_label(d):
    """Time since last donation: 1 Month ... 11 Months, then 1 Year 2 Months."""
    if d is None:
        return "Date Not Available"
    years = AS_ON.year - d.year
    months = AS_ON.month - d.month
    if AS_ON.day < d.day:
        months -= 1
    total = years * 12 + months
    if total < 0:
        total = 0
    if total == 0:
        return "Less than 1 Month"
    if total < 12:
        return f"{total} Month" if total == 1 else f"{total} Months"
    y, m = divmod(total, 12)
    ys = f"{y} Year" if y == 1 else f"{y} Years"
    if m == 0:
        return ys
    ms = f"{m} Month" if m == 1 else f"{m} Months"
    return f"{ys} {ms}"


def frequency_bucket(gap_months):
    """Average gap between donations -> donor type."""
    n = max(1, int(gap_months + 0.5))
    if n >= 13:
        return "More Than Yearly"
    if n == 3:
        return "Quarterly Donor (3 Months)"
    if n == 6:
        return "Half-Yearly Donor (6 Months)"
    if n == 12:
        return "Yearly Donor (12 Months)"
    return f"{n} Month Donor" if n > 1 else "1 Month Donor"


def frequency_label(r):
    cnt = r["count"]
    if cnt <= 0:
        return "No Donation"
    if cnt == 1:
        return "One-Time Donor"
    first, last = r["_first"], r["_last"]
    if first and last and last >= first:
        days = (last - first).days
        return frequency_bucket(days / 30.4375 / (cnt - 1))
    if r["receipt_count"] >= 2 and r["_rc_first"] and r["_rc_last"]:
        days = (r["_rc_last"] - r["_rc_first"]).days
        return frequency_bucket(days / 30.4375 / (r["receipt_count"] - 1))
    if r["log_count"] >= 2 and r["_log_first"] and r["_log_last"]:
        days = (r["_log_last"] - r["_log_first"]).days
        return frequency_bucket(days / 30.4375 / (r["log_count"] - 1))
    return "Not Available"


def category_of(r):
    # No inactive bucket: every donor is classified by average donation.
    if r["count"] <= 0 or r["total"] <= 0:
        return "BelowLow"
    avg = r["total"] / r["count"]
    if avg >= 5000:
        return "Premium"
    if avg >= 2000:
        return "High"
    if avg >= 500:
        return "Medium"
    if avg >= 251:
        return "Low"
    return "BelowLow"


def station_sort_key(s):
    m = re.match(rf"^{PREFIX}-(\d+)$", s)
    return int(m.group(1)) if m else 999


print("loading...")
rows = []
with open(SRC, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        r["_last"] = parse_date(r["last"])
        r["_age"] = age_label(r["_last"])
        r["_first"] = parse_date(r.get("first"))
        r["_rc_first"] = parse_date(r.get("receipt_first"))
        r["_rc_last"] = parse_date(r.get("receipt_last"))
        r["_log_first"] = parse_date(r.get("log_first"))
        r["_log_last"] = parse_date(r.get("log_last"))
        r["_freq"] = frequency_label(r)
        r["_avg"] = (r["total"] / r["count"]) if r["count"] > 0 else 0.0
        r["_cat"] = category_of(r)
        # Active = last donation in the past 1 year. Donors with no recorded date
        # are counted as Inactive but flagged in the "Date Available" column.
        r["_status"] = "Active" if (r["_last"] is not None and r["_last"] > STATUS_CUTOFF) else "Inactive"
        r["_date_available"] = "Yes" if r["_last"] is not None else "No"
        r["_station"] = (r["station"] or "").strip()
        rows.append(r)
print("loaded", len(rows))

# Only the requested station prefix (e.g. BOD-1..BOD-18) is kept.
_loaded_count = len(rows)
rows = [
    r for r in rows
    if re.match(rf"^{PREFIX}-(\d+)$", r["_station"])
    and int(r["_station"].split("-")[1]) <= MAX_STATION
]
print(f"excluded non-{PREFIX}-1..{MAX_STATION} donors:", _loaded_count - len(rows), "| remaining:", len(rows))

MAIN_STATIONS = sorted(
    {r["_station"] for r in rows if re.match(rf"^{PREFIX}-\d+$", r["_station"])},
    key=station_sort_key,
)
OTHER_NAME = "Other & Unassigned"


def display_name(name):
    return name

by_sheet = OrderedDict()
for st in MAIN_STATIONS:
    by_sheet[st] = [r for r in rows if r["_station"] == st]
other = [r for r in rows if r["_station"] not in MAIN_STATIONS]
if other:
    by_sheet[OTHER_NAME] = other

# sort donors inside each station: category order, then average desc, then name
for lst in by_sheet.values():
    lst.sort(key=lambda r: (CAT_ORDER[r["_cat"]], -r["_avg"], r["name"].lower()))

all_sorted = []
for sheet, lst in by_sheet.items():
    all_sorted.extend(lst)

print("stations:", len(by_sheet), "donors:", len(all_sorted))

wb = Workbook(write_only=True)

# ---------------------------------------------------------------- helpers
def cell(ws, value, font=None, fill=None, align=None, fmt=None, border=None):
    c = WriteOnlyCell(ws, value=value)
    if font:
        c.font = font
    if fill:
        c.fill = fill
    if align:
        c.alignment = align
    if fmt:
        c.number_format = fmt
    if border:
        c.border = border
    return c


def title(ws, text, sub=None, widths=None):
    r1 = [cell(ws, text, font=TITLE_FONT, align=LEFT)]
    ws.append(r1)
    if sub:
        ws.append([cell(ws, sub, font=SUBTITLE_FONT, align=LEFT)])
    ws.append([])
    if widths:
        for col, w in widths.items():
            ws.column_dimensions[col].width = w


DONOR_WIDTHS = {"A": 6, "B": 30, "C": 15, "D": 16, "E": 12, "F": 16, "G": 14, "H": 22}


def write_header(ws):
    vals = ["Sr", "Donor Name", "Mobile", "Total Donation (\u20b9)", "No. of Donations",
            "Average Donation (\u20b9)", "Last Donation", "FRO / Agent"]
    ws.append([cell(ws, v, font=HEADER_FONT, fill=HEADER_FILL, align=CENTER) for v in vals])


def write_donor(ws, sr, r):
    last = r["_last"]
    ws.append([
        cell(ws, sr, font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, r["name"], font=BODY_FONT, align=LEFT, border=BORDER),
        cell(ws, r["mobile"], font=BODY_FONT, align=LEFT, border=BORDER),
        cell(ws, r["total"], font=BODY_FONT, align=RIGHT, fmt='#,##0', border=BORDER),
        cell(ws, r["count"], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, round(r["_avg"], 2), font=BODY_FONT, align=RIGHT, fmt='#,##0.00', border=BORDER),
        cell(ws, last, font=BODY_FONT, align=CENTER, fmt='dd-mmm-yyyy', border=BORDER),
        cell(ws, r["fro"], font=BODY_FONT, align=LEFT, border=BORDER),
    ])


def add_station_sheet(name, lst, is_other=False):
    ws = wb.create_sheet(title=display_name(name)[:31])
    title_txt = display_name(name) if not is_other else f"Other / Unassigned {NGO_NAME} Donors"
    fros = sorted({r["fro"] for r in lst if r["fro"]})
    fro_txt = ", ".join(fros[:3]) + (" + more" if len(fros) > 3 else "") if fros else "Not assigned"
    sub = (f"{NGO_NAME} \u2022 FRO / Agent: {fro_txt} \u2022 Total donors: {len(lst):,} "
           f"\u2022 Total collected: \u20b9{sum(r['total'] for r in lst):,.0f} \u2022 As on 24-Nov-2026")
    title(ws, title_txt + f" \u2014 {NGO_NAME} Donors (Average Donation-wise)", sub, DONOR_WIDTHS)
    ws.freeze_panes = "A5"

    sr = 0
    for code, label, desc, color in CATEGORIES:
        group = [r for r in lst if r["_cat"] == code]
        if not group:
            continue
        fill = PatternFill("solid", fgColor=color)
        ws.append([cell(ws, f"{label}  \u2014  {desc}  ({len(group):,} donors)",
                        font=SECTION_FONT, fill=fill, align=LEFT)])
        write_header(ws)
        for r in group:
            sr += 1
            write_donor(ws, sr, r)
        ws.append([])


# ---------------------------------------------------------------- Read Me
ws = wb.create_sheet(title="Read Me")
ws.column_dimensions["A"].width = 30
ws.column_dimensions["B"].width = 110
title(ws, f"{NGO_NAME} Donor List \u2014 Station-wise, by Average Donation Range")

readme = [
    ("Report date", "24-Nov-2026"),
    ("Scope", f"Only {NGO_NAME} donors whose latest station assignment is {PREFIX}-1 to {PREFIX}-{MAX_STATION}. "
               f"A donor is placed under the station of their latest {NGO_NAME} assignment."),
    ("Excluded", "All other station groups, including bulk field stations, PS, unassigned and other values, are excluded from this workbook."),
    ("Donor count", f"{len(all_sorted):,} donors across {len(by_sheet):,} station groups."),
    ("Average donation", "Average = the donor's total donations divided by the number of donations. "
                          "Example: 3 donations of \u20b9100 + \u20b9200 + \u20b9300 = \u20b9600 total \u00f7 3 = \u20b9200 average."),
    ("Premium", "Average donation \u20b95,000 and above."),
    ("High value", "Average donation \u20b92,000 to \u20b94,999."),
    ("Medium", "Average donation \u20b9500 to \u20b91,999."),
    ("Low value", "Average donation \u20b9251 to \u20b9499."),
    ("Below Low", "Average donation \u20b90 to \u20b9250."),
    ("Category vs Status", "Category is based only on average donation. Status is separate: Active = last donation after 24-Nov-2025 "
                            "(less than 1 year); Inactive = last donation on/before 24-Nov-2025 (1 year to 10+ years)."),
    ("NGO-specific amounts", "Total donation, number of donations, average, last donation date and frequency are calculated ONLY from "
                              "receipts issued under this NGO. Donations made to other NGOs are not included."),
    ("Included donors", "All donors with a latest station assignment in the listed stations are included, so the total matches the CRM panel. "
                         "Donors with no receipt under this NGO appear in Below Low with 0 donations."),
    ("Last Donation Age", "Time since the donor's last donation. Up to 11 months it shows 1 Month, 2 Months, etc.; 12 months and above "
                           "shows 1 Year, 1 Year 2 Months, etc. 'Date Not Available' means no recorded date."),
    ("Donation Frequency", "Average gap between the donor's dated donations. Example: 12 donations over 12 months = 1 Month Donor; "
                            "3 months = Quarterly; 6 months = Half-Yearly; 12 months = Yearly. One-time donors are shown separately; "
                            "'Not Available' means there are not enough dated donations to calculate it."),
    ("Data note", "Voided receipts and receipts with zero amount are ignored. Donors with no receipt under this NGO are placed in Below Low with 0 donations."),
    ("Source", "UCS CRM: receipts (NGO-specific donation amount, count and dates), donor_profiles (donor name/mobile), "
                f"fro_assignments (station and FRO), workers (FRO name), ngos ({NGO_CODE})."),
    ("Sheet guide", f"Summary = {PREFIX} station-wise totals. Master List = every {PREFIX} donor with Category, Range, Status and Frequency for pivoting. "
                     f"{PREFIX}-1 to {PREFIX}-{MAX_STATION} = one sheet per station."),
]
ws.append([])
for k, v in readme:
    ws.append([cell(ws, k, font=Font(bold=True, size=10), align=LEFT),
               cell(ws, v, font=BODY_FONT, align=LEFT)])

# ---------------------------------------------------------------- Summary
ws = wb.create_sheet(title="Summary")
widths = {"A": 18, "B": 26, "C": 12, "D": 13, "E": 13, "F": 14, "G": 12, "H": 13, "I": 18, "J": 16}
for col, w in widths.items():
    ws.column_dimensions[col].width = w
title(ws, f"{NGO_NAME} \u2014 Station-wise Donor Summary (by Average Donation)", "As on 24-Nov-2026", widths)

summary_header = ["Station", "FRO / Agent", "Premium\n(5k+)", "High\n(2k-4,999)",
                  "Medium\n(500-1,999)", "Low\n(251-499)", "Below Low\n(0-250)",
                  "Total\nDonors", "Total Donations (\u20b9)", "Overall Avg (\u20b9)"]
ws.append([cell(ws, v, font=HEADER_FONT, fill=HEADER_FILL, align=CENTER) for v in summary_header])

for name, lst in by_sheet.items():
    counts = Counter(r["_cat"] for r in lst)
    total = sum(r["total"] for r in lst)
    cnt = sum(r["count"] for r in lst)
    fros = sorted({r["fro"] for r in lst if r["fro"]})
    fro_txt = (", ".join(fros[:3]) + (f" + {len(fros) - 3} more" if len(fros) > 3 else "")) if fros else "\u2014"
    vals = [display_name(name), fro_txt, counts.get("Premium", 0), counts.get("High", 0), counts.get("Medium", 0),
            counts.get("Low", 0), counts.get("BelowLow", 0), len(lst), total,
            (total / sum(1 for r in lst if r["count"] > 0) if any(r["count"] > 0 for r in lst) else 0)]
    ws.append([
        cell(ws, vals[0], font=Font(bold=True, size=10), align=LEFT, border=BORDER),
        cell(ws, vals[1], font=BODY_FONT, align=LEFT, border=BORDER),
        *[cell(ws, vals[i], font=BODY_FONT, align=CENTER, border=BORDER) for i in range(2, 7)],
        cell(ws, vals[7], font=Font(bold=True, size=10), align=RIGHT, fmt='#,##0', border=BORDER),
        cell(ws, vals[8], font=BODY_FONT, align=RIGHT, fmt='#,##0', border=BORDER),
        cell(ws, round(vals[9], 2), font=BODY_FONT, align=RIGHT, fmt='#,##0.00', border=BORDER),
    ])

counts = Counter(r["_cat"] for r in all_sorted)
total = sum(r["total"] for r in all_sorted)
paid_count = sum(1 for r in all_sorted if r["count"] > 0)
ws.append([
    cell(ws, "GRAND TOTAL", font=Font(bold=True, size=10, color="FFFFFFFF"), fill=HEADER_FILL, align=LEFT),
    cell(ws, "", font=BODY_FONT, fill=PatternFill("solid", fgColor="FFF1F5F9"), border=BORDER),
    *[cell(ws, counts.get(c[0], 0), font=Font(bold=True, size=10), fill=PatternFill("solid", fgColor="FFF1F5F9"), align=CENTER, border=BORDER) for c in CATEGORIES],
    cell(ws, len(all_sorted), font=Font(bold=True, size=10), fill=PatternFill("solid", fgColor="FFF1F5F9"), align=RIGHT, fmt='#,##0', border=BORDER),
    cell(ws, total, font=Font(bold=True, size=10), fill=PatternFill("solid", fgColor="FFF1F5F9"), align=RIGHT, fmt='#,##0', border=BORDER),
    cell(ws, round(total / paid_count, 2) if paid_count else 0, font=Font(bold=True, size=10), fill=PatternFill("solid", fgColor="FFF1F5F9"), align=RIGHT, fmt='#,##0.00', border=BORDER),
])

# ---------------------------------------------------------------- Master
ws = wb.create_sheet(title="Master List")
mw = {"A": 6, "B": 18, "C": 16, "D": 22, "E": 10, "F": 10, "G": 30, "H": 15, "I": 16, "J": 12, "K": 16, "L": 14, "M": 18, "N": 26, "O": 22}
for col, w in mw.items():
    ws.column_dimensions[col].width = w
title(ws, f"{NGO_NAME} \u2014 All Donors (Station, Average Range, Active/Inactive)", f"{len(all_sorted):,} donors \u2022 As on 24-Nov-2026", mw)
master_header = ["Sr", "Station", "Category", "Range (Avg Donation)", "Status", "Date Available", "Donor Name", "Mobile",
                 "Total Donation (\u20b9)", "No. of Donations", "Average Donation (\u20b9)", "Last Donation",
                 "Last Donation Age", "Donation Frequency", "FRO / Agent"]
ws.append([cell(ws, v, font=HEADER_FONT, fill=HEADER_FILL, align=CENTER) for v in master_header])
ws.freeze_panes = "A5"

for i, r in enumerate(all_sorted, 1):
    label = CAT_META[r["_cat"]][1].title()
    status_font = Font(size=10, bold=True, color="FF15803D" if r["_status"] == "Active" else "FFB91C1C")
    ws.append([
        cell(ws, i, font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, display_name(r["_station"]) or "Unassigned", font=Font(bold=True, size=10), align=LEFT, border=BORDER),
        cell(ws, label, font=BODY_FONT, align=LEFT, border=BORDER),
        cell(ws, CAT_RANGE[r["_cat"]], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, r["_status"], font=status_font, align=CENTER, border=BORDER),
        cell(ws, r["_date_available"], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, r["name"], font=BODY_FONT, align=LEFT, border=BORDER),
        cell(ws, r["mobile"], font=BODY_FONT, align=LEFT, border=BORDER),
        cell(ws, r["total"], font=BODY_FONT, align=RIGHT, fmt='#,##0', border=BORDER),
        cell(ws, r["count"], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, round(r["_avg"], 2), font=BODY_FONT, align=RIGHT, fmt='#,##0.00', border=BORDER),
        cell(ws, r["_last"], font=BODY_FONT, align=CENTER, fmt='dd-mmm-yyyy', border=BORDER),
        cell(ws, r["_age"], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, r["_freq"], font=BODY_FONT, align=CENTER, border=BORDER),
        cell(ws, r["fro"], font=BODY_FONT, align=LEFT, border=BORDER),
    ])

# ---------------------------------------------------------------- Station sheets
for name, lst in by_sheet.items():
    add_station_sheet(name, lst, is_other=(name == OTHER_NAME))

print("saving...")
wb.save(OUT)
print("saved", OUT)
