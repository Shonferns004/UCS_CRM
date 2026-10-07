# Sevak Library --- Applications UI Design Specification

## 1. Overview

This document defines the UI/UX specification for the **Sevak Library →
Applications** module.

The screen should feel like a professional SaaS/admin CRM application
with:

-   Clear application lifecycle
-   Fast application search and filtering
-   Strong payment and verification visibility
-   Membership expiry tracking
-   Context-aware actions
-   Professional application details drawer
-   Consistent status and date formatting
-   Responsive desktop and mobile behavior

------------------------------------------------------------------------

# 2. Page Structure

``` text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sidebar │ Applications                                      [+ New Application] │
│         │ Manage membership applications and verification                    │
│         │                                                                      │
│         │ [Total] [Payment Pending] [Awaiting Verification] [Verified] ...   │
│         │                                                                      │
│         │ [ Search ................................ ] [Filters] [Export]      │
│         │                                                                      │
│         │ [All] [Payment Pending] [Awaiting Verification] [Verified] ...     │
│         │                                                                      │
│         │ Application Table                                                    │
│         │                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 3. Sidebar

### Navigation

``` text
Sevak Library
Being Sevak Charitable Trust

Dashboard
Applications        ← Active
Members
Coupons
Import Members
Reports
Settings
```

### Sidebar requirements

-   Fixed left sidebar on desktop.
-   Active item uses a light blue background.
-   Blue primary accent.
-   Icons should be simple line icons.
-   Sidebar should collapse on smaller screens.
-   Do not use excessive gradients.

------------------------------------------------------------------------

# 4. Page Header

``` text
Applications

Manage membership applications and verification

                                      [+ New Application]
```

### Requirements

-   Page title: 28--32px, semibold/bold.
-   Subtitle: 14px, muted gray.
-   New Application button aligned right.
-   Primary button uses the application's blue accent.

------------------------------------------------------------------------

# 5. Summary Statistics

Use compact cards.

``` text
┌──────────┐ ┌──────────────┐ ┌─────────────────────┐
│ 21       │ │ 4            │ │ 16                  │
│ Total    │ │ Payment      │ │ Awaiting            │
│          │ │ Pending      │ │ Verification        │
└──────────┘ └──────────────┘ └─────────────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐
│ 0          │ │ 1          │ │ 0          │
│ Verified   │ │ Approved   │ │ Rejected   │
└────────────┘ └────────────┘ └────────────┘
```

### Colors

-   Total: Blue
-   Payment Pending: Amber
-   Awaiting Verification: Blue
-   Verified: Green
-   Approved: Green
-   Rejected: Red

Keep cards compact. They should not dominate the page.

------------------------------------------------------------------------

# 6. Search and Filter Toolbar

``` text
[ 🔍 Search by name, reference, email, mobile number... ]

[ Filters ▼ ]   [ Export ↓ ]   [ Refresh ]
```

### Search

Search should support:

-   Full name
-   Application reference
-   Email
-   Mobile number
-   Payment reference
-   Transaction / UTR

### Filters

Filters should include:

``` text
Status
☐ Payment Pending
☐ Awaiting Verification
☐ Verified
☐ Approved
☐ Rejected

Plan
☐ Monthly
☐ Annual
☐ Half Monthly

Membership
☐ Active
☐ Expiring Soon
☐ Expired

Application Date
[ From ] [ To ]

Expiry Date
[ From ] [ To ]
```

Buttons:

``` text
[ Reset ] [ Apply Filters ]
```

------------------------------------------------------------------------

# 7. Status Tabs

``` text
[ All 21 ]
[ Payment Pending 4 ]
[ Awaiting Verification 16 ]
[ Verified 0 ]
[ Approved 1 ]
[ Rejected 0 ]
```

### Behavior

-   Active tab = blue filled pill.
-   Inactive tabs = white/very light background.
-   Count appears inside a small count badge.
-   Tabs should horizontally scroll on smaller screens.
-   Counts must come from the same backend filter logic as the table.

------------------------------------------------------------------------

# 8. Application Table

## Required columns

``` text
☐
Ref
Applicant
Plan
Fee
Status
Applied On
Days Remaining
Expire On
Actions
```

### Recommended desktop layout

``` text
┌────┬──────────────┬────────────────┬────────┬────────┬───────────────┬────────────┬──────────────┬────────────┬─────────┐
│ ☐  │ Ref          │ Applicant      │ Plan   │ Fee    │ Status        │ Applied On │ Days Remain.  │ Expire On  │ Actions │
├────┼──────────────┼────────────────┼────────┼────────┼───────────────┼────────────┼──────────────┼────────────┼─────────┤
│ ☐  │ SL-...       │ Vishal Dubey   │ Annual │ ₹19,800│ 🟡 Pending     │ 03 Oct     │ 🟢 18 days   │ 03 Nov     │ View ⋮  │
└────┴──────────────┴────────────────┴────────┴────────┴───────────────┴────────────┴──────────────┴────────────┴─────────┘
```

------------------------------------------------------------------------

# 9. Applicant Cell

Do not show only the name.

Use:

``` text
┌─────────────────────────────────┐
│ ●  Vishal Kumar Dubey           │
│    shubhamdubey05580@gmail.com  │
│    +91 98765 43210              │
└─────────────────────────────────┘
```

### Rules

-   Avatar: initials.
-   Name: 14px semibold.
-   Email: 12px muted.
-   Mobile: 12px muted.
-   Keep the cell compact.

------------------------------------------------------------------------

# 10. Reference Cell

Use a monospace font.

``` text
SL-20261003-
ED129A
```

or, where space allows:

``` text
SL-20261003-ED129A
```

Add copy functionality on hover/click.

------------------------------------------------------------------------

# 11. Date Formatting

Never expose raw ISO timestamps such as:

``` text
03T08:13:05.729Z/10/2026
```

Use:

``` text
03 Oct 2026
08:13 PM
```

For compact table display:

``` text
03 Oct 2026
08:13 PM
```

For detailed drawer:

``` text
07 October 2026 · 10:42 AM
```

Always use the application's intended timezone consistently.

------------------------------------------------------------------------

# 12. Applied On

Column:

``` text
Applied On
```

Display:

``` text
07 Oct 2026
10:42 AM
```

Do not combine an incorrectly formatted date and timestamp.

------------------------------------------------------------------------

# 13. Days Remaining

This is an important operational column.

### Display

``` text
🟢 25 days
🟢 18 days
🟡 12 days
🟠 5 days
🟠 2 days
🔴 0 days
🔴 Expired
```

### Color rules

  Condition    UI       Meaning
  ------------ -------- --------------------
  15+ days     Green    Healthy
  7--14 days   Yellow   Expiring soon
  1--6 days    Orange   Attention required
  0 days       Red      Expires today
  \< 0         Red      Expired

### Important

Do not rely only on color.

Always include text such as:

``` text
25 days
5 days
2 days
Expires today
Expired 2 days ago
```

------------------------------------------------------------------------

# 14. Expire On

Display:

``` text
07 Nov 2026
```

If expired:

``` text
07 Oct 2026
Expired
```

If the membership has no expiry date, show:

``` text
—
```

Do not show fake dates.

------------------------------------------------------------------------

# 15. Days Remaining Calculation

Use the membership expiry date.

Conceptually:

``` js
daysRemaining = Math.ceil(
  (expireOn - currentDate) / (1000 * 60 * 60 * 24)
);
```

Expected states:

``` text
daysRemaining > 14
→ green

daysRemaining >= 7
→ yellow

daysRemaining >= 1
→ orange

daysRemaining === 0
→ red / Expires today

daysRemaining < 0
→ red / Expired
```

The backend should preferably provide the canonical expiry date/status,
while the frontend formats it for display.

------------------------------------------------------------------------

# 16. Status Badge Design

### Payment Pending

``` text
🟡 Payment pending
Payment not received
```

Amber background with dark amber text.

### Awaiting Verification

``` text
🔵 Awaiting verification
```

Blue background with blue text.

### Verified

``` text
🟢 Verified
```

Green background.

### Approved

``` text
🟢 Approved
SL-2026-0001
```

Green background.

### Rejected

``` text
🔴 Rejected
```

Red background.

------------------------------------------------------------------------

# 17. Row Actions

Primary:

``` text
[ View ]
```

Secondary:

``` text
⋮
```

Menu:

``` text
View application
Edit details
Send payment reminder
Verify application
Approve
Reject
Delete
```

Actions must be context-aware.

Do not show actions that are not valid for the current application
state.

------------------------------------------------------------------------

# 18. Bulk Selection

Every row has a checkbox.

When nothing is selected:

``` text
Normal toolbar
```

When rows are selected:

``` text
3 selected

[ Send Payment Reminder ]
[ Export ]
[ Mark for Verification ]
[ Delete ]
```

Dangerous actions should require confirmation.

------------------------------------------------------------------------

# 19. Application Details Drawer

Recommended width:

``` text
Desktop: 520–600px
Mobile: 100%
```

Structure:

``` text
┌───────────────────────────────────────┐
│ Application Details               ×   │
│ SL-20261007-9ED419                   │
│                         🟡 Pending   │
├───────────────────────────────────────┤
│ Applicant Profile                    │
├───────────────────────────────────────┤
│ Application Progress                 │
├───────────────────────────────────────┤
│ Details | Documents | Payment | Activity
├───────────────────────────────────────┤
│ Content                              │
├───────────────────────────────────────┤
│ Fixed Action Bar                     │
└───────────────────────────────────────┘
```

------------------------------------------------------------------------

# 20. Drawer Header

``` text
Application Details

SL-20261007-9ED419

🟡 Payment pending
```

Applicant profile:

``` text
        ┌─────┐
        │  P  │
        └─────┘

PARMAR DHVANI ARVIND
Student · HSC

✉ dhvaniaparmar07@gmail.com
☎ +91 99676 56407
```

Add copy icons to email, mobile and reference.

------------------------------------------------------------------------

# 21. Application Progress

Use a horizontal progress indicator.

``` text
✓ Submitted
      │
      ▼
● Payment Pending
      │
      ▼
○ Verification
      │
      ▼
○ Approval
```

For completed applications:

``` text
✓ Submitted
✓ Payment
✓ Verification
✓ Approval
```

Status colors must match the application's status system.

------------------------------------------------------------------------

# 22. Drawer Tabs

Use:

``` text
Details
Documents
Payment
Activity
```

### Details

Contains personal, education, address and membership information.

### Documents

Contains identity proof and uploaded files.

### Payment

Contains payment reference, transaction/UTR, fee and payment history.

### Activity

Contains an audit timeline.

------------------------------------------------------------------------

# 23. Personal Information Card

``` text
PERSONAL INFORMATION

Full Name
PARMAR DHVANI ARVIND

Email
dhvaniaparmar07@gmail.com

Date of Birth
18 Jan 2007

Mobile
9967656407

Gender
Female

Guardian
Arvind B. Parmar
```

Use a clean two-column grid on desktop.

Collapse to one column on mobile.

------------------------------------------------------------------------

# 24. Education & Profile

``` text
EDUCATION & PROFILE

Category
Student

Occupation
Student

Qualification
HSC
```

------------------------------------------------------------------------

# 25. Address Card

``` text
ADDRESS

Shankar Lane, Kandivali West,
Mumbai, Maharashtra
400067
```

Do not squeeze long addresses into a tiny two-column cell.

------------------------------------------------------------------------

# 26. Membership & Payment Card

``` text
MEMBERSHIP & PAYMENT

Plan                    Monthly
Fee                     ₹1,650

Payment Status          🟡 Pending

Payment Reference       —
Transaction / UTR       —

Applied On              07 Oct 2026
Expire On               07 Nov 2026

Days Remaining          🟢 25 days
```

The payment status should be visually prominent.

------------------------------------------------------------------------

# 27. Documents

Example:

``` text
DOCUMENTS

┌──────────────────────────────────────┐
│ 🪪  Aadhaar Card                     │
│     Identity Proof                   │
│                                      │
│     [ Preview ] [ Download ]         │
└──────────────────────────────────────┘
```

Do not expose sensitive document data unnecessarily.

------------------------------------------------------------------------

# 28. Activity Timeline

Example:

``` text
ACTIVITY

● Application submitted
  07 Oct 2026 · 10:42 AM

● Payment reminder sent
  07 Oct 2026 · 11:15 AM

● Application opened by Accounts
  07 Oct 2026 · 11:20 AM
```

Every important administrative action should be auditable.

------------------------------------------------------------------------

# 29. Context-Aware Drawer Actions

## Payment Pending

``` text
[ Edit Details ]
[ Send Payment Reminder ]

[ Reject ] [ Delete ]
```

## Awaiting Verification

``` text
[ Edit Details ]
[ Verify Application ]

[ Reject ] [ Delete ]
```

## Verified

``` text
[ Edit Details ]
[ Approve & Send Email ]

[ Reject ] [ Delete ]
```

## Approved

``` text
[ View / Edit ]
[ Resend Approval Email ]
```

Do not present invalid actions.

------------------------------------------------------------------------

# 30. Approval Confirmation

Before approval:

``` text
Approve Application?

Applicant
PARMAR DHVANI ARVIND

Plan
Monthly

Fee
₹1,650

Verification
✓ Completed

Approval Reference
SL-2026-0012

☑ Send approval email

[ Cancel ] [ Approve & Send Email ]
```

------------------------------------------------------------------------

# 31. Reject Confirmation

Rejection reason should be mandatory.

``` text
Reject Application?

Reason
┌─────────────────────────────────────┐
│ Enter rejection reason...            │
└─────────────────────────────────────┘

[ Cancel ] [ Reject Application ]
```

------------------------------------------------------------------------

# 32. Delete Confirmation

``` text
Delete application?

PARMAR DHVANI ARVIND
SL-20261007-9ED419

This action cannot be undone.

[ Cancel ] [ Delete Application ]
```

Use a destructive red button.

------------------------------------------------------------------------

# 33. Pagination

Bottom-left:

``` text
Showing 1–10 of 21 applications
```

Bottom-right:

``` text
‹  1  2  3  ›

10 / page ▼
```

Recommended page sizes:

``` text
10
25
50
100
```

------------------------------------------------------------------------

# 34. Empty State

When there are no results:

``` text
          🔍

No applications found

Try changing your search or filters.

[ Clear Filters ]
```

Do not show an empty table with no explanation.

------------------------------------------------------------------------

# 35. Loading State

Use skeleton rows instead of a full-screen spinner.

``` text
████████
████████████████
██████
██████████
```

Show approximately 8--10 skeleton rows.

------------------------------------------------------------------------

# 36. Responsive Behavior

### Desktop

-   Sidebar visible.
-   Full application table.
-   Drawer width: 520--600px.
-   All columns visible.

### Tablet

-   Sidebar collapses.
-   Reduce secondary columns.
-   Keep Applicant, Status, Applied On, Days Remaining and Actions.

### Mobile

Replace the table with application cards:

``` text
┌──────────────────────────────┐
│ P  PARMAR DHVANI ARVIND      │
│    SL-20261007-9ED419        │
│                              │
│ Monthly       ₹1,650         │
│ 🟡 Payment pending           │
│                              │
│ Applied      07 Oct 2026     │
│ Remaining    🟢 25 days      │
│ Expires      07 Nov 2026     │
│                              │
│ [ View Application ]         │
└──────────────────────────────┘
```

------------------------------------------------------------------------

# 37. Typography

Recommended:

``` text
Font:
Inter / system-ui

Page title:
30px / 700

Section heading:
15–16px / 600

Body:
14px / 400–500

Secondary text:
12–13px

Table:
13–14px

Reference:
12–13px monospace
```

Avoid excessive font sizes.

------------------------------------------------------------------------

# 38. Color System

Primary:

``` text
Blue
#0B7FDB
```

Success:

``` text
Green
#16A34A
```

Warning:

``` text
Amber
#D97706
```

Danger:

``` text
Red
#DC2626
```

Neutral:

``` text
Text       #172033
Secondary  #667085
Border     #E5E7EB
Background #F7F9FC
White      #FFFFFF
```

Use pale backgrounds for badges instead of highly saturated fills.

------------------------------------------------------------------------

# 39. Visual Rules

-   Border radius: 8--12px.
-   Avoid excessive shadows.
-   Use subtle 1px borders.
-   Keep table row heights consistent.
-   Align currency values consistently.
-   Right-align numeric/currency columns where appropriate.
-   Keep status badges compact.
-   Use icons only where they communicate meaning.
-   Avoid decorative animations.
-   Use hover states for rows and action buttons.
-   Keep the interface professional and operational.

------------------------------------------------------------------------

# 40. Important Data Consistency

The status counts must match the actual filtered records.

For example:

``` text
All = Payment Pending
   + Awaiting Verification
   + Verified
   + Approved
   + Rejected
```

If statuses are mutually exclusive.

If an application has separate payment and verification states,
calculate each count independently from the backend.

Do not hardcode counts in the UI.

------------------------------------------------------------------------

# 41. Application Lifecycle

Recommended workflow:

``` text
Submitted
   ↓
Payment Pending
   ↓
Payment Received
   ↓
Awaiting Verification
   ↓
Verified
   ↓
Approved
```

Alternative failure path:

``` text
Any applicable stage
        ↓
     Rejected
```

Membership expiry should be independent from the approval workflow:

``` text
Approved
   ↓
Active Membership
   ↓
Expiring Soon
   ↓
Expired
```

------------------------------------------------------------------------

# 42. Final Recommended Table

``` text
┌────┬────────────────┬──────────────────┬─────────┬────────┬────────────────────┬────────────┬────────────────┬────────────┬─────────┐
│ ☐  │ Ref            │ Applicant        │ Plan    │ Fee    │ Status             │ Applied On │ Days Remaining  │ Expire On  │ Actions │
├────┼────────────────┼──────────────────┼─────────┼────────┼────────────────────┼────────────┼────────────────┼────────────┼─────────┤
│ ☐  │ SL-20261007... │ Parmar Dhvani    │ Monthly │ ₹1,650 │ 🟡 Payment pending │ 07 Oct     │ 🟢 25 days     │ 07 Nov     │ View ⋮  │
│    │                │ dhvani...        │         │        │                    │ 10:42 AM   │                │            │         │
├────┼────────────────┼──────────────────┼─────────┼────────┼────────────────────┼────────────┼────────────────┼────────────┼─────────┤
│ ☐  │ SL-20261003... │ Vishal Dubey     │ Annual  │₹19,800 │ 🟡 Payment pending │ 03 Oct     │ 🟢 18 days     │ 03 Nov     │ View ⋮  │
│    │                │ shubham...       │         │        │                    │ 08:13 PM   │                │            │         │
├────┼────────────────┼──────────────────┼─────────┼────────┼────────────────────┼────────────┼────────────────┼────────────┼─────────┤
│ ☐  │ SL-20260905... │ Ashutosh Jha     │ Monthly │ ₹1,650 │ 🟡 Payment pending │ 05 Sep     │ 🟡 5 days      │ 05 Oct     │ View ⋮  │
├────┼────────────────┼──────────────────┼─────────┼────────┼────────────────────┼────────────┼────────────────┼────────────┼─────────┤
│ ☐  │ SL-20260831... │ Vikas Singh      │ Monthly │ ₹1,650 │ 🟡 Payment pending │ 31 Aug     │ 🔴 2 days      │ 02 Oct     │ View ⋮  │
└────┴────────────────┴──────────────────┴─────────┴────────┴────────────────────┴────────────┴────────────────┴────────────┴─────────┘
```

------------------------------------------------------------------------

# 43. Design Goal

The final interface should communicate three things immediately:

### 1. What is happening?

``` text
Payment Pending
Awaiting Verification
Approved
```

### 2. What needs attention?

``` text
🟠 3 days
🔴 0 days
🔴 Expired
```

### 3. What should the admin do next?

``` text
Send Payment Reminder
Verify Application
Approve & Send Email
Reject
```

The admin should not need to open every application just to understand
its current state.

------------------------------------------------------------------------

# 44. Final UX Principle

The application list is not just a database table.

It should function as an **operations dashboard**:

``` text
SEARCH
   ↓
FILTER
   ↓
IDENTIFY STATUS
   ↓
CHECK EXPIRY
   ↓
OPEN APPLICATION
   ↓
TAKE CONTEXT-AWARE ACTION
   ↓
AUDIT ACTIVITY
```

This should be the design standard for the Sevak Library Applications
module.
