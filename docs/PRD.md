# PRD — Relation Crawl [QA] Chrome Extension

## Overview

**Relation Crawl** is a Chrome extension (Manifest V3) built for the FlixBus India QA/Revenue team. It fetches live bus-inventory data from the RedBus API for any city-pair and date, then displays a structured competitive analysis of FlixBus against key competitors in the India intercity bus market.

---

## Problem

QA and revenue analysts need to regularly check how FlixBus compares to competitors (IntrCity, ZingBus, Laxmi Travels) on a given route and date — covering pricing, load, departure times, and SRP ranking. Doing this manually on the RedBus website is slow and produces no structured, comparable data.

---

## Goals

1. Fetch all bus inventory for any India city-pair + date in one click.
2. Show FlixBus vs competitors side-by-side in a filterable table.
3. Provide an aggregated operator-level summary (avg price, load, departure range).
4. Allow CSV export of the full raw dataset for offline analysis.
5. Persist last results across popup re-opens so work isn't lost.

---

## Users

- FlixBus India QA team
- Revenue / pricing analysts who use RedBus as a benchmarking platform

---

## Features

### 1. Route & Date Selection
- Two city dropdowns (From / To), pre-populated with 70+ Indian cities.
- Date picker, defaulting to today.
- "Go to RedBus ↗" button opens the corresponding RedBus search page in a new tab.

### 2. RedBus Connection Status
- On popup open, the extension checks if a RedBus session is active.
- If not, connecting to `https://www.redbus.in` in a background tab sets the required auth cookies.
- Status bar shows: `Not Connected` → `Connecting...` → `Connected ✅` → `Fetching data...` → error states.

### 3. Compare (fetch + display)
Triggers a POST to the RedBus search API. Response is processed into:
- **Aggregated Comparison table** — one row per operator (FlixBus, IntrCity, ZingBus, Laxmi Travels) with: bus count, avg load %, avg/low/high prices, first/last departure, min/max prices.
- **All Buses table** — one row per individual bus with: Line Code, Bus Name, 1st BP Departure, Load %, Lowest/Avg/Highest price, Departure time, PBH, Seater/Sleeper flags, SRP Rank on RedBus, Price Points count.

### 4. Download (CSV export)
Downloads a CSV of the full raw inventory (all buses, all fields). Filename format: `<dojForFile>_<FromCity>_<ToCity>_<HH.MM>_<DD-MM-YY>.csv`

### 5. Filtering
- **Product type filter** (All / Hybrid / Sleeper / Seater) — controls both tables simultaneously.
- **Flix + IntrCity toggle** — narrows the All Buses table to only FlixBus and IntrCity rows.
- Filter state is persisted to `chrome.storage.local`.

### 6. Session Persistence
All fetched data (comparison, full rows, form inputs, filter state, bus count) is saved to `chrome.storage.local` and automatically restored when the popup re-opens.

### 7. Reset
The ↻ button clears all stored data, resets form inputs, hides tables, and resets the date to today.

---

## Data fields computed per bus

| Field | Description |
|---|---|
| SRP Rank | Position in `data.inventories` array (canonical RedBus ranking) |
| Line Code | FlixBus internal line code (e.g. `IN0310M`) via UUID lookup; `-` for non-Flix |
| Load % | `(totalSeats - availableSeats) / totalSeats × 100`; Flix uses hardcoded seat counts |
| Lowest Price | `min(fareList)` or `min(discountedPrices)` |
| Avg Price | `rdBoostInfo.wtPrice` if present, else mean of fareList; NA if single fareList entry |
| Highest Price | `max(fareList)`; NA if single fareList entry |
| PBH | Time until first boarding point (Flix) or departure (others); "Departed" if past |
| Price Points | Count of distinct fare price entries |
| Seater / Sleeper | Boolean flags from API, displayed as ✅ / ❌ |

---

## Visual design

- Popup width: 450 px.
- Brand primary: `#73d700` (FlixBus green) — used for buttons, table headers, FlixBus row highlights.
- FlixBus rows: light green tint with green left border.
- Red dot (●) prefix on operator name if any Flix bus on the route has a single fareList entry (data quality warning).
- Blue dot (●) prefix on bus name for Volvo buses.
- Tables: horizontally and vertically scrollable within a 300 px max-height wrapper.
- Sticky table headers.

---

## Out of scope

- Multi-route or batch comparisons (one city-pair per session).
- Historical data storage.
- Notifications or scheduled fetches.
- Non-India markets.
