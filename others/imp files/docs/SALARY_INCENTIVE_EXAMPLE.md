# Salary & Incentive Example: 3-Month vs 6-Month Joiner + Sunday-Only Work

## Scenario Overview
- **Monthly Target:** ₹200,000
- **Monthly Salary:** ₹15,000
- **Work Pattern:** Only Sundays (1 Sunday per week × ~4-5 Sundays per month)
- **Calculation Month:** March 2025 (31 days, ~4-5 Sundays)

---

## 1. SUNDAY COLLECTIONS (Only Sundays Worked)

March 2025 Sundays: Mar 2, 9, 16, 23, 30 (5 Sundays)

Each Sunday's AKI range is different (see AKI_RANGES in incentive.js):
- **Sunday ranges:** 3750-6999→₂00, 7000-11999→₄00, 12000-13749→₈00, 13750-18999→₹1100, 19000+→₹1500

### Example Sunday Collections:

| Date | Day | Collection | AKI | Calculation |
|------|-----|------------|-----|-------------|
| **Mar 2** | Sunday | ₹7,500 | ₹400 | Sun: 7000-11999 → 400 |
| **Mar 9** | Sunday | ₹12,000 | ₹800 | Sun: 12000-13749 → 800 |
| **Mar 16** | Sunday | ₹5,500 | ₹360 | Wait, Mon range applies if work Mon... |

**Correction:** Worker works ONLY on Sundays, so only Sunday AKI ranges apply.

| Date | Day | Collection | AKI | Calculation |
|------|-----|------------|-----|-------------|
| **Mar 2** | Sunday | ₹7,500 | ₹400 | Sun: 7000-11999 → 400 |
| **Mar 9** | Sunday | ₹12,000 | ₹800 | Sun: 12000-13749 → 800 |
| **Mar 16** | Sunday | ₹5,500 | ₹180 | Sun: 3000-5999 → 180 (wait, 5500 is in 3000-5999) |
| **Mar 23** | Sunday | ₹15,000 | ₹1,500 | Sun: 19000+ → 1500 (but 15000 is in 13750-18999 → 1100!) |
| **Mar 30** | Sunday | ₹6,500 | ₹360 | Sun: 6000-8999 → 360 |

**Let me fix the March 23 calculation:**
- 15,000 on Sunday → Sun ranges: 13750-18999 → 1100 (NOT 1500 which is 19000+)
- Actually: 15,000 falls in 13750-18999 → **₹1,100**

**Let me fix March 16:**
- 5,500 on Sunday → Sun ranges: 3000-5999 → **₹180** (NOT 360 which is Mon range)

**Let me fix March 30:**
- 6,500 on Sunday → Sun ranges: 6000-8999 → **₹360** ✓

### Corrected Sunday-Only Example:

| Date | Day | Collection | AKI | Correct Calculation |
|------|-----|------------|-----|---------------------|
| **Mar 2** | Sunday | ₹7,500 | ₹400 | Sun: 7000-11999 → **400** ✓ |
| **Mar 9** | Sunday | ₹12,000 | ₹800 | Sun: 12000-13749 → **800** ✓ |
| **Mar 16** | Sunday | ₹5,500 | ₹180 | Sun: 3000-5999 → **180** (was mistakenly using Mon) ✓ |
| **Mar 23** | Sunday | ₹15,000 | ₹1,100 | Sun: 13750-18999 → **1,100** (not 1500) ✓ |
| **Mar 30** | Sunday | ₹6,500 | ₹360 | Sun: 6000-8999 → **360** ✓ |

**Total Collection (5 Sundays):** ₹7,500 + ₹12,000 + ₹5,500 + ₹15,000 + ₹6,500 = **₹46,500**

**Total AKI (5 Sundays):** ₹400 + ₹800 + ₹180 + ₹1,100 + ₹360 = **₹2,840**

**Monthly Achievement:** ₹46,500 (much below ₹200,000 target)

---

## 2. THREE-MONTH JOINER (New Joiner → ≤3 months employment)

### Worker: "Neeta" — Joined January 2025 (3 months by March 2025)

- **Months employed:** 3 (exactly at the boundary)
- **isNewJoiner:** `monthsEmployed <= 3` → **TRUE**

### Incentive Calculation:

Since target NOT met (₹46,500 < ₹200,000):
- **Monthly Incentive:** ₹0 (target not met)
- **AKI Payout:** `isNewJoiner ? totalAKI : Math.round(totalAKI / 2)` → **₹2,840** (full AKI because new joiner)
- **Total Incentive:** **₹2,840**

### Why? New joiner gets full AKI payout as incentive boost.

---

## 3. SIX-MONTH JOINER (Experienced Employee)

### Worker: "Rahul" — Joined October 2024 (6 months by March 2025)

- **Months employed:** 6
- **isNewJoiner:** `monthsEmployed <= 3` → **FALSE**

### Incentive Calculation:

Since target NOT met (₹46,500 < ₹200,000):
- **Monthly Incentive:** ₹0 (target not met)
- **AKI Payout:** `isNewJoiner ? totalAKI : Math.round(totalAKI / 2)` → **Math.round(₹2,840 / 2) = ₹1,420** (half AKI because experienced)
- **Total Incentive:** **₹1,420**

### Why? Experienced workers get only half AKI as incentive.

---

## 4. IF TARGET WAS MET (₹200,000+ with Sunday Work Only)

### To hit ₹200,000 with only 5 Sundays:
- **Required per Sunday:** ₹200,000 ÷ 5 = **₹40,000 per Sunday** (very high)

### More realistic: Mix of some other days + Sundays, or higher collections.

**Example hitting target with better collections:**
| Date | Collection | AKI |
|------|------------|-----|
| Mar 2 (Sun) | ₹45,000 | Sun: 37500+? Wait, let me check... Sun ranges go up to Infinity→1500. 45000 is in 19000+ → **₹1,500** |
| Mar 9 (Sun) | ₹42,000 | Sun: 19000+ → **₹1,500** |
| Mar 16 (Sun) | ₹38,000 | Sun: 19000+ → **₹1,500** |
| Mar 23 (Sun) | ₹35,000 | Sun: 19000+ → **₹1,500** |
| Mar 30 (Sun) | ₹40,000 | Sun: 19000+ → **₹1,500** |

**Total:** ₹200,000 ✓
**Total AKI:** ₹1,500 × 5 = **₹7,500**

### With target met:

**3-Month Joiner (Neeta):**
- Overage = ₹200,000 - ₹200,000 = ₹0 (exactly at target)
- Actually if over ₹200,000, say ₹210,000:
- Monthly Incentive = Math.round(₹10,000 × 0.1) = **₹1,000**
- AKI Payout = **₹7,500** (full, new joiner)
- **Total = ₹8,500**

**6-Month Joiner (Rahul):**
- Monthly Incentive = **₹1,000**
- AKI Payout = Math.round(₹7,500 / 2) = **₹3,750**
- **Total = ₹4,750**

---

## 5. KEY DIFFERENCES SUMMARY

| Aspect | 3-Month Joiner | 6-Month Joiner | Sunday-Only |
|--------|---------------|----------------|-------------|
| **isNewJoiner** | TRUE (months ≤ 3) | FALSE (months > 3) | Depends on employment |
| **AKI Payout (target met)** | Full totalAKI | Half (Math.round/2) | Full or half based on tenure |
| **Monthly Incentive** | 10% of overage | 10% of overage | 10% of overage |
| **Total Incentive** | monthlyIncentive + totalAKI | monthlyIncentive + totalAKI/2 | Same formula |
| **Target attainment** | Harder with few days | Same formula | Very hard with only 5 Sundays |

---

## 6. QUICK FORMULAS TO REMEMBER

```
isNewJoiner = monthsEmployed <= 3   // From incentive.js:241

if (monthlyTargetMet) {
  overage = monthlyAchievement - monthlyTarget
  monthlyIncentive = Math.round(overage * 0.1)  // incentiveController.js:250
  akiPayout = isNewJoiner ? totalAKI : Math.round(totalAKI / 2)  // incentive.js:251
  totalIncentive = akiPayout + monthlyIncentive  // incentiveController.js:252
}
```

**If target NOT met:** totalIncentive = ₹0 (both joiners)

---