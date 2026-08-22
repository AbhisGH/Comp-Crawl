# BRD — Relation Crawl [QA] Chrome Extension

## Business Context

FlixBus India operates in a competitive intercity bus market where RedBus is the dominant aggregator platform. Monitoring competitor pricing, load levels, and SRP (Search Results Page) ranking on RedBus is a routine need for the India revenue and QA teams. This extension automates that monitoring workflow from within the browser.

---

## Stakeholders

| Stakeholder | Interest |
|---|---|
| FlixBus India QA team | Validate that FlixBus listings appear correctly on RedBus; spot data anomalies (missing fares, wrong seat counts) |
| Revenue / Pricing analysts | Benchmark FlixBus price competitiveness against IntrCity, ZingBus, Laxmi Travels |
| Author / Maintainer | Abhi (FlixBus B2E/B2B) |

---

## Business Rules

### Competitors tracked
The extension aggregates and compares against exactly four operators:
1. **FlixBus** — matched by `travelsName` containing `"flix"` (case-insensitive)
2. **IntrCity** — matched by `"intr"`
3. **ZingBus** — matched by `"zing"`
4. **Laxmi Travels** — matched by word-boundary regex `\blaxmi\b` (excludes "Mahalaxmi" which is a different operator)

### Seat count source of truth
RedBus often reports incorrect `totalSeats` values for FlixBus buses. The extension overrides this with hardcoded seat counts from `master_india_lines.csv` (stored in `LINE_SEAT_MAP`), keyed by the first 36 characters of `serviceId` (the FlixBus line UUID). Non-FlixBus buses use the API value.

### Average price reliability flag
When a FlixBus bus appears on RedBus with only a single entry in its `fareList`, it means pricing data is incomplete and averaging is meaningless. In this case:
- Average and Highest prices are shown as red "NA" in the UI.
- A red dot (●) is prepended to the FlixBus operator row in the Aggregated table.
- The flag `singleFareList: true` is set on the bus object and included in the CSV export.

This is a data quality signal that the analyst should investigate.

### Weighted average price
When `rdBoostInfo.wtPrice` is available in the API response (RedBus's own weighted price metric), it is used as the average price instead of a simple mean, to align with how RedBus itself displays pricing. This only applies to buses that do not have the `singleFareList` flag.

### SRP Rank definition
SRP Rank is the bus's position in the `data.inventories` array of the API response — this is the canonical order RedBus uses on the search results page. Boosted-inventory (`rdBoostedInv`) entries are excluded from rank calculation; if a serviceId appears in both boosted and inventory lists, only the inventory version is used.

### Load % calculation
`Load % = (totalSeats - availableSeats) / totalSeats × 100`

Rounded to one decimal place. Shows "NA" if `totalSeats` is 0 or unavailable. For FlixBus buses, `totalSeats` comes from `LINE_SEAT_MAP` (not the API).

### PBH (Pre-Bus Hours) business logic
PBH is a countdown to when the bus is accessible to the passenger:
- **FlixBus buses**: countdown is to `firstBpTime` (first boarding point), not departure. This is because FlixBus routes often have a significant gap between the first BP and the departure city.
- **All other operators**: countdown is to `departureTime`.
- Once the time has passed, shows "Departed".

### Data scope for UI vs CSV
- **UI tables (Aggregated + All Buses)**: show only `data.inventories` buses (organic search results). Boosted buses are excluded.
- **CSV export**: includes all buses — both `data.inventories` and `rdBoostedInv` (after deduplication). The `RedbusType` column in the CSV identifies the source.

### Comparison table scope
The "All Buses" table shows FlixBus + competitor buses only (not the full inventory). Buses from untracked operators are excluded from the comparison table but included in the CSV.

---

## RedBus API dependency

The extension is entirely dependent on the RedBus search API:
```
POST https://www.redbus.in/rpw/api/searchResults
```
This API requires valid RedBus session cookies (`credentials: "include"`). The background service worker ensures a RedBus tab is open and loaded before the first API call, which sets the necessary cookies.

**Risk**: If RedBus changes its API structure, authentication mechanism, or cookie requirements, the extension will break. There is no fallback data source.

---

## Data freshness

Data is fetched live on each "Compare" or "Download" action. Results are cached in `chrome.storage.local` and shown on popup re-open, but they represent the state at the time of the last fetch. No auto-refresh occurs.

---

## Constraints

- **Host permission scope**: limited to `https://www.redbus.in/*`. The extension cannot fetch data from any other domain.
- **Single route per session**: the extension compares one city-pair + date at a time. There is no bulk or batch mode.
- **India market only**: city list and line codes cover India routes only.
- **No backend**: all processing is client-side within the Chrome extension popup. No data is sent to any FlixBus server.

---

## Acceptance criteria summary

| # | Criterion |
|---|---|
| 1 | Fetching a route returns all buses from `data.inventories` (up to 1000, the API limit) |
| 2 | FlixBus rows are highlighted and sorted correctly by departure time |
| 3 | Load % for FlixBus uses hardcoded seat counts, not API values |
| 4 | Buses with `singleFareList = true` show red NA for avg and highest price |
| 5 | SRP Rank matches the bus's position on the actual RedBus search results page |
| 6 | CSV export includes both inventory and boosted buses with a `RedbusType` column |
| 7 | Product type filter (All/Hybrid/Sleeper/Seater) updates both tables simultaneously |
| 8 | Results persist across popup close/re-open without re-fetching |
| 9 | "Laxmi Travels" does not accidentally match "Mahalaxmi" or similar operator names |
| 10 | PBH for FlixBus counts down to `firstBpTime`, not `departureTime` |
