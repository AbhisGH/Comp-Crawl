# CLAUDE.md — Relation Crawl [QA] Chrome Extension

## What this is

A Manifest V3 Chrome extension built for the FlixBus India QA team. It fetches live bus inventory from the RedBus API for any city-pair + date, then presents a structured competitive analysis comparing FlixBus against IntrCity, ZingBus, and Laxmi Travels.

## File map

| File | Role |
|---|---|
| `manifest.json` | Extension config (MV3, permissions, entry points) |
| `background.js` | Service worker — manages the RedBus tab/cookie session |
| `popup.html` | Extension popup UI (450 px wide, two tables + controls) |
| `popup.js` | All application logic (~900 lines) |
| `styles.css` | FlixBus-branded styling (primary green: `#73d700`) |
| `Temp/` | Working files: ZIP backup, CSV, older JS snapshots |

## Architecture

```
popup.html  →  popup.js
                 │
                 ├── chrome.runtime.sendMessage (INIT_REDBUS / CHECK_REDBUS_STATUS)
                 │         ↓
                 │    background.js (service worker)
                 │         └── opens https://www.redbus.in in background tab
                 │              (sets auth cookies so the API call works)
                 │
                 └── fetch POST → https://www.redbus.in/rpw/api/searchResults
                       credentials: "include"  (relies on cookies above)
```

## Key data structures in popup.js

### Static lookup maps (hardcoded)
- **`cities`** — city name → RedBus city ID (70+ Indian cities)
- **`LINE_UUID_MAP`** — FlixBus line UUID (first 36 chars of `serviceId`) → line code (e.g. `IN0310M`). Source: `master_india_lines.csv` (UUIDs must match what the RedBus API returns in `serviceId`).
- **`LINE_SEAT_MAP`** — FlixBus line UUID → total seat count. Source: `Temp/indian_next_ride_capacity.xlsx` (CAPACITY column, cross-referenced to `LINE_UUID_MAP` via LINE_CODE). Only consulted when `singleFareList` is true — otherwise `bus.totalSeats` from the API is used.

### Runtime globals
- **`allComparisonData`** — array of processed bus objects shown in the "All buses" table (inventory buses only, filtered to Flix + competitors)
- **`allRowsData`** — full inventory-only bus array (powers the Aggregated table and CSV export)
- **`focusFilterActive`** — boolean toggle for "Flix + IntrCity" focus view

### Bus object shape (produced by `fetchAndProcessData`)
```
{
  SRPRank, lineCode, serviceId, travelsName,
  LowestPrice, AveragePrice, HighestPrice,
  singleFareList,        // true = Flix bus with 1 fareList entry → avg/high shown as NA
  DiscountedPrices, fareList, pricePoints,
  LoadPct, availableSeats, totalSeats,
  departureTime, firstBpTime, PBH,
  journeyDurationMin, busType, isSeater, isSleeper,
  totalRatings, numberOfReviews, RedbusType
}
```

## Core logic notes

**Load %** — Uses `bus.totalSeats` from the API for all buses. Exception: when `singleFareList` is true (Flix bus with a single `fareList` entry), the API's `totalSeats` is unreliable, so `LINE_SEAT_MAP` (sheet capacity) is used instead. Falls back to `bus.totalSeats` if the UUID is not found in the map.

**Average price** — Uses `rdBoostInfo.wtPrice` (weighted price) if present; otherwise calculates mean of `fareList`. For Flix buses with a single `fareList` entry, average and highest are suppressed (shown as red "NA") because the data is meaningless.

**PBH (Pre-Bus Hours)** — For Flix buses: time until `firstBpTime` (first boarding point). For all others: time until `departureTime`. Shown as "Departed" once the time has passed.

**SRP Rank** — Taken from the position of `bus.serviceId` in `data.inventories` (the canonical ranking array). Boosted-inventory duplicates are excluded before ranking.

**Deduplication** — `rdBoostedInv` entries that share a `serviceId` with `data.inventories` are dropped; inventory version wins. The UI and aggregations use `inventories` only.

**Operator matching keywords**
- FlixBus → `.includes("flix")`
- IntrCity → `.includes("intr")`
- ZingBus → `.includes("zing")`
- Laxmi Travels → word-boundary regex `\blaxmi\b` (avoids matching "Mahalaxmi")

**Session persistence** — On every successful fetch, results are saved to `chrome.storage.local` and automatically restored when the popup re-opens.

## RedBus API call

```
POST https://www.redbus.in/rpw/api/searchResults
  ?fromCity=<id>&toCity=<id>&DOJ=<DD-Mon-YYYY>&limit=1000&offset=0
  &meta=true&groupId=0&sectionId=0&sort=0&sortOrder=0
  &from=initialLoad&getUuid=true&bT=1&clearLMBFilter=undefined

Body: { appliedFilterCount: 0, onlyShow: [], dt: [], SeaterType: [], ... }
credentials: "include"
```

The call requires valid RedBus cookies — handled by opening `https://www.redbus.in` in a background tab via `background.js` before the first fetch.

## Permissions used

| Permission | Why |
|---|---|
| `activeTab` | Navigate current tab |
| `scripting` | Inject scripts if needed |
| `storage` | Session persistence (chrome.storage.local) |
| `tabs` | Open background RedBus tab for cookie init |
| `cookies` | Read/write redbus.in cookies |
| `host_permissions: https://www.redbus.in/*` | Cross-origin fetch to RedBus API |

## Common tasks

**Add a new city** — Add `"CityName": <redbusId>` to the `cities` object in `popup.js`. Dropdowns are populated and sorted alphabetically at runtime.

**Add a new operator to the aggregated table** — Add a new `aggregateOperator(filteredRows, "keyword", "Label")` call in `renderOperatorTable()` and a matching `<tr>` render block.

**Update seat counts** — Edit `LINE_SEAT_MAP` in `popup.js`. Source of truth is `Temp/indian_next_ride_capacity.xlsx` (LINE_CODE + CAPACITY columns). Cross-reference via LINE_CODE to the existing UUIDs in `LINE_UUID_MAP`.

**Add a new line code mapping** — Edit `LINE_UUID_MAP` in `popup.js`. The key is the first 36 characters of the FlixBus `serviceId`.
