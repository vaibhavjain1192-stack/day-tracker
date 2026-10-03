# Morning Dashboard — handover

Paste this file plus `index.html`, `app.js`, `styles.css` and `Code.gs` into a new chat to continue.

---

## Deployment

| Piece | Where |
|---|---|
| Frontend | GitHub Pages at `vaibhavjain1192-stack.github.io/day-tracker/`: `index.html` (markup), `app.js` (logic), `styles.css`, plus `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable.png` |
| Backend | Google Apps Script web app, URL unchanged across deploys |
| CORS proxy | Cloudflare Worker `muddy-shadow-1aa7.vaibhavjain-1192.workers.dev` |
| Data | One Google Sheet, id `1m3PzwLcxgxUOdlt7QODzSKciLDocs5QvGSp24VGw0yo` |

**Files are versioned:** `index.html` loads `app.js?v=…` and `styles.css?v=…`. **Bump the `?v=` in index.html whenever app.js or styles.css changes**, so browsers fetch the new copy.

**Deploy order matters: Apps Script first, then the HTML.** The page calls actions that must already exist server-side. Apps Script: paste `Code.gs` → Save → Deploy → Manage deployments → ✏️ → New version → Deploy.

---

## Guide — done (stars in Sheet + new UI)

**Stars live in the Sheet.** `toggleGdStar(id)` flips `g.starred` at once and POSTs
`{sheet:'Guide', action:'star_guide', sheetId, starred:'yes'|'no'}`; if the write fails the star flips back and a toast says so.
`replaceGuideFromSheet` carries `starred` through (a star write still in flight wins over a stale read).

**One-time migration.** `migrateLegacyGdStars()` runs after the first Sheet load: any ids in the old
`localStorage.guide_stars` key are starred in the Sheet, then the key is deleted. If any write fails the key is kept and it retries next load.

**Guide UI.** Sticky search bar (`/` focuses it, Esc clears). Every word must match, in any field; if no entry has all words it falls back to any word and says so.
Matches are highlighted, and entries whose match is only in Why/Reading open themselves. Category chips show counts for the current search; a planet filter row;
Expand all / Collapse all; empty states with a reset button; Today's reminder opens its entry.

**Emotion groups collapse.** Each category is a clickable header (name, count, stars, planets). Closed by default;
open state saved in localStorage `gd_groups_open` (display preference). While searching/filtering, groups with results open automatically.
Expand all / Collapse all now covers groups and entry details.

**Duplicates.** Cause found: the Import button showed while the Guide was still loading (empty list), so an import could re-run
and add copies — the Sheet gained 7 extra copies of the first 7 Anger rows. Now: `gdLoaded` hides Import until the Sheet answers;
`importGuide` skips any situation already present; `replaceGuideFromSheet` hides rows with the same situation + action
(keeping the earliest, carrying over a star) and a banner offers "Remove duplicates from Sheet" (delete_guide per extra row). Open state is `gdOpen` (a Set). Add form is a collapsible `<details>`. CSV export includes Starred.

---

## Access key (security)

Script Property `DASH_KEY` (Apps Script → Project Settings → Script Properties). When set, `doGet` (any `action`) and
`doPost` refuse requests without it → `{status:'locked'}`; the bare health check still answers. The key is stored per
device in localStorage `dash_key`; `withKey()` appends it to every Worker GET and `postToSheet` puts it in the payload
(Code.gs deletes it before writing). A `locked` reply opens Settings in key-entry mode and skips the fallback loader.
`getCore` returns `keySet` (false → red warning on Morning until a key is set) and `lastBackup`.

## Settings (⚙ in the header)

Key entry/forget + setup steps; Reminders (downloads an .ics with three daily repeating events + alerts: open dashboard,
evening check-in, phone away; times kept in localStorage `rem_times`); Install on phone (manifest + `sw.js`,
network-first so updates show immediately; Sheet requests never cached); Backups status.

## Backups (Code.gs)

`setupMonthlyBackup()` — run once from the editor; creates a monthly trigger for `backupNow()` (copies the Sheet into
Drive folder "Morning Dashboard backups", keeps 12) and saves the first copy. Needs Drive permission when first run.

## Evening check-in + sleep (Morning)

Sleep row under the quote: "Last night slept at / woke at" → `DayLog` (date = the morning). Check-in under the rules:
each rule → Followed / Slipped / Didn't come up (`RuleCheck`; tap again clears) + one-line note. Before 6 PM it's a
one-line prompt ("Open now", "Check in for yesterday" before 2 PM if yesterday is empty). Writes go through
`queueSave(key,payload)`: one write per key in flight, newest state last.

## Weekly review (Morning, after the glance tiles)

Mon–Sun with ‹ ›. Last week's "do differently" answer at the top; Routine %, Food %, Rules followed %, situations
logged, average bedtime; rules sorted by most slipped; sleep summary; **last-30-days comparison of days after
bedtime ≤ 11 PM vs later** (routine %, food %, rule slips/day; shown once there are ≥3 of each); the week's answer
saved to `DayLog.weekNote` on the Monday. Re-renders after renderGlance, situations load, and check-in changes.

## Morning layout

Header (⚙) → key warning → quote → sleep → rules → evening check-in → feed (Kundali + Gratitude under "More",
localStorage `feed_more`) → calm → Situations box → glance → Weekly review → Habits → Checklist → **Library**
(My trackers, Situation plans, Five pillars, Anchor intentions; closed by default).
Situations tab: as you type "What happened?", `renderSitMatch` shows your matching rule, plan and Guide entry (via `ptTheme`).

## Daily rules (under the quote)

A standing list, not per-day: it carries forward until edited. Loaded in `getCore` as `dailyRules`.
Saving sends the whole list once: `{sheet:'DailyRules', action:'replace_all', changedOn, rules:JSON}`.
If `getCore` lacks `dailyRules` (old Code.gs), the section shows a deploy note and offers no save — an old
backend would route an unknown sheet into Morning Reflections. "Start with suggested rules" seeds `DR_SUGGESTED`.

---

## Food habits (Routine tab, under Today's routine)

Loaded in `getCore` as `foodHabits`, `foodTrack` (+ legacy `foodLog`). Each habit gets **Yes / No** per day
(`foodMarks[date][id] = {s, r}`); tapping the chosen answer again clears it. A **No** shows "What did you have?":
a dropdown of *that habit's own* past reasons (`foodReasons`, most used first) plus "+ Add a new reason…".
A first No with no past reasons opens the text box directly; a typed reason that matches an old one reuses its spelling.
Each change writes one `FoodTracker` row (`action` none, `status` yes/no/'' to clear). `foodSave` keeps one write per
habit-day in flight and sends only the newest state. Follows the routine calendar (`selectDate` → `renderFood`).
Habits apply from `addedOn` until `archivedOn` ("×" archives; "Stopped tracking" restores). Streak = days in a row
of Yes; an unmarked *today* doesn't break it. Morning glance "Food" tile = Yes count.
Older Code.gs (no `foodTrack` in core) → deploy note, no saves (unknown sheets would land in Morning Reflections).
Code.gs note: `findRowByKey` returns **-1** when not found, so always test `row > 0`, never `if (row)`.

---

## Food summary (Routine tab, under Food habits; starts closed)

Computed in the browser from `foodHabits` + `foodMarks`, so no Code.gs involvement. Ranges: last 7 / 30 days, this
month, last month, all time, or custom from–to (reversed dates are swapped). Shows follow % (Yes ÷ marked days;
unmarked days are counted separately, not as failures), Yes, No, perfect days; per habit bars with top miss reasons;
"What you ate when you missed" (reason counts across habits, with the habits each one broke); a day-by-day grid for
ranges ≤ 62 days; every No by date (15 shown, then "Show all"); CSV export of the range. Archived habits appear for
the days they were active, labelled "(stopped)". Header badge = follow % for the chosen range.

---

## Point thumbnails (all pages) and tab badges

`ptTile(trigger, response, {clearOnly, size})` draws a tinted tile with an **emoji** (same style as the tab bar,
never reusing a tab's own emoji). `ptTheme` checks `PT_THEMES` regexes against the trigger first (feelings before
contexts), then the response. Points (rules, Situations box, Situation plans, Guide) always get a tile (📝 if no
match); content cards use `clearOnly` so unclear items get none: Situation logs, Thoughts, Posts, Small learnings,
Kundali (size md), Gratitude items and today's habits (size sm; gratitude keeps 🙏 when unclear).
Guide cards use the theme tile instead of the planet glyph; the planet stays in the card footer and filter row.

**Badges on every tab:** `updateAllBadges()` sets Morning = rules, Routine = items left today, Learnings, Gratitude,
Kundali, Guide = totals (Situations/Thoughts/Posts keep their own). It runs after renderMotivation, renderGratitude,
renderKundali, renderGuide, renderDailyRules, renderRoutineRows and renderGlance (wrapped at the end of the script).
`.badge.zero` is hidden.

---

## Calm player (Morning, between rules and feed)

Sound is generated live with the Web Audio API (no audio files, no copyright, works offline): Soft pads
(Cmaj7→Am9→Fmaj7→G6), Ocean waves (LFO-swept brown noise), Gentle rain (filtered pink noise), Deep hum (136.1 Hz).
Each sound is a "session" (own bus/nodes/timers) so switching crossfades. Optional stop timer fades out over 9s.
Breathing guide 4-4-6 runs while playing. `calm_prefs` (sound, volume) is a display preference in localStorage.
Mobile browsers may pause audio when the screen locks.

**Home type scale:** section titles 13px/600 sans, body 13px, notes and labels 11px. Rules, calm, feed and the
Situations box all follow it (the Situations box title overrides `.focus-lbl` via `.sit-pairs .focus-lbl`).

---

## My feed for today (Morning, under the rules)

Video 1 = the carried-forward daily video (DailyFocus, ids vid-*). Video 2 + one card each from Small learnings
(Motivation sheet), Kundali, Guide and Gratitude are daily picks: `feedPick` scores hash(date|list|id) and takes the
lowest, so picks hold all day and adding an entry rarely reshuffles. Rendered after archives load (`feedReady`).
The Motivation tab is shown as **Small learnings**; the sheet and code names stay `Motivation`.
**Browsing:** each feed card (except video 1) shows ‹ "n / total" › (`feedPrev`/`feedNext` → `feedStep`, wrapping both ways).
"↺ Today's picks" (`feedReset`) in the feed header appears once any card has moved and puts every card back to 1. `feedOrder` sorts the whole list by
the same daily hash, so position 1 is always today's pick; `feedNext(key)` steps `feedPos[key]` and wraps after the
last. Positions live only in memory, so a refresh returns to today's picks, and `snap_feed` is never written once
you've browsed or when every list is empty. The fallback loader only marks the feed loaded if some feed data arrived.

---

## Tabs (9)

`morning · routine · situations · thoughts · posts · motivation · gratitude · kundali · guide`

**Morning** — greeting, quote, My rules for every day (DailyRules), Calm player, My feed for today, Situations & how I'll handle them (5 plans with outcome marks), Video to watch, glance cards, My trackers, Situation plans library, Habits I'm following, Daily checklist, Five pillars, Anchor intentions.

**Routine** — Master habit list, Today's routine (date strip + Yes/No per habit), Routine completion, Habit performance.

Sections collapse; state is in localStorage (a display preference, deliberately not Sheet data). Closed by default: checklist, anchors, master, pillars, habitperf, sitlib.

---

## Sheets

| Sheet | Holds | Key |
|---|---|---|
| `HabitMaster` | habit library for routines | sheetId |
| `RoutineItems` | habit↔routine links **with addedOn / removedOn** | sheetId |
| `RoutineLog` | per-day completion: `Done IDs`, `Missed` as `habitId~~reason` | date+routine |
| `RoutineDay` | which routine each day runs | date |
| `HabitReasons` | per-habit "why not" library | sheetId |
| `TodayHabits` | the simple habit list, `[✓] a \| [ ] b` | date |
| `DailyFocus` | focus, video URL/note, situations JSON | date |
| `SituationPlans` | when→do library, active/retired | sheetId |
| `SituationLog` | `{planId:{c:1,f:0}}` — came up / followed | date |
| `Guide` | 66 situations: category, planet, action, why, astro, **starred (J)** | sheetId |
| `RuleCheck` | evening check-in: one row per rule per day: Date ISO, Rule ID, Rule, Result (Followed / Slipped / Didn't come up) | Date ISO + Rule ID |
| `DayLog` | one row per day: Slept At (night before), Woke At, Note, Week Note (on the Monday) | Date ISO |
| `DailyRules` | standing when→do list under the quote; whole list rewritten by `replace_all` | sheetId |
| `FoodHabits` | food habit list: habit, order, Added On, Archived On (never deleted) | sheetId |
| `FoodTracker` | one row per habit per day: Date ISO, Habit ID, Habit, Followed (Yes/No), Reason | Date ISO + Habit ID |
| `FoodLog` | older: done IDs per day. Read only (counts as Yes), no longer written | Date ISO |
| `Situations` `Thoughts` `Posts` `Motivation` `Gratitude` `Kundali` | tab archives | sheetId |

---

## Design decisions worth preserving

**Sheet is the source of truth.** localStorage is wiped on load for all data keys. Only display preferences live there (section open/closed),
plus two **display-only snapshots** for instant first paint: `snap_daily_rules` (rules shown read-only, Edit hidden until the
Sheet answers) and `snap_feed` (today's rendered feed cards, used only when its date is today). Neither is ever written back.

**Columns are appended, never inserted.** An earlier migration inserted a column into `RoutineLog` and shifted already-written reason data into the wrong place. Pinned is Posts J, Images K, Starred is Guide J — all appended after `Logged At` so existing rows are untouched.

**Dated membership drives honest history.** `RoutineItems` carries `addedOn`/`removedOn`, so a habit added on day 31 is not counted against days 1–30, and removing stamps a leave date rather than deleting. Every stat resolves the routine's contents *as of* the day measured, via `itemsOn(routine, iso)`.

**Writes are coalesced, not parallel.** Rapid taps used to fire one request each; they completed out of order and overwrote each other, losing answers. `flushRoutineLog` debounces 450ms and allows one request in flight, queueing the next.

**Parallel load.** `getCore` (Home + Routine, incl. dailyRules) and `getArchives` (7 collections) are requested
**at the same time**; each is applied as it arrives. Timeouts: core 30s, archives 40s, single sections 20s, writes 45s.
If core fails, `fallback(skipArchives)` fetches the remaining sections **4 at a time**; if only archives fail, just those 7.
Server cache: `cachePutBig/cacheGetBig` split values into ≤90 KB pieces (Apps Script rejects >100 KB, and archives is
about that size), TTL 15 min, cleared by any write through doPost. Direct edits in the Sheet show within 15 min.
`doGet` wraps `doGetInner` so any uncaught error returns JSON `{status:'error', message}` instead of Google's HTML page.
`sheetFetch` resets `LAST_SHEET_ERROR` per call, reports timeouts as timeouts, and quotes the text of any HTML error page.

**Writes read one column, not the sheet.** `findRowByKey` / `findRowByDate` read only the key column. Full-sheet reads in writers were the main reason saving felt slow; the hot paths are converted, ~53 remain in colder paths.

---

## Known traps

**Block edits silently drop functions.** Several bugs came from replacing a JS block that happened to contain an unrelated function — `cleanTime`, `renderHabitPerf`, `renderVideoPreview` were each lost this way, and five functions ended up defined twice. **After any large edit, run this:**

```python
import re
from collections import Counter
js = open('app.js').read()
names = re.findall(r'(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(', js)
print("duplicates:", {k:v for k,v in Counter(names).items() if v>1})
# plus: every onclick in the HTML must resolve to a defined function
```

Note the `async function` part — an earlier version of this check missed those and reported false clean.

**Undeclared variables fail silently under strict mode.** `motView` was used in five places and declared in none, which stopped Motivation rendering after the counts. Check assignments resolve to a `var`.

**Old Code.gs → new pages.** Every new section checks that `getCore` returned its data and otherwise shows a
"deploy Code.gs" note instead of saving — an unknown sheet name in doPost falls through to Morning Reflections.

**Performance will degrade again.** The archives grow without bound. When loads slow down, the next lever is moving rows older than a year to an `Archive` tab — raising timeouts further is not the answer.

---

## Credentials in the file

ImgBB API key `eb426f1db804774ed1a4a3926acf2a2d` is hardcoded for screenshot upload, matching the Inner Compass page. Public repo, so it is visible — accepted deliberately.
