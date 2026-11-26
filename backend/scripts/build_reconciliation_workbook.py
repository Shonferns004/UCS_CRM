# -*- coding: utf-8 -*-
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = r"C:\Users\Shon\AppData\Local\Temp\opencode\reconciliation.json"
OUT = r"C:\Users\Shon\Desktop\pro\UCS_CRM\AFLF_vs_BSCT_Donor_Reconciliation.xlsx"

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

c = data["counts"]
rows = data["rows"]
aonly = [r for r in rows if r["side"] == "AFLF Only"]
bonly = [r for r in rows if r["side"] == "BSCT Only"]
aonly_sorted = sorted(aonly, key=lambda r: (
    0 if r["bsctDnd"] else 1,
    0 if not r["bsctStation"] else 1,
    r["bsctStation"] or "",
    r["name"],
))
bonly_sorted = sorted(bonly, key=lambda r: (
    0 if not r["aflfStation"] else 1,
    r["aflfStation"] or "",
    r["name"],
))

TITLE = Font(bold=True, size=15, color="FF0F172A")
SUB = Font(italic=True, size=9, color="FF475569")
H = Font(bold=True, color="FFFFFFFF", size=10)
B = Font(size=10)
BB = Font(bold=True, size=10)
SECTION = Font(bold=True, size=11, color="FF0F172A")
HEAD_FILL = PatternFill("solid", fgColor="FF1F2937")
SECTION_FILL = PatternFill("solid", fgColor="FFF1F5F9")
RED_FILL = PatternFill("solid", fgColor="FFFEE2E2")
YELLOW_FILL = PatternFill("solid", fgColor="FFFEF3C7")
GREEN_FILL = PatternFill("solid", fgColor="FFDCFCE7")
THIN = Side(style="thin", color="FFE2E8F0")
BORDER = Border(bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")


def header(ws, cols, row=1):
    for i, name in enumerate(cols, 1):
        cell = ws.cell(row=row, column=i, value=name)
        cell.font = H
        cell.fill = HEAD_FILL
        cell.alignment = CENTER
        cell.border = BORDER


def widths(ws, mapping):
    for col, w in mapping.items():
        ws.column_dimensions[col].width = w


def section(ws, row, text):
    cell = ws.cell(row=row, column=1, value=text)
    cell.font = SECTION
    cell.fill = SECTION_FILL
    return row + 1


wb = Workbook()

# ---------------------------------------------------------------- Summary
ws = wb.active
ws.title = "Summary"
widths(ws, {"A": 46, "B": 18, "C": 18, "D": 42})
ws["A1"] = "AFLF vs BSCT — Donor Reconciliation"
ws["A1"].font = TITLE
ws["A2"] = "As on 25-Nov-2026  •  Source: latest station assignments (AOD/BOD) + active DND"
ws["A2"].font = SUB
ws.append([])

r = 4
r = section(ws, r, "1. Key numbers")
header(ws, ["Metric", "Value", "Notes", ""], row=r)
r += 1
key_rows = [
    ("AFLF AOD donors", c["aod"], "AOD-1 to AOD-18, latest assignment"),
    ("BSCT BOD donors", c["bod"], "BOD-1 to BOD-18, latest assignment"),
    ("Common in both lists", c["common"], "Same donor id in both"),
    ("Only in AFLF AOD", c["aonly"], "No BOD assignment / BFD or other BSCT station"),
    ("Only in BSCT BOD", c["bonly"], "No AOD assignment / AFD or no AFLF assignment"),
    ("Net difference (AFLF − BSCT)", c["diff"], f"{c['aonly']} − {c['bonly']} = {c['diff']}"),
    ("Total unique donors (both lists)", c["unique"], "Common + AFLF-only + BSCT-only"),
]
for k, v, note in key_rows:
    ws.cell(row=r, column=1, value=k).font = BB if "difference" in k or "unique" in k else B
    ws.cell(row=r, column=2, value=v).font = BB
    ws.cell(row=r, column=3, value=note).font = B
    ws.cell(row=r, column=1).border = BORDER
    ws.cell(row=r, column=2).border = BORDER
    ws.cell(row=r, column=3).border = BORDER
    r += 1
ws.cell(row=r, column=1, value="Note: BSCT count live data ke hisaab se badal sakta hai. Aapke purane file mein 18,535 tha; current export mein 18,536 hai.").font = SUB
r += 2

r = section(ws, r, f"2. AFLF-only {c['aonly']} donors — BSCT assignment kahan hai?")
header(ws, ["BSCT assignment", "Donors", "Explanation", ""], row=r)
r += 1
breakdown = data["breakdown"]
labels = {
    "No BSCT assignment": "BSCT mein koi assignment hi nahi",
    "BFD": "BSCT ke BFD (field/bulk) station par",
    "PS": "BSCT PS par",
    "NA": "BSCT NA par",
    "AJ": "BSCT AJ par",
    "L": "BSCT L par",
}
order = ["No BSCT assignment", "BFD", "PS", "NA", "AJ", "L"]
for k in order:
    if k not in breakdown:
        continue
    ws.cell(row=r, column=1, value=k).font = B
    ws.cell(row=r, column=2, value=breakdown[k]).font = BB
    ws.cell(row=r, column=3, value=labels.get(k, "")).font = B
    for col in (1, 2, 3):
        ws.cell(row=r, column=col).border = BORDER
    r += 1
ws.cell(row=r, column=1, value="Total").font = BB
ws.cell(row=r, column=2, value=c["aonly"]).font = BB
for col in (1, 2, 3):
    ws.cell(row=r, column=col).fill = SECTION_FILL
    ws.cell(row=r, column=col).border = BORDER
r += 2

r = section(ws, r, f"3. In {c['aonly']} donors, DND status")
header(ws, ["DND / Status", "Donors", "Notes", ""], row=r)
r += 1
d = data["aonlyDnd"]
dnd_rows = [
    ("BSCT active DND", d["bsct"], f"Sirf {d['bsct']} — DND is difference ki main wajah nahi hai"),
    ("AFLF active DND", d["aflf"], ""),
    ("MANN active DND", d["mann"], ""),
    ("Any DND (unique donors)", d["any"], f"{d['bsct']} + {d['aflf']} + {d['mann']} = {d['bsct'] + d['aflf'] + d['mann']} rows, {d['any']} unique (kuch donors multiple DND)"),
    ("No DND", d["none"], "Kisi bhi NGO ke DND mein nahi"),
    ("Total", d["total"], ""),
]
for k, v, note in dnd_rows:
    ws.cell(row=r, column=1, value=k).font = BB if k in ("BSCT active DND", "Total") else B
    ws.cell(row=r, column=2, value=v).font = BB if k in ("BSCT active DND", "Total") else B
    ws.cell(row=r, column=3, value=note).font = B
    for col in (1, 2, 3):
        ws.cell(row=r, column=col).border = BORDER
    if k == "BSCT active DND":
        for col in (1, 2, 3):
            ws.cell(row=r, column=col).fill = RED_FILL
    r += 1
r += 1

r = section(ws, r, f"4. BSCT DND wale {d['bsct']} donors (AFLF-only list mein)")
header(ws, ["Donor", "Mobile", "AFLF station", "BSCT DND station"], row=r)
r += 1
for rw in [x for x in aonly if x["bsctDnd"]]:
    ws.cell(row=r, column=1, value=rw["name"]).font = B
    ws.cell(row=r, column=2, value=rw["mobile"]).font = B
    ws.cell(row=r, column=3, value=rw["aflfStation"]).font = B
    ws.cell(row=r, column=4, value=rw["bsctDnd"]).font = B
    for col in (1, 2, 3, 4):
        ws.cell(row=r, column=col).border = BORDER
    r += 1
r += 1

r = section(ws, r, f"5. BSCT-only {c['bonly']} donors — AFLF assignment kahan hai?")
header(ws, ["AFLF assignment", "Donors", "Explanation", ""], row=r)
r += 1
bonly_labels = {
    "No AFLF assignment": "AFLF mein koi assignment hi nahi",
    "AFD": "AFLF ke AFD (field/bulk) station par",
}
for k, v in data["bonlyBreakdown"].items():
    ws.cell(row=r, column=1, value=k).font = B
    ws.cell(row=r, column=2, value=v).font = BB
    ws.cell(row=r, column=3, value=bonly_labels.get(k, "")).font = B
    for col in (1, 2, 3):
        ws.cell(row=r, column=col).border = BORDER
    r += 1
ws.cell(row=r, column=1, value="Total").font = BB
ws.cell(row=r, column=2, value=c["bonly"]).font = BB
for col in (1, 2, 3):
    ws.cell(row=r, column=col).fill = SECTION_FILL
    ws.cell(row=r, column=col).border = BORDER
r += 2

r = section(ws, r, "6. Sir ko samjhane ke liye (short)")
notes = [
    "Yeh do alag NGO ke station assignment lists hain — ek hi list ke do hisse nahi hain.",
    f"{c['common']:,} donors dono lists mein common hain.",
    f"AFLF mein {c['aonly']} extra donors hain: {breakdown.get('No BSCT assignment', 0)} ka BSCT assignment hi nahi, "
    f"{c['aonly'] - breakdown.get('No BSCT assignment', 0)} BSCT ke BFD/PS/NA/AJ/L par hain.",
    f"BSCT mein {c['bonly']} extra donors hain: {data['bonlyBreakdown'].get('No AFLF assignment', 0)} ka AFLF assignment nahi, "
    f"{data['bonlyBreakdown'].get('AFD', 0)} AFLF ke AFD par hain.",
    f"{c['aonly']} − {c['bonly']} = {c['diff']} — isliye {c['diff']} ka net difference hai.",
    f"{c['aonly']} mein se sirf {data['aonlyDnd']['bsct']} BSCT DND mein hain — DND is difference ki main wajah nahi hai.",
    f"Total unique donors dono ko mila kar {c['unique']:,} hain. Koi donor missing nahi hai.",
]
for n in notes:
    ws.cell(row=r, column=1, value="•").font = B
    ws.cell(row=r, column=1).alignment = CENTER
    cell = ws.cell(row=r, column=2, value=n)
    cell.font = B
    cell.alignment = LEFT
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    ws.row_dimensions[r].height = 28
    r += 1

# ---------------------------------------------------------------- AFLF only
ws = wb.create_sheet(f"AFLF Only ({c['aonly']})")
cols = ["Sr", "Donor Name", "Mobile", "AFLF Station", "BSCT Assignment", "BSCT Station Type", "BSCT DND", "BSCT DND Station", "AFLF DND", "MANN DND"]
widths(ws, {"A": 6, "B": 30, "C": 14, "D": 13, "E": 22, "F": 14, "G": 11, "H": 20, "I": 18, "J": 18})
header(ws, cols)
for i, rw in enumerate(aonly_sorted, 1):
    bsct = rw["bsctStation"] or "No BSCT assignment"
    btype = "No BSCT" if not rw["bsctStation"] else (rw["bsctStation"].split("-")[0] or rw["bsctStation"])
    vals = [i, rw["name"], rw["mobile"], rw["aflfStation"], bsct, btype, "Yes" if rw["bsctDnd"] else "No", rw["bsctDnd"], rw["aflfDnd"], rw["mannDnd"]]
    for j, v in enumerate(vals, 1):
        cell = ws.cell(row=i + 1, column=j, value=v)
        cell.font = B
        cell.border = BORDER
        cell.alignment = LEFT if j in (2, 5, 8, 9, 10) else CENTER
    if rw["bsctDnd"]:
        for j in range(1, len(cols) + 1):
            ws.cell(row=i + 1, column=j).fill = RED_FILL
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:J{len(aonly) + 1}"

# ---------------------------------------------------------------- BSCT only
ws = wb.create_sheet(f"BSCT Only ({c['bonly']})")
cols = ["Sr", "Donor Name", "Mobile", "BSCT Station", "AFLF Assignment", "AFLF Station Type", "BSCT DND", "AFLF DND", "MANN DND"]
widths(ws, {"A": 6, "B": 30, "C": 14, "D": 13, "E": 22, "F": 14, "G": 11, "H": 18, "I": 18})
header(ws, cols)
for i, rw in enumerate(bonly_sorted, 1):
    aflf = rw["aflfStation"] or "No AFLF assignment"
    atype = "No AFLF" if not rw["aflfStation"] else (rw["aflfStation"].split("-")[0] or rw["aflfStation"])
    vals = [i, rw["name"], rw["mobile"], rw["bsctStation"], aflf, atype, "Yes" if rw["bsctDnd"] else "No", rw["aflfDnd"], rw["mannDnd"]]
    for j, v in enumerate(vals, 1):
        cell = ws.cell(row=i + 1, column=j, value=v)
        cell.font = B
        cell.border = BORDER
        cell.alignment = LEFT if j in (2, 5, 8, 9) else CENTER
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:I{len(bonly) + 1}"

# ---------------------------------------------------------------- All donors
ws = wb.create_sheet(f"All Donors ({c['unique']})")
cols = ["Sr", "Donor Name", "Mobile", "Side", "In AFLF AOD", "AFLF Station", "In BSCT BOD", "BSCT Station", "BSCT DND Station", "AFLF DND Station", "MANN DND Station"]
widths(ws, {"A": 6, "B": 30, "C": 14, "D": 12, "E": 12, "F": 14, "G": 12, "H": 14, "I": 20, "J": 18, "K": 18})
header(ws, cols)
for i, rw in enumerate(rows, 1):
    vals = [
        i, rw["name"], rw["mobile"], rw["side"],
        "Yes" if rw["inAod"] else "No", rw["aflfStation"] or "",
        "Yes" if rw["inBod"] else "No", rw["bsctStation"] or "",
        rw["bsctDnd"] or "", rw["aflfDnd"] or "", rw["mannDnd"] or "",
    ]
    for j, v in enumerate(vals, 1):
        cell = ws.cell(row=i + 1, column=j, value=v)
        cell.font = B
        cell.border = BORDER
        cell.alignment = LEFT if j in (2, 6, 8, 9, 10, 11) else CENTER
    if rw["side"] == "AFLF Only":
        for j in range(1, len(cols) + 1):
            ws.cell(row=i + 1, column=j).fill = YELLOW_FILL
    elif rw["side"] == "BSCT Only":
        for j in range(1, len(cols) + 1):
            ws.cell(row=i + 1, column=j).fill = GREEN_FILL
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:K{len(rows) + 1}"

wb.save(OUT)
print("saved", OUT)
