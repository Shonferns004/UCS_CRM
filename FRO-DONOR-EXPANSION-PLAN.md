# FRO Donor Management — Complete Plan

**Status:** Plan approved. No code written yet.
**Scope:** Extend the existing FRO module. **All donors in the database** — 125,214 rows confirmed, of which **19,413 are old-data donors** going to **15 numbered stations per project across 15 telecallers.** The rest are fresh-data donors who stay in their own stations. See section 4.4.
**Audience:** Everyone on the team, including someone with no technical background.

> This document explains what we are building, why, and in what order. Every
> phase is reversible. Nothing here touches live donor data until you approve it.

---

## PART 0 — HOW TO READ THIS

This document is long on purpose. It is the whole plan in one place.

| If you want to know | Read |
|---|---|
| The idea in one minute | Part 1 |
| What the words mean | Part 2 |
| How donors get sorted | Part 3 |
| How stations work | Part 4 |
| The rule that decides who gets called | Part 5 |
| A full worked example with real numbers | **Part 7** |
| What we build, in order | Part 8 |
| Why old phone records are safe | Part 10 |
| Every question you asked, answered | **Part 15** |

---

## PART 1 — THE BIG PICTURE

## 1.1 In one paragraph

You have around 125,000 donor records and 15 telecallers. Part of that total already
sits in the fresh stations and does not come into this work. Of the rest, today the
computer hands out lists without sorting by what a donor is worth, so a person who
gave ₹50,000 sits in the same pile as someone who gave ₹200 once. We fix that by
giving you **one numbered station per seat per project**, filling each station from a
**value band**, with **Being Sevak acting as the master shape** that the other two
projects follow.

## 1.2 The problem, as a story

Imagine a school where 125,000 students have been sorted into 15 classes and 15
teachers. The classes were built by picking names at random.

| What goes wrong | Why it matters |
|---|---|
| A donor who gave ₹50,000 sits beside someone who gave ₹200 | Nobody sorted by what each person is worth |
| A teacher who built a relationship may never speak to that donor again | Files are shuffled by computer, not by what happened |
| A promised callback gets forgotten | There is no list of "who owes a promise" |
| A donor says "never call me again" — next month they are back | The stop instruction did not hold |
| One number in the database is wrong, so the donor silently disappears from the band | The gift total is not the same as the largest single gift |

**All five happen in your system today.** We fix all five.

## 1.3 The fix, as a story

| Change | Plain words |
|---|---|
| Donors sorted by value first | Your best callers get your best donors |
| One seat, one station per project | Everyone knows exactly which pile is theirs |
| BSCT sets the shape, others match it | All three projects stay the same size |
| Gift amount stored correctly | Nobody vanishes from a band because of an arithmetic slip |
| A promise list | Nothing you told a donor is forgotten |
| "Never call again" is permanent | Once a donor says no, they stay out, forever |

## 1.4 The one-sentence version

> Sort every donor into a value band, then fill 45 numbered stations from those bands
> with BSCT as the master, keep every old phone record attached to the station it was
> made on, and never touch the fresh-data stations.

## 1.5 The whole plan on one screen

```
                    ALL DONORS IN THE DATABASE
                              |
             +----------------+----------------+
             |                                 |
        FRESH DATA                         OLD DATA
             |                                 |
    BFD / AFD / MFD                    "largest single gift"
    UNTOUCHED by                            |
    this plan                       +--------+---------+
                                     |                  |
                              band by value      available pool
                                     |                  |
                        +--------+----+-----+           |
                        |        |    |     |           |
                   UPPER HIGH  HIGH MED  LOW   BELOW LOW |
                        |        |    |     |           |
                        +--------+----+-----+-----------+
                                     |
                        BSCT fills first (the MASTER)
                                     |
              +----------------------+----------------------+
              |                      |                      |
        BSCT stations          AFLF stations         MANN stations
        BOD-1 .. BOD-15       AOD-1 .. AOD-15      MOD-1 .. MOD-15
              |                      |                      |
              |    each filled from its own project's       |
              |    donors, toward the BSCT target count     |
              |                      |                      |
              +----------------------+----------------------+
                                     |
                         15 agents, any combination
                                     |
                          daily refill from same band only


   ONE DONOR, THREE PLACES AT ONCE -- value shared, money not

   +----------------------+     +----------------------+
   |  Mrs. Patel          |     |                      |
   |  gave Rs 50,000      | --> |   BOD-7   AOD-7      |   <- she is UPPER HIGH
   |  to BSCT only        |     |                      |      in all three places
   +----------------------+     +----------------------+
              |                            |
    band = UPPER HIGH              Rs 50,000 counted
    in ALL THREE projects          in BSCT ONLY
```

---

## PART 2 — WORDS AND MEANINGS

Plain definitions. No jargon.

| Word | What it means here |
|---|---|
| **Donor** | One person in the database. Stored once, in one table. |
| **NGO** | One of your three projects: Being Sevak (BSCT), Ashray (AFLF), Mann Care (MANN). |
| **FRO** | A Fund Raising Officer. One of your 15 telecallers. |
| **Station** | A named pile of donors. One station belongs to one FRO, in one project. |
| **Numbered station** | The old-style stations: `BOD-1` to `BOD-15`, and so on. These are the ones we are rebuilding. |
| **Fresh station** | The new-data stations: `BFD-*`, `AFD-*`, `MFD-*`. **Not touched by this plan.** |
| **Band** | A value group. UPPER HIGH, HIGH, MEDIUM, LOW, BELOW LOW. |
| **Pool** | Donors who are not yet assigned to any station. Available to be handed out. |
| **Allocation** | Giving a donor to a station and an FRO. |
| **Disposition** | One phone call record. What the caller did and what the donor said. |
| **Largest single gift** | The biggest cheque this donor ever gave **in one go**. Not their total across years. |
| **Band rising** | A donor gives more, so they move up a band automatically. |
| **Master** | The project whose counts decide the shape for the others. Here: **BSCT**. |
| **Shortfall** | A station that cannot be filled because the project does not have enough donors in that band. |
| **Dry run** | Doing the whole calculation and printing the answer. **Writes nothing.** |

---

## PART 3 — BANDS

## 3.1 The five bands

Bands come from `donor_profiles.amount`. That column is the **largest single gift**,
not the lifetime total.

| Band | Range | Who this is |
|---|---|---|
| **HIGH** | ₹5,000 and above | Strong and major donors. Personal attention. |
| **MEDIUM** | ₹1,500 to ₹4,999 | Steady mid-size givers. |
| **LOW** | ₹450 to ₹1,499 | Small givers. |
| **BELOW LOW** | ₹200 to ₹449 | Very small givers. |
| *(pending)* | Below ₹200 | See the note below |

> **Band ranges as specified:** HIGH ₹5,000+ / MEDIUM ₹1,500–₹4,999 /
> LOW ₹450–₹1,499 / BELOW LOW ₹200–₹449.
>
> **Two changes from the earlier scale, both deliberate:**
>
> | Change | Before | Now |
> |---|---|---|
> | **UPPER HIGH removed** | Separate band, ₹15,000+ | **No top band.** HIGH absorbs it |
> | **LOW floor lowered** | ₹500 | **₹450** |
>
> A donor giving ₹50,000 is therefore **HIGH**, not UPPER HIGH. This doc previously
> used that donor throughout as the UPPER HIGH example and is being updated to match.
>
> **Still unresolved:** amounts **below ₹200** have no band under these ranges.
>
> | Reading | Effect |
> |---|---|
> | **A — BELOW LOW is ₹200–₹449 only** | Under-₹200 and zero-gift donors drop out of numbered stations |
> | **B — BELOW LOW covers ₹200–₹449 and everything below ₹200** | BELOW LOW is all positive amounts under ₹450 |
>
> All measured counts so far were produced under **B**. The query below splits the
> group at each boundary so the choice can be made on real numbers.

### The band scale

```
 Rs 50,000 |                                             *  HIGH
           |                                                (the top band)
 Rs  5,000 |------------------------------------ boundary
           |
 Rs  4,999 |-------------------------------- boundary
           |                                   *          MEDIUM
 Rs  1,500 |------------------------------- boundary
           |
 Rs  1,499 |-------------------------------- boundary
           |
           |                                   *          LOW
 Rs    450 |-------------------------- boundary
           |
 Rs    449 |-------------------------------- boundary
           |
           |                                   *          BELOW LOW
 Rs    200 |------------------------------- boundary
           |
 Rs      0 |  *                                          (below 200 -- pending)

   * = an example donor's position. Read down for smaller gifts.
```

### Two donors, same total, different bands

```
   DONOR A                              DONOR B
   total 5 yrs: Rs 1,20,000             total 5 yrs: Rs 1,00,000
   biggest one: Rs 60,000               biggest one: Rs 1,200

        |                                     |
        v                                     v
   Rs 60,000 =============> UPPER HIGH      Rs 1,200 =============> HIGH

   A said yes to 60,000 in one go.        B's biggest yes was 1,200.
   That is the size of decision           Very different person, even
   we are looking for.                    though the totals are close.
```

## 3.2 Why largest single gift, not total

| Donor | Total given over 5 years | Largest single gift | Band |
|---|---|---|---|
| Mr. A | ₹1,20,000 | ₹60,000 | **UPPER HIGH** |
| Mr. B | ₹1,00,000 | ₹1,200 | **HIGH** |
| Mr. C | ₹1,10,000 | ₹11,000 | **UPPER HIGH**? No — **HIGH** |

Mr. A and Mr. C gave similar totals. But Mr. A's biggest single decision was ₹60,000.
Mr. C never went above ₹11,000.

**We sort on the largest single gift, because that is the size of the decision they
were willing to make.** A donor who once said yes to ₹60,000 is the person who will
say yes again.

## 3.3 Bands are computed, never typed

| Rule | Why |
|---|---|
| No one types a donor's band | Typing is how mistakes get in |
| The band is looked up from `amount` every time | Always correct |
| Give more, band rises automatically | No cleanup job |
| Donations are rejected too | The band drops automatically. Same rule both ways |

## 3.4 The bug this fixes

Three collection paths in the code add the new gift to the lifetime total but
**never update the largest gift**. And three rejection paths subtract from the
largest gift by arithmetic, which can drive it **negative**.

| Path | Bug | Fix |
|---|---|---|
| Collection (3 paths) | Total and count updated. Largest gift forgotten. | Update largest gift too |
| Rejection (3 paths) | Largest gift reduced by a number. Can go negative. | Recalculate from the gifts that survived |

A donor with one rejected ₹10,000 gift and no other gifts would have their largest
gift pushed to a negative number and **fall out of every band**. That donor then
disappears from the call list with no error and no trace.

---

## PART 4 — STATIONS

## 4.1 What we are building

**15 numbered stations per project. 45 in total.**

| Project | Prefix | Stations |
|---|---|---|
| Being Sevak (BSCT) | `BOD` | `BOD-1` to `BOD-15` |
| Ashray (AFLF) | `AOD` | `AOD-1` to `AOD-15` |
| Mann Care (MANN) | `MOD` | `MOD-1` to `MOD-15` |

The old stations were named `M-2`, `ND-1` to `ND-8`, `DH-1` to `DH-14`. Those are
being replaced by this clean numbering.

### Station map

```
                          15 NUMBERED STATIONS PER PROJECT
                          ================================

        BEING SEVK                 ASHRAY                 MANN CARE
        (the MASTER)                                     (follows the shape)

   1  BOD-1 ................ 1  AOD-1 ................ 1  MOD-1
   2  BOD-2 ................ 2  AOD-2 ................ 2  MOD-2
   3  BOD-3 ................ 3  AOD-3 ................ 3  MOD-3
   4  BOD-4 ................ 4  AOD-4 ................ 4  MOD-4
   5  BOD-5 ................ 5  AOD-5 ................ 5  MOD-5
   6  BOD-6 ................ 6  AOD-6 ................ 6  MOD-6
   7  BOD-7 ................ 7  AOD-7 ................ 7  MOD-7
   8  BOD-8 ................ 8  AOD-8 ................ 8  MOD-8
   9  BOD-9 ................ 9  AOD-9 ................ 9  MOD-9
  10  BOD-10 ...............10  AOD-10 ...............10  MOD-10
  11  BOD-11 ...............11  AOD-11 ...............11  MOD-11
  12  BOD-12 ...............12  AOD-12 ...............12  MOD-12
  13  BOD-13 ...............13  AOD-13 ...............13  MOD-13
  14  BOD-14 ...............14  AOD-14 ...............14  MOD-14
  15  BOD-15 ...............15  AOD-15 ...............15  MOD-15
   |                           |                          |
   +---------------------------+--------------------------+
                  these are the SAME 15 donors,
                  seen under 3 project labels


                          FRESH STATIONS - UNTOUCHED
                          ============================

   1  BFD-1   2  BFD-2   3  BFD-3  ...  23 BFD-23     (Being Sevak)
   1  AFD-1   2  AFD-2   3  AFD-3  ...  23 AFD-23     (Ashray)
   1  MFD-1   2  MFD-2   3  MFD-3  ...  23 MFD-23     (Mann Care)

   |  no rename   no rebuild   no reallocation   no new agents
   |  they keep working exactly as they do today
```

## 4.2 What we are NOT touching

| Type | Count | Action |
|---|---|---|
| Fresh stations | `BFD-1` to `BFD-23` (and the same for AFD, MFD) | **Unchanged.** No rename, no rebuild, no reallocation |

The fresh stations keep working exactly as they do now. They keep their own naming,
their own allocation, and their own agents.

## 4.3 How stations map to agents

An FRO can hold **any** station combination you want. There is no rule forcing
matching numbers.

| Agent | Stations held | Allowed? |
|---|---|---|
| Agent 01 | `BOD-1`, `BOD-5`, `AOD-10` | **Yes** |
| Agent 01 | `BOD-1`, `AOD-1`, `MOD-1` | **Yes** |
| Agent 01 | All 45 numbered stations | **Yes** |

The code already supports this. An agent's list is built from the rows that name
that agent. Nothing enforces that the numbers match across projects.

### Agents and stations, three ways

```
   MATCHING NUMBERS ACROSS PROJECTS        (allowed, but not required)
   Agent 01 holds one station per project, same number

        Agent 01
          /     |     \
      BOD-1   AOD-1   MOD-1


   MIXED PROJECT NUMBERS                   (allowed)
   Agent 01 holds stations from different projects, any numbers

        Agent 01
          /   |     \
      BOD-1  AOD-10   MOD-3

        note: 1, 10 and 3 do NOT have to match


   SEVERAL STATIONS IN THE SAME PROJECT    (allowed)
   Agent 01 holds more than one BSCT station

        Agent 01
          /    |    |      \
      BOD-1  BOD-5  BOD-9   AOD-10


   ALL THREE AT ONCE                       (allowed)

        Agent 01
       /  |   |    \
   BOD-1 BOD-5 AOD-10 MOD-3

   ---------------------------------------------------------------

   WHY THIS MATTERS

   Because the SAME donor sits under all three project labels, the
   real question is not "which station" but "which station NUMBER".

        Station 1 in BSCT, AFLF and MANN = the same 15 donors,
        viewed per project. So 15 agents x 15 station numbers.

   An agent holding BOD-1 and AOD-10 does not hold two piles of the
   same work. They hold station 1 and station 10, across projects.
```

## 4.4 The capacity question

### First: the donor total is not what it looks like

The figure you saw, 125,214, is **every row in the donor table**. It includes donors who
have already gone to fresh stations. Those donors never enter a numbered station.

These are the **confirmed live figures**, read from the database:

| Group | Assignment rows | **Distinct donors** | Where they go |
|---|---|---|---|
| **OLD** | 52,030 | **19,413** | Numbered stations `BOD` / `AOD` / `MOD` |
| **FRESH** | 161,491 | 94,896 | Fresh stations `BFD` / `AFD` / `MFD`. Untouched by this plan |
| **HELD BACK** | 11,218 | 11,218 | Fresh data deliberately not assigned. Not part of this plan |
| **Total** | **224,739** | **125,527** | |

| Reading | Meaning |
|---|---|
| **N = 19,413** | The real old-data donor count. **This is the number the plan uses** |
| Rows ≠ donors | 52,030 old rows belong to only 19,413 people. Each old donor holds **2.68** assignments |
| That ratio is expected | You decided a donor appears in all three projects, so one person creates up to three rows |
| 224,739 rows vs 125,214 donors | Normal, not corruption. It is the three-projects decision showing up in the data |
| 125,527 distinct vs 125,214 profiles | **313 assignment rows point at donor IDs that no longer exist.** Minor, listed in Part 13 |

### Second: we divide by 15, not 45

This matters more than the count.

You decided that **the same donor appears in all three projects at once.** A donor who
is UPPER HIGH sits in the Being Sevak pile, the Ashray pile and the Mann Care pile
together. Those are three *labels* for one person, not three separate people doing
work.

| If we split by 45 | What goes wrong |
|---|---|
| We treat the 45 stations as 45 independent piles | The same donor gets counted three times |
| Every agent appears to hold triple the work | The capacity maths is wrong by a factor of three |
| Staffing decisions are made on a false number | Stations look emptier than they are |

| Correct approach | Why |
|---|---|
| 15 numbered stations per project | Matches your numbering |
| **Divide the old-data count by 15** | One donor per station slot, appearing under all three project labels |
| 45 station labels exist | They are the same 15 donors viewed per project |

### The formula, with the real number in it

**N = 19,413.** Confirmed from the database.

| Number | Value |
|---|---|
| Old-data donors (N) | **19,413** |
| Donors per station (N ÷ 15) | **1,294** |
| Calls per telecaller per day | 380 |
| **Days to clear, one call per donor** | **3.4 days** |

```
   19,413 old donors
          |
          |  divide by 15 stations
          v
   1,294 donors per station
          |
          |  at 380 calls a day
          v
   3.4 days per telecaller
```

### The 11,218 unclassified donors — held back on purpose

**These are fresh-data donors that you deliberately did not assign.** They are not a
leak, not a defect, and not work waiting to happen. They are being held back
intentionally.

This matters for the plan in one way: **they are not old data, so they do not count
toward the numbered stations.** The old-data figure stays at 19,413.

| Group | What it is | Goes to numbered stations? |
|---|---|---|
| **OLD — 19,413 distinct donors** | Old data | **Yes.** This is N |
| **FRESH — 94,896 distinct donors** | Fresh data | No. Fresh stations |
| **UNCLASSIFIED — 11,218** | **Fresh data, held back by decision** | **No** |

**Measured from the database, for reference only:**

| Band | Donors | Share |
|---|---|---|
| UPPER HIGH | 193 | 1.7% |
| HIGH | 876 | 7.8% |
| MEDIUM | 2,511 | 22.4% |
| LOW | 5,932 | 52.8% |
| BELOW LOW | 1,148 | 10.2% |
| Zero or no amount | 573 | 5.1% |
| **Total** | **11,233** | 100% |

| Note | Detail |
|---|---|
| These are fresh donors | Not old data, so **N is unaffected** |
| 193 of them carry a UPPER HIGH amount | Recorded for reference. They are fresh-data donors being held back, not old top donors being lost |
| 94.3% have no `data_category` | A plain import with no source tag. Not an error |
| 121 of the UPPER HIGH group are tagged `CGFDonor` | One identifiable batch, held back with the rest |

### If they are ever released

Nothing in this plan requires action, but if that decision changes later:

| Question | Answer |
|---|---|
| Do they need allocation code? | No. The existing fresh import path handles it |
| Do they need a new station? | No. They go to fresh stations |
| Would N change? | Only if they were reclassified as old data. They are not |
| Would the numbered-station counts change? | **No.** They were never part of the 19,413 |

**They are out of scope for this plan.** Recorded here so nobody later mistakes them
for stranded data and "fixes" it.

### Corrected diagnosis: it is the station, not the NGO

A follow-up read of `data_category` and `project_supported` shows the NGO column is
**mostly fine**. Only 17 of the 11,233 have an NGO value. The other 11,216 are blank
in NGO but also blank in station.

### Their import source labels, for reference

| `data_category` value | Donors | UPPER HIGH |
|---|---|---|
| **(blank)** | **10,597** | 48 |
| CGFDonor | 517 | **121** |
| Unite | 70 | 24 |
| Sadguru | 12 | 0 |
| `(blank)` with `project_supported` = aflf / bsct / mann | 17 | 0 |
| NA, Pride donor, \*225, and 19 one-off labels | 22 | 0 |
| **Total** | **11,233** | **193** |

| Reading | Meaning |
|---|---|
| **94.3% have no category at all** | A plain import with no source tag. Nothing failed |
| 121 of the UPPER HIGH group are `CGFDonor` | One identifiable batch, held back with the rest |
| Only 17 carry an NGO value | Expected for donors deliberately held out of allocation |

### The capacity number is now settled

| Group | Counts as old data? | N |
|---|---|---|
| OLD — 19,413 distinct donors | **Yes** | **Yes** |
| FRESH — 94,896 distinct donors | No | No |
| HELD BACK — 11,218 | No. Fresh data, held deliberately | **No** |

| Confirmed | Value |
|---|---|
| **N** | **19,413** |
| Per station (÷ 15) | **1,294** |
| Runway at 380 calls a day | **3.4 days** |

**There is no longer a two-scenario ambiguity.** The 5.4-day figure is withdrawn.

### The one call-policy question that remains

The same donor holds **2.68** assignments on average, so this is the last thing
still undecided.

| If a telecaller calls... | Calls needed | Days at 380/day |
|---|---|---|
| **Once per donor**, covering every project in one conversation | 1,294 | **3.4 days** |
| **Once per donor per project**, so 2.68 conversations each | 3,468 | **9.1 days** |
| Once per donor per project, if all three | 3,882 | **10.2 days** |

| Option | Realistic? |
|---|---|
| One call, all projects covered | Friendly to the donor. Fewer calls. **Needs the list to show all three project columns** |
| Separate call per project | Each project gets a proper ask. More calls. The donor hears from you more than once |

**The plan cannot pick this for you.** It changes the runway by three times, so it
decides whether 15 stations per project is the right number.

### What runway you would need

Measured against the confirmed **19,413** old donors:

| Cycle you want | Donors needed | You have | Shortfall |
|---|---|---|---|
| 7 days | 39,900 | 19,413 | **2.1× short** |
| 15 days | 85,500 | 19,413 | **4.4× short** |
| 30 days | 171,000 | 19,413 | **8.8× short** |

| Reading | Meaning |
|---|---|
| **19,413 ÷ (15 × 380) = 3.4** | **This is the longest cycle 15 stations can produce.** Not 7 days. Not a month |
| More stations would make it worse | 30 stations per project gives 1.7 days |
| Fewer stations would make it longer | 7 stations per project gives 7.3 days |

```
   19,413 donors, 380 calls a day, 15 agents
   = 5,700 calls a day of capacity across the team

   Cycle length = 19,413 donors / 5,700 calls per day
                = 3.4 days

   +--------------------------------------------------+
   |  the only ways to stretch this:                   |
   |    - fewer numbered stations per project           |
   |    - fewer calls per donor (one call, all projects) |
   |    - import more old data                         |
   +--------------------------------------------------+
```

**This is a real constraint, not a modelling error.** 15,214 donors cannot be called
in a month at 380 calls a day with 15 people. The plan now says so plainly instead of
leaving a formula.

### Why this is still not a blocker

| Reason | Explanation |
|---|---|
| The formula is correct now | Only the input is missing |
| Band counts are per NGO anyway | Each project draws from its own donors, so the per-band pool is the number that matters |
| The dry run is read-only | Running it costs nothing and produces N exactly |

**Fill in N from the Phase 2 report and this section becomes a single table.**

---

## PART 5 — THE ALLOCATION RULE

## 5.1 BSCT is the master

**Being Sevak decides the shape. Ashray and Mann follow it.**

| Step | What happens |
|---|---|
| 1 | Work out how many BSCT donors are in each band |
| 2 | That count becomes the **target** for that band in the other two projects |
| 3 | AFLF and MANN each fill their stations from their own donors |

### The master rule, drawn

```
   STEP 1 -- count the BSCT bands

   BSCT UPPER HIGH donors  ================================  1,000
                                    |
                                    |  this becomes the TARGET
                                    v
   STEP 2 -- spread the target across 15 stations

   BOD-1  BOD-2  BOD-3  ...  BOD-14  BOD-15
     |      |      |          |        |
    67     67     67   ...   66      66        = 1,000

                                    |
   STEP 3 -- the other projects aim at the same shape

              target per station = 67
                       |
        +--------------+--------------+
        |              |              |
   AFLF has 540    MANN has 41    (their own donors)
        |              |
   fills to 36     fills to 3
   per station     per station
        |              |
   SHORTFALL      SHORTFALL
```

### Shortfall, drawn

Scale: 1 block = 1 donor. Target is 67, so a full bar is 67 blocks.

```
   TARGET from BSCT station 1  ================================ 67


   BSCT  has 67 per station.  Fills exactly.

   67 |###################################################################| 67   OK


   AFLF  has 540 across 15 stations.  Each aims for 67.

   67 |####################################|                      36   SHORT 31
   36 |####################################|
      |                                    missing 31 -> pool


   MANN  has 41 across 15 stations.  Each aims for 67.

   67 |###|                                                          3   SHORT 64
    3 |###|
      |   missing 64 -> pool


   SIDE BY SIDE

   BSCT   |###################################################################|  67
   AFLF   |####################################|                     36
   MANN   |###|                                                       3


   WHAT WE DO NOT DO   (filling AFLF to 67 with the wrong donors)

   67 |####################################|###############################|  67
   36 |     UPPER HIGH  (36)             |        HIGH  (31)            |   <- MIXED
      +------------------------------------+-------------------------------+
      | station 1 stops being a pure UPPER HIGH station          |

   Mixing HIGH donors into an UPPER HIGH station breaks the band
   filter. Every later day the refill would have to search a mixed
   pile. The station stops being a clean band station.

   ALTERNATIVELY -- leave the station short and keep the band pure

   36 |####################################|  36   station simply smaller
```

## 5.2 What "same to same" means

| Rule | Meaning |
|---|---|
| BSCT station 1 has 1,000 UPPER HIGH donors | Station 1 in AFLF and MANN each **target** 1,000 |
| They have the donors | They fill to 1,000 |
| They do not have the donors | **Shortfall.** See 5.3 |

## 5.3 Shortfall — the rule that cannot be argued with

**A station can never hold more donors than its own project has in that band.**

| Situation | What happens |
|---|---|
| BSCT station 1 has 1,000 UPPER HIGH. AFLF has 1,200 | AFLF station 1 fills to 1,000. **200 stay in the pool** |
| BSCT station 1 has 1,000. AFLF has **600** | AFLF station 1 holds **600.** It cannot reach 1,000. **400 stay in the pool** |
| BSCT station 1 has 1,000. AFLF has **0** | AFLF station 1 is **empty.** Cannot be helped |

This is arithmetic, not a preference. There is no setting that makes 600 become 1,000.

**When this happens, the station keeps only its own band.** We do not top it up with
the band below.

| Option | Why we rejected it |
|---|---|
| Top up station 1 with 400 HIGH donors to reach 1,000 | Station 1 is meant to be UPPER HIGH. Mixing bands in breaks band-filtered allocation for that station. Every later day, the daily refill would have to search a mixed pile |

**Uneven stations are the honest answer. A full station holding the wrong donors is
worse.**

---

## PART 6 — DONOR VALUE AND DONOR MONEY ARE TWO DIFFERENT THINGS

This is the most important rule in the whole plan, and it is easy to get wrong.

## 6.1 The rule

| Thing | Where it lives | Scope |
|---|---|---|
| **The band** (UPPER HIGH) | The donor's own record | **One value, seen by all three projects** |
| **The money they gave** | The project they gave it to | **Only that project** |

### Value shared, money not

```
   MRS. PATEL   gives  Rs 50,000  to  BEING SEVK
                 |
                 v
   +-------------------------------------------------------------+
   |  THE BAND  -- read from her largest single gift = Rs 50,000  |
   +-------------------------------------------------------------+
                 |
      +----------+----------+
      |                     |
      v                     v
   UPPER HIGH            UPPER HIGH            UPPER HIGH
   BSCT list             AFLF list             MANN list
   yes                   yes                   yes
   (all three teams treat her as a top donor)
      |                     |                     |
      |                     |                     |
      |  money              |  money              |  money
      |                     |                     |
      +---------------------+---------------------+
                            |
                            |  only BSCT
                            v
   +-------------------------------------------------------------+
   |  THE MONEY  -- Rs 50,000  credited to the BSCT target ONLY   |
   +-------------------------------------------------------------+
          |            |            |
        BSCT         AFLF         MANN
     +50,000            0            0
    (credited)     (not credited) (not credited)

   ONE DONATION. THREE TARGETS. IT SATISFIES ONE OF THEM.
```

### The two halves never mix

```
   WHAT IS SHARED ACROSS ALL THREE PROJECTS
   ==========================================
     - the BAND            UPPER HIGH
     - the donor's WORTH   treated as a top donor everywhere
     - the donor's NAME    one person, not three

   WHAT STAYS IN ONE PROJECT
   =========================
     - the GIFT AMOUNT     Rs 50,000 -> BSCT only
     - the TARGET CREDIT   BSCT only
     - the RECEIPT         one receipt, one project

   WHY THE SEPARATION MATTERS

   If the money were shared too, AFLF and MANN would be credited
   for cash they never received. Their targets would show as met
   when they had earned nothing. Budgets would be fiction.
```

## 6.2 What this means

A donor gives ₹50,000 **in BSCT only.**

| Question | Answer |
|---|---|
| Which band are they in? | **UPPER HIGH** — everywhere, all three projects |
| Where does the ₹50,000 show up? | **BSCT only** |
| Does it appear in AFLF? | **No.** Not in collections, not in targets |
| Does it appear in MANN? | **No.** |
| Will they be on the AFLF UPPER HIGH call list? | **Yes.** They are an UPPER HIGH donor |

## 6.3 Why we separate them

| Reason | Explanation |
|---|---|
| The donor really is UPPER HIGH | Their largest single gift is ₹50,000. That does not change because they gave it to one project |
| Their targets are separate | AFLF and MANN targets should not be marked as met by money given to BSCT. Those are different budgets |
| All three teams can value them | Being treated as UPPER HIGH by all three is correct and useful |
| No double counting | The money is counted once, in BSCT. Only the band is shared |

## 6.4 The code confirms this is possible

| Check | Result |
|---|---|
| Does `donor_profiles.amount` hold one value? | **Yes.** One column. The band reads from here. Shared by all three |
| Do donations hold a project? | **Yes.** Every collection and receipt already records its NGO |
| Does the database need changing? | **No.** Both already work this way |

---

## PART 7 — A FULL WORKED EXAMPLE

All numbers here are illustrative, to show the arithmetic. Your real counts come
from the dry run in Phase 2.

## 7.1 The starting point

We are working with one band: **UPPER HIGH** (₹15,000 and above).

### What BSCT has

| BSCT band | Donors available |
|---|---|
| UPPER HIGH | **1,000** |

BSCT has 1,000 UPPER HIGH donors. Since BSCT is the master, we need 15 stations and
1,000 donors to share.

### 1,000 ÷ 15 = 66.67

1,000 ÷ 15 = 66 with a remainder of 10. That means 10 stations get one extra donor each.

| Stations | Each holds | Subtotal |
|---|---|---|
| 10 stations | 67 | 670 |
| 5 stations | 66 | 330 |
| **Total** | | **1,000** |

Check: 670 + 330 = 1,000. Correct. The 10 larger stations get the spare donor.

## 7.2 What AFLF has

AFLF is following BSCT. BSCT station 1 holds **67 UPPER HIGH** donors.

So AFLF station 1 targets **67** UPPER HIGH donors.

### What AFLF actually has

| AFLF band | Donors available |
|---|---|
| UPPER HIGH | **540** |

### The allocation

15 stations, 540 donors.

540 ÷ 15 = 36 exactly. Clean division.

| Station | Donors |
|---|---|
| `AOD-1` | **36** |
| `AOD-2` | **36** |
| ... | **36** |
| `AOD-15` | **36** |
| **Total** | **540** |

All 15 stations hold **36**. AFLF did not have enough to match BSCT's 67 per station,
so every AFLF station is 31 short. **That is the shortfall rule working correctly.**

No donor is lost. Every AFLF UPPER HIGH donor got a station. They simply sit in
smaller piles than BSCT.

## 7.3 What MANN has

| MANN band | Donors available |
|---|---|
| UPPER HIGH | **41** |

MANN targets the same shape.

MANN targets the same shape. 41 ÷ 15 = 2 with a remainder of 11, so 11 stations get
one extra donor.

| Station | Donors |
|---|---|
| `MOD-1` to `MOD-11` | **3** each |
| `MOD-12` to `MOD-15` | **2** each |
| **Total** | **41** |

Check: 11 × 3 = 33, plus 4 × 2 = 8. 33 + 8 = 41. Correct.

## 7.4 The three projects side by side

| Station number | BSCT | AFLF | MANN |
|---|---|---|---|
| 1 | 67 | 36 | 3 |
| 2 | 67 | 36 | 3 |
| ... | ... | ... | ... |
| 15 | 66 | 36 | 2 |
| **Total** | **1,000** | **540** | **41** |

### What this table is telling you

| Reading | Meaning |
|---|---|
| BSCT is the master | Its 67-per-station set the target |
| AFLF is short by 31 per station | AFLF simply has fewer UPPER HIGH donors |
| MANN is short by 64 per station | MANN has very few |
| **Nobody was dropped** | 1,581 donors across all three, all allocated |
| **Nobody was double-counted** | Each donor is in one project, one band, one station |

**This is the honest outcome.** If you had forced AFLF station 1 to hold 67, you would
need 31 donors from a lower band, and the station would no longer be a UPPER HIGH
station.

## 7.5 Now watch the band stay put while the money stays put

Take one donor: **Mrs. Patel.**

| Fact | Value |
|---|---|
| She gave ₹50,000 | To **BSCT** |
| Her largest single gift | ₹50,000 |
| Her band | **UPPER HIGH** |
| She was allocated to | `BOD-7` |

Now ask the question that matters:

| Question | Answer |
|---|---|
| Does she appear on the **AFLF** UPPER HIGH call list? | **Yes.** She is UPPER HIGH |
| Does she appear on the **MANN** UPPER HIGH call list? | **Yes.** She is UPPER HIGH |
| Does the ₹50,000 appear in **AFLF** collections? | **No.** She gave it to BSCT |
| Does the ₹50,000 appear in **MANN** collections? | **No.** |
| Is the **BSCT** target credited ₹50,000? | **Yes** |
| Is the **AFLF** target credited ₹50,000? | **No** |
| Is the **MANN** target credited ₹50,000? | **No** |

### Why this is right

| Reason | Explanation |
|---|---|
| Her **value** is shared | She is worth UPPER HIGH attention. All three projects should treat her so |
| Her **money** is not | Targets are budgets. BSCT's money is BSCT's achievement |
| No inflated targets | AFLF and MANN are not credited for money they never received |
| She is reachable by all three | If she gives to Ashray next year, the band was already right |

## 7.6 What if Mrs. Patel gives more?

| Event | New largest gift | New band | What her lists do |
|---|---|---|---|
| She gives ₹5,000 to BSCT | ₹50,000 (unchanged) | UPPER HIGH | Nothing changes |
| She gives ₹80,000 to BSCT | ₹80,000 | UPPER HIGH | Already the top band |
| She gives ₹3,000 to MANN | ₹50,000 (unchanged) | UPPER HIGH | MANN sees her as UPPER HIGH. **₹3,000 counts toward the MANN target** |
| A ₹20,000 gift to her is **rejected** | Recalculated from surviving gifts | UPPER HIGH if ₹50,000 survived, otherwise recomputed | **No negative numbers. No silent disappearance** |

Notice the third row: the band did not move, because ₹3,000 is below her ₹50,000.
But the MANN target **was** credited, because that money genuinely went to MANN.

## 7.7 The daily refill, in this example

A week later, `AOD-1` (36 donors) has 4 donors collected and 3 marked do-not-contact.

| Step | What happens |
|---|---|
| 1 | Agent opens `AOD-1`. They see 36 donors |
| 2 | Over 7 days they work through them |
| 3 | 4 donors are collected. 3 say never call again |
| 4 | Those 7 leave the station |
| 5 | The system refills **only from the AFLF UPPER HIGH pool** |
| 6 | The pool was empty, so `AOD-1` stays at 29 |
| 7 | **No one from the HIGH band is added.** The station stays UPPER HIGH |

Step 7 is the point. If the pool is empty, the station shrinks. It stays clean.

## 7.8 What Mrs. Patel's old calls look like

Suppose Mrs. Patel was previously in station `DH-7`, and she had three calls logged
there in March.

| Question | Answer |
|---|---|
| Where do those three March calls live now? | **Still attached to `DH-7`** |
| Have they been moved to `BOD-7`? | **No.** Never |
| Does her report now show 3 calls at `BOD-7`? | **No.** They show under the old station |
| Can you still find them? | **Yes.** They are intact and searchable |

This works because of how the code links a call to a station. Part 10 explains it.

---

## PART 8 — WHAT WE BUILD, IN ORDER

Every phase below is reversible until the final cutover.

### The order, at a glance

```
   PHASE 0        PHASE 1        PHASE 2        PHASE 3
   fix bugs       fix gift       band table     retire old
   (blocking)     arithmetic     + REPORT       stations
      |               |              |               |
      v               v              v               v
   +--+---------------+--------------+---------------+
   |  no donor data touched yet                       |
   +--+---------------+--------------+---------------+
      |               |              |               |
      |               |              |               v
      |               |              |        +--------------+
      |               |              |        | OLD STATIONS |
      |               |              |        | hidden, kept |
      |               |              |        +--------------+
      |               |              |               |
      |               |              |               v
      |               |              |        +--------------+
      |               |              |        | create 15 new|
      |               |              |        | per project  |
      |               |              |        +--------------+
      |               |              |               |
      |               |              |               v
      |               |              |        +--------------+
      |               |              +------->| ALLOCATE from |
      |               |                       | BSCT outward |
      |               |                       +--------------+
      |               |                              |
      |               |                              v
      |               |                       +--------------+
      |               +---------------------->| DAILY: refill|
      |                                       | same band   |
      |                                       +--------------+
      |
      +--> everything above is reversible.
           No row is ever deleted.
```

## PHASE 0 — Fix the three things that are broken now

These are not part of the rebuild. They are things that quietly break data today.

| # | Bug | Where | What it causes |
|---|---|---|---|
| 1 | Database handle used without importing it | `assignmentHelpers.js` | Fresh-data assignment and import crash when they reach this code |
| 2 | Fresh station reset matches the old prefix only | Station reset | After a rename, fresh reset **silently does nothing**. Data appears to survive a reset |
| 3 | Unauthenticated database routes | `backend/src/index.js` | Seven endpoints that read, query, drop tables, and delete rows with **no login required** |

### Why Phase 0 comes first

| Reason | Explanation |
|---|---|
| Bug 3 is a live risk right now | Anyone who can reach the server can drop tables |
| Bug 1 blocks fresh data | The fresh stations must keep working. We said we would not touch them, but they are already broken |
| Bug 2 hides a reset that never ran | You may believe fresh data was cleared when it was not |

**Bug 4 has been removed.** It described the 11,218 held-back donors as an unreachable
pool needing a fix. They are fresh-data donors being held on purpose, so there is
nothing to fix. Changing the pool query now would allocate donors you decided not to
allocate.

### One note for the future

The pool query does require **both** a matching `ngo` and a matching `station`:

```js
.eq('ngo', ngoName)        // needs an ngo
.in('station', stations)   // needs a station
```

This is what makes the held-back donors invisible, which is exactly the current
behaviour. It is fine while they stay held back. If they are ever released, the
existing fresh import path assigns them normally and no change is needed here.

```
   donor_profiles holds every imported donor, assigned or not.
   the daily refill only pulls donors that match ngo AND station.

   the 11,218 held-back donors match neither.
   that is the intended state, not a fault.

   if released later:
     fresh import assigns them to fresh stations
     no pool-query change required
     N does not change -- they are not old data
```

## PHASE 1 — Fix the gift arithmetic

| Change | Effect |
|---|---|
| Collection updates the largest single gift | Bands stop drifting |
| Rejection recalculates from surviving gifts | No negative amounts, no donors vanishing |
| Recompute `amount` for the **594** understated donors | They move to the band they actually belong to |

Both changes are small. **Confirmed in production:** zero negative amounts, so nothing
has been damaged. The 594 understated donors are the only affected group, under 0.5% of
the database. Phase 1 is a correction, not a rescue.

## PHASE 2 — Build the band tables and the segregation report

### What gets built

| Object | Purpose |
|---|---|
| Band definition table | The five bands, editable without code |
| Band lookup | A function that answers "which band is this donor in?" |
| Segregation report | Counts per band per project |

### The segregation report

| Column | Meaning |
|---|---|
| Project | BSCT, AFLF, or MANN |
| Band | The five bands |
| Available in pool | Not yet assigned |
| Assigned | Already on a station |
| Total | Available + assigned |
| **Target stations** | How many stations this project can fill in this band |

### It writes nothing

| Property | Reason |
|---|---|
| Read-only | You see the shape before committing |
| Repeatable | Run it as often as you like |
| Reversible | Nothing changed, so nothing to undo |

**This is where you learn your real numbers.** The worked example in Part 7 uses
made-up figures. The report gives you the actual counts.

## PHASE 3 — Retire the old stations without deleting them

| Action | Detail |
|---|---|
| Mark the old stations retired | A new flag. **Not a delete** |
| Keep every row | Every donor, every call, every receipt stays exactly where it is |
| Hide retired stations from the dropdown | Agents stop seeing them |

**Why not delete?** Because a deleted station takes its donors' history with it.
Part 10 covers this in full.

## PHASE 4 — Create the 45 numbered stations

| Project | Creates |
|---|---|
| BSCT | `BOD-1` to `BOD-15` |
| AFLF | `AOD-1` to `AOD-15` |
| MANN | `MOD-1` to `MOD-15` |

Nothing is allocated yet. The stations exist and are empty.

## PHASE 5 — Allocate from BSCT outward

| Step | Action |
|---|---|
| 1 | Work out BSCT's per-band counts |
| 2 | Fill BSCT stations from BSCT donors |
| 3 | Read BSCT's per-station counts as the target |
| 4 | Fill AFLF stations from AFLF donors toward those targets |
| 5 | Fill MANN stations the same way |
| 6 | Record every shortfall |

### Reassignment, not deletion

When a donor moves to a new station:

| Step | Effect |
|---|---|
| Old assignment marked `reassigned` | **The row stays.** Its station value is kept |
| New assignment created | Carries `batch_id` and `batch_type` across |
| Old calls | **Stay attached to the old assignment, and therefore the old station** |

## PHASE 6 — Daily operation

| Rule | Behaviour |
|---|---|
| Refill trigger | Only when donors leave a station |
| Refill source | That station's band, in that project |
| Pool empty | Station shrinks. **No band substitution** |
| Owner changes | Explicit handover only. Never automatic |
| Band changes | Automatic. Ownership does **not** follow |
| Fresh stations | Their own existing handlers. Untouched |

### The daily cycle

```
   1. AGENT OPENS THE STATION
      +-------------------------------------------------------+
      |  Station AOD-1    band: UPPER HIGH    donors: 36      |
      +-------------------------------------------------------+
                             |
                             v
   2. AGENT WORKS THE LIST, DUE-TODAY FIRST
      |
      |   +--> promise due today        (top priority)
      |   +--> fresh donors             (next)
      |   +--> everything else
      |
      v
   3. DURING THE WEEK DONORS LEAVE THE STATION
      |
      |   collected                 -> leaves
      |   never call again (DNC)     -> leaves, permanently
      |   handover                   -> leaves, active promise moves
      |
      v
   4. SYSTEM REFILLS  --  FROM ONE PLACE ONLY
      |
      +-------------------------------------------------------+
      |  pull from:  AFLF  +  UPPER HIGH  +  available pool |
      +-------------------------------------------------------+
                             |
              +--------------+--------------+
              |                             |
        pool has donors                pool is EMPTY
              |                             |
              v                             v
      station returns to 36         station stays at 29
              |                             |
              |                             +--> NO HIGH-band donor
              |                             +--> NO MEDIUM-band donor
              |                             +--> station stays UPPER HIGH
              |
              +--> still UPPER HIGH only. Never mixed.
```

---

## PART 9 — FRESH STATIONS

## 9.1 They are not part of this plan

| Item | Status |
|---|---|
| `BFD-1` to `BFD-23` | **Unchanged** |
| `AFD-1` to `AFD-23` | **Unchanged** |
| `MFD-1` to `MFD-23` | **Unchanged** |
| Their allocation logic | **Unchanged** |
| Their agents | **Unchanged** |

Fresh donors keep flowing in through the existing import path, on the existing
schedule, into the existing stations.

## 9.2 Two bugs still get fixed

We said we would not touch fresh stations. Two defects would still break them, so
both are fixed. Neither changes behaviour.

| Bug | Current | Fix |
|---|---|---|
| Missing import | `assignmentHelpers.js` uses the database handle it never imported | Add the import |
| Prefix mismatch | One query matches `FD-` only. Another matches it loosely. Renamed codes are `AFD-` | Match the renamed prefixes too |

### Why the prefix bug matters

| Situation | Today | After fix |
|---|---|---|
| Fresh station is named `AFD-5` | A reset looks for `FD-`-something. **Misses it. Deletes nothing.** | Finds it. Resets properly |
| Agent picks up fresh stations | A lookup misses renamed codes. Shows a partial list | Shows all of them |

**Today, a fresh reset may report success while removing nothing.** That is worse
than an error, because it looks like the data is gone when it is not.

### The rename problem, drawn

```
   BEFORE THE RENAME                 AFTER THE RENAME
   (what the code still searches)    (what is actually in the database)

   FD-1 ... FD-23                    BFD-1 ... BFD-23
                                     AFD-1 ... AFD-23
                                     MFD-1 ... MFD-23

   a search for  "FD-%"  finds:      a search for "FD-%"  finds:
        FD-1  FD-2  FD-3 ...              (nothing at all)

                                         the data is still there.
                                         the reset silently did nothing.


   THE FIX: search for the renamed prefixes too

   "FD-%"      ->  still matches the old names
   "%FD-%"     ->  also matches  BFD-  AFD-  MFD-

   so all three renamed families are found, whichever one is in use.
```

---

## PART 10 — WHY YOUR OLD CALL RECORDS ARE SAFE

## 10.1 The thing that matters

**A call record does not store its station name. It stores a link to the assignment.**

| Column | Holds |
|---|---|
| Call record's donor | Which donor |
| Call record's assignment | Which assignment row |
| Assignment's station | Which station |
| Assignment's owner | Which FRO |

So when a call is displayed, the system looks up the station **through the
assignment, every single time it is shown.**

### The chain

```
   A CALL RECORD
   +---------------------------------------------------------+
   |  donor_id = 412        assignment_id = 8891             |
   |  (no station column here at all)                         |
   +---------------------------------------------------------+
                          |
                          |  looks up
                          v
   THE ASSIGNMENT ROW   (fro_assignments, id = 8891)
   +---------------------------------------------------------+
   |  station  = "DH-7"        status = active               |
   +---------------------------------------------------------+
                          |
                          |  reads
                          v
   THE STATION

   The call says "DH-7" only because the assignment says so.
   Change the assignment, and the call appears to move.
   Delete the assignment, and the call finds nothing.
```

### What each approach does

```
   WE NEVER DO THIS                        WE DO THIS INSTEAD
   =================                       =====================

   donor's old assignment                 donor's old assignment
        station: DH-7                          station: DH-7
              |                                       |
   DELETE it  |                                 MARK it reassigned
              |                                       |
              v                                       |  row SURVIVES
   +------------------------+                          |
   | assignment is gone     |                          v
   +------------------------+                 +------------------------+
              |                           | station: DH-7 (kept)   |
              v                           | status: reassigned    |
   +------------------------+             +------------------------+
   | call finds nothing     |                         |
   | HISTORY LOST           |                         | new assignment
   +------------------------+                         v
                                     +------------------------+
   WE NEVER DO THIS EITHER              | station: BOD-7         |
   =================                   | status: active          |
                                     +------------------------+
   donor's old assignment                          |
   UPDATE station to BOD-7                          |
              |                                     v
              v                           +------------------------+
   +------------------------+             | call 8891 -> assignment |
   | assignment now says     |             | 8891 -> station DH-7   |
   | BOD-7                   |             |                        |
   +------------------------+             | HISTORY INTACT         |
              |                           +------------------------+
              v
   +------------------------+
   | call now appears at    |
   | BOD-7                  |   <-- the original DH-7 is lost
   | WRONG: history moved   |
   +------------------------+
```

## 10.2 What that means for us

| If we did this | Result |
|---|---|
| **Deleted** the assignment | The call cannot find its station. **It effectively disappears from reports** |
| **Changed** the assignment's station | The call now shows the **new** station. The original is lost |
| **Marked it `reassigned` and created a new row** | The call still finds the **old** row, which still says the **old** station |

## 10.3 The pattern we use

| Step | What it does | Effect on history |
|---|---|---|
| 1 | Mark the old assignment `reassigned` | Row survives. Station value preserved |
| 2 | Create a new assignment for the new station | Carries `batch_id` and `batch_type` |
| 3 | Leave every call record untouched | It still points at the old row |

**Verified in the existing code.** This is not a new mechanism. It is the pattern
the handover feature already uses.

## 10.4 The one consequence, stated plainly

| Question | Answer |
|---|---|
| Do old calls move to the new stations? | **No.** They stay under the retired station names |
| Are they lost? | **No.** Fully intact and searchable |
| Do they appear in new station totals? | **No.** New stations start with a clean history |

This is the honest outcome, and it is the safe one. A retired station's report still
shows what that station accomplished, which is worth keeping.

**No extra reporting work is needed.** Nothing extra was built for this.

---

## PART 11 — WHAT WE ARE NOT DOING

Saying no is part of the plan.

| Not doing | Why |
|---|---|
| Renaming or rebuilding fresh stations | You asked for them untouched |
| Touching the seven unsecured database routes beyond gating them | Fix the auth hole, do not redesign the admin |
| Deleting any donor | Pooling means freeing, not removing |
| Deleting any old station row | History depends on it |
| Moving ownership when a band changes | You decided band and owner are independent |
| Expiring old follow-ups | You did not ask for this. Not included |
| Changing what counts toward an incentive | Each project keeps its own rules |
| A cap on how many promises an agent holds | You asked for no cap |
| Guaranteeing equal station sizes across projects | **Arithmetic does not allow it.** Part 5.3 |
| Merging donors who appear twice in the import | Left for a separate pass |
| Any automatic expiry of an owner relationship | Explicit handover only |

---

## PART 12 — RISK AND ROLLBACK

| Phase | Reversible? | How |
|---|---|---|
| 0 — Bug fixes | Yes | Revert the change |
| 1 — Gift arithmetic | Yes | Recalculate from `donations` |
| 2 — Band report | Yes | It writes nothing |
| 3 — Retire stations | Yes | Clear the flag |
| 4 — Create stations | Yes | Delete the new empty rows |
| 5 — Allocate | Yes | Mark new assignments `reassigned`; old rows are intact |
| 6 — Daily | n/a | Ongoing |

**The single most important property: we never delete a row.** Every phase works by
marking and adding. That is what makes the whole plan reversible.

### Safeguards before Phase 5 runs

| Safeguard | Purpose |
|---|---|
| Dry run first | See the numbers, write nothing |
| Backup | A copy before any write |
| Small test batch | One station, verified, before the rest |
| Counts before and after | Prove nothing was lost |
| Stop button | Abort at any point, restore the flag |

---

## PART 13 — WHAT WE KNOW FROM THE DATABASE, AND WHAT IS STILL MISSING

Two numbers we cannot invent. The dry run produces both.

| Unknown | Why it matters |
|---|---|
| Real per-band counts per project | Sets exactly how many donors land in each station |
| Real per-project donor totals | Sets the shortfall in every band |

### Now answered — confirmed from the database

You ran the read-only queries. These are **measured, not assumed**:

| Question | Answer | Status |
|---|---|---|
| Total donor rows | **125,214** | Confirmed |
| Old-data distinct donors (**N**) | **19,413** | **Confirmed. This is the plan's number** |
| Old-data assignment rows | 52,030 | Confirmed. 2.68 rows per old donor |
| Fresh-data distinct donors | 94,896 | Confirmed |
| Fresh-data assignment rows | 161,491 | Confirmed |
| Held back, no assignment, fresh data by decision | 11,218 | Confirmed, intentional |
| Distinct donors across all groups | 125,527 | Confirmed |

| Finding | Meaning |
|---|---|
| 52,030 old rows belong to 19,413 people | The three-project rule is **already live in your data.** Each old donor holds 2.68 assignments |
| 224,739 rows vs 125,214 donors | **Not corruption.** One person, up to three project labels |
| 125,527 distinct vs 125,214 profiles | **313 orphan references.** Assignment rows pointing at donor IDs that no longer exist. Small, listed below |

### The amount-integrity check came back clean

| Check | Result | Meaning |
|---|---|---|
| Negative amounts | **0** | The rejection bug has **not** damaged data |
| Null amounts | **0** | Every donor has a band value |
| Zero amounts | 1,610 | **Expected.** Fresh donors who have not given yet. These sit in BELOW LOW |
| Donors whose amount is **understated** vs actual receipts | 594 | See below |
| Donors with any receipt recorded | 1,885 of 125,214 | **Only 1.5% have been called and given since going live** |

| The 594 understated donors | Explanation |
|---|---|
| What happened | The donor's largest gift, recorded as a receipt, is **higher** than the stored `amount` |
| Why | Collection code adds to the lifetime total but forgets to raise `amount` |
| Effect | These 594 donors sit in a **lower band than they deserve** and are called by junior staff |
| Severity | **Low.** 594 out of 125,214, under 0.5% |
| Fix | Phase 1. Recompute `amount` from receipts for these 594 |

**This is the bug from section 3.4, confirmed in production, at a manageable size.**

### The 313 orphan donor references

| Item | Detail |
|---|---|
| What | 313 assignment rows point at `donor_id` values with no matching row in `donor_profiles` |
| Why it happens | A donor profile was merged or removed, but the assignment row was left behind |
| Effect on banding | Those 313 rows are counted in the 52,030 total but **cannot be allocated** because there is no donor record to attach to |
| Plan treatment | Reported separately, **never deleted.** Listed in Phase 0 for a decision |

### Environment issue

The direct database connection times out during the handshake. The server is
reachable but the connection does not complete.

| Item | State |
|---|---|
| Host resolves | Yes |
| Port open | Yes |
| Connection completes | **No.** Handshake times out |
| AWS access rule change | **Not attempted.** Deliberately not changed without explicit sign-off |

Until this is resolved, the counts come from you or from an in-app query. **No code
should be written against assumed numbers.**

---

## PART 14 — SUMMARY OF THE NEW DESIGN

| Element | Design |
|---|---|
| Donor sorting | Largest single gift into five bands |
| Band storage | Computed from `amount`, never typed |
| Stations | 15 numbered per project, 45 total |
| Fresh stations | Untouched |
| Master project | BSCT sets the per-band shape |
| Other projects | Fill toward the BSCT target from their own donors |
| Shortfall | Station holds what it has. No band mixing |
| Donor money | Stays in the project it was given to |
| Donor band | Shared across all three projects |
| Agent stations | Any combination allowed |
| History | Preserved by the `reassigned` pattern |
| Deletions | None |
| Reversibility | Every phase |

---

## PART 15 — EVERY QUESTION, ANSWERED

## 15.1 Scope and size

| Question | Answer |
|---|---|
| How many donors? | **All of them.** 125,214 rows confirmed. But that includes fresh-data donors. The **old-data count is 19,413**, and those are the ones going into numbered stations |
| What is the real old-data number? | **19,413 distinct donors**, held across 52,030 assignment rows. Each old donor averages **2.68** assignments because they appear in up to three projects |
| How many telecallers? | **15** |
| How many station labels? | **45 numbered** — 15 per project across 3 projects |
| Why divide by 15 and not 45? | The same donor appears under all three project labels. The 45 labels are three views of the same 15 donors, not 45 separate piles |
| What about the fresh stations? | **Untouched.** They keep their own numbering and their own allocation. Their donors are not counted in the numbered stations |
| Does the donor count support 380 calls a day? | Depends on the old-data count, which is not yet known. **Section 4.4** gives the formula and the thresholds: about 39,900 old donors for a 7-day cycle, 85,500 for 15 days, 171,000 for 30 |

## 15.2 Bands

| Question | Answer |
|---|---|
| What are the bands? | HIGH ₹5,000+ / MEDIUM ₹1,500–₹4,999 / LOW ₹450–₹1,499 / BELOW LOW ₹200–₹449 / below ₹200 **pending**. **No UPPER HIGH band** |
| Largest single gift or lifetime total? | **Largest single gift** — the biggest cheque in one go |
| What if a donor gives more? | The band **rises automatically.** Nobody edits anything |
| Does ownership follow the band? | **No.** The band changes, the owner stays |
| Who sets the band? | **Nobody types it.** The system reads it from the amount every time |

## 15.3 Stations and agents

| Question | Answer |
|---|---|
| One agent per station across all three projects? | **No.** An agent can hold any combination, including several stations in the same project |
| Must station numbers match across projects? | **No.** `BOD-1` with `AOD-10` is fine |
| Can one agent hold everything? | **Yes** |
| Which numbering do we use? | `BOD`/`AOD`/`MOD` 1 to 15. Replacing `M-2`, `ND-1`–`ND-8`, `DH-1`–`DH-14` |

## 15.4 The allocation rule

| Question | Answer |
|---|---|
| How is work shared? | **BSCT is the master.** Its per-band counts set the target for the other two |
| If BSCT station 1 has 1,000, what do the others do? | They target 1,000 each |
| What if they cannot reach it? | **Shortfall.** The station holds what it has, the remainder stays in the pool |
| Do we fill a gap with the band below? | **No.** The station stays pure, so daily band-filtered refill keeps working |
| Can we guarantee equal sizes across projects? | **No.** A station cannot hold more donors than its project has |
| Which donors get allocated? | **All of them**, automatically. No manual decisions |

## 15.4a The one open question: how many calls per donor

Your old-data donors each hold **2.68** assignments on average. That means one person
can generate more than one call. This is not yet decided, and it changes the runway by
three times.

| If a telecaller calls | Calls needed | Days at 380/day |
|---|---|---|
| **Once per donor**, all projects in one conversation | 1,294 | **3.4 days** |
| **Once per donor per project** (2.68 average) | 3,468 | **9.1 days** |
| Once per donor for all three projects | 3,882 | **10.2 days** |

| Option | Effect on the donor | Effect on the team |
|---|---|---|
| **One call, all projects** | A donor is not bothered three times for one relationship | Fastest. Needs the list to show all three project columns in one row |
| **One call per project** | Each project gets its own proper ask | Slower. The donor hears from you more than once |

**Until this is answered, the runway is either 3.4 days or 9.1 days.** That is the
difference between a comfortable month and a rushed week. The plan does not guess.

## 15.5 Donor value versus donor money

| Question | Answer |
|---|---|
| A donor gives ₹50,000 in BSCT. Which band? | **UPPER HIGH** |
| Do they appear on AFLF's UPPER HIGH list? | **Yes** |
| Do they appear on MANN's UPPER HIGH list? | **Yes** |
| Does the ₹50,000 show in AFLF? | **No.** It stays in BSCT |
| Does it show in MANN? | **No.** It stays in BSCT |
| Is it counted toward the BSCT target? | **Yes** |
| Toward AFLF and MANN targets? | **No.** They never received it |
| In plain words | **The donor is valuable to all three. The money belongs to one.** |

## 15.6 History

| Question | Answer |
|---|---|
| Will old dispositions survive? | **Yes.** Fully intact |
| Will they move to the new stations? | **No.** They stay under the old station names |
| Why? | The old assignment row is kept, marked `reassigned`. The call still finds it, and it still says the old station |
| Do we delete any station? | **No.** Retired, not deleted |
| Is extra reporting work needed? | **No** |

## 15.7 Rules of engagement

| Question | Answer |
|---|---|
| Who owns a donor who gives to more than one project? | **The same person can own them.** Agents hold stations freely |
| Does the donor get one owner overall? | Not forced by the station design. You chose free combinations |
| What happens to a promise, daily? | Due today comes first, then fresh donors |
| Is there a cap on promises? | **No** |
| Does the monthly reset move anything? | **No** |
| On a handover, what moves? | **Active promises only.** History, collections, and credit stay put |
| Who owns the credit? | Not decided. We did not change incentives |

## 15.8 Safety and data rules

| Question | Answer |
|---|---|
| Do we delete donors? | **No** |
| Do we delete stations? | **No** |
| Do we delete calls? | **No** |
| If a donor says "never call me again"? | They stay out, **permanently**, and history is kept |
| Is the raw database command kept? | **Yes** — super admins only, with every action logged |
| Are the unsecured database routes a problem? | **Yes.** Seven endpoints need login. Fixed in Phase 0 |
| Can each phase be undone? | **Yes.** Every one |

## 15.9 Order of work

| Question | Answer |
|---|---|
| Bands first or stations first? | **Bands first.** See the shape before moving anything |
| Do I need to approve before anything runs? | **Yes.** Dry run writes nothing |
| What happens if a band's pool is empty on refill? | The station **shrinks.** Nothing is substituted |
| What breaks if Phase 1 is skipped? | Every band count is computed from **partly wrong data** |

---

## PART 16 — APPROVAL CHECKLIST

Before Phase 5 runs, each line needs a yes.

| # | Check | Yes |
|---|---|---|
| 1 | Phase 0, 1, 2 complete | ☐ |
| 2 | Dry run output reviewed and accepted | ☐ |
| 3 | Real per-band counts per project known | ☐ |
| 4 | Shortfalls understood and accepted | ☐ |
| 5 | One test station allocated and verified | ☐ |
| 6 | Counts before and after match | ☐ |
| 7 | Backup taken | ☐ |
| 8 | Fresh stations confirmed unaffected | ☐ |
| 9 | Old station history confirmed intact | ☐ |
| 10 | Seven unsecured routes now require login | ☐ |
| 11 | Rollback tested | ☐ |
| 12 | Team informed of the new station names | ☐ |

---

**End of plan.**

*Every phase is reversible because no row is ever deleted. Start with Phase 0.*
