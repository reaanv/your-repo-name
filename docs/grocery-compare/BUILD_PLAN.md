# Build Plan — Grocery Price Compare

This is the backlog for building the system described in [ARCHITECTURE.md](./ARCHITECTURE.md). A cold-start build session should be able to run from this file alone.
- Sizes: **S** ≈ ½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days (part-time, with AI help). These are guesses.
- **Blocked** tickets wait on a decision or a Phase 0 result.

---

## 0. Kickoff checklist (before any ticket)

- [ ] PHASE0 §4 manual checks done and `phase0-survey.csv` filled in
- [ ] Value gate passed: weekly saving ≥ AED 15 (otherwise stop or knowingly go hobby-mode)
- [ ] Careem decision made: A / B / C (PHASE0 §3.3)
- [ ] Amazon Now eligibility known: a non-Prime throwaway account can or can't see prices
- [ ] Inputs from ARCHITECTURE §14 answered (memberships, language, top-up vs basket, home machine, her usual items)
- [ ] Home machine ready: always on, Docker installed, Tailscale installed and Funnel enabled on the personal plan
- [ ] Telegram bot created with @BotFather; token kept out of any repo
- [ ] **New repo created**, `docs/grocery-compare/*` copied in, this PR's branch left as the planning record

---

## Phase 1 — Skeleton on fake data

| ID | Ticket | Size | Acceptance criteria | Tests |
|---|---|---|---|---|
| T1.1 | Monorepo scaffold: pnpm workspaces, TS `strict`, Vitest, ESLint + Prettier, GitHub Actions CI (lint, typecheck, test) | S | CI is green on empty packages. Layout matches ARCHITECTURE §12. | CI run |
| T1.2 | `core/money`: parse and format fils | S | `"7.35"→735`, `"29"→2900`, `"5"→500`, `"1,234.50"→123450`, `"AED 6.25"→625`. Rejects `"abc"`, negatives and `NaN`. No floats stored anywhere. | Table tests + round-trip property test |
| T1.3 | `core/size`: size parser | M | **Every row in the §A corpus passes.** Unknown input returns `null` and sets `needsReview`, never throws. | Corpus test (§A) |
| T1.4 | `core/normalize`: brand dictionary, variant keywords (§B), noise stripping | M | `"Almarai Fresh Milk Full Fat"` and `"Almarai Full Fat Fresh Milk"` normalize to the same `{brand, variant set, core tokens}`. "Full Cream" = "Full Fat". | Table tests |
| T1.5 | `core/match`: tiers 0–5 (ARCHITECTURE §6) | M | All §C pairs give the expected tier. Bundles are never matched as single items. | Pair-table tests |
| T1.6 | Adapter contract + `adapters/fixture` (canned listings, configurable latency, status and failure mode) | S | Fixture adapter can simulate `ok`, `timeout`, `blocked`, `login_required` and `disabled`. | Unit tests |
| T1.7 | `db`: SQLite schema + migrations + typed queries (ARCHITECTURE §8) | M | Migrations are idempotent. FTS5 trigram finds "Almarai" from the query "mara". The latest-price query uses the index (check `EXPLAIN QUERY PLAN`). | Integration tests on a temp DB |
| T1.8 | Orchestrator + `GET /api/search` (SSE) | M | Cached results arrive first. When one fixture adapter takes 10 s, the others still stream within 1 s, and it's marked `timeout` at 6 s. `compared` / `notCompared` are filled in. A `search_log` row is written. | Integration tests with fixture adapters |
| T1.9 | PWA search screen | M | Installable (manifest + service worker). Body text ≥ 18 px. Voice input button (Web Speech API, hides itself if unsupported). Result card with cheapest badge and a big "Open in <app>" deep-link button. Footer with compared / not compared. **"This price is wrong" button** that logs a report. | Playwright e2e against fixture data; manual check on mom's actual phone |
| T1.10 | Demo to mom on fake data | S | She finds the cheapest option for 3 named items without help. Note her confusion points and fix the top 3. | Observation notes in `docs/` |

## Phase 2 — Real Noon adapter, persistence, deployment

| ID | Ticket | Size | Acceptance criteria | Tests |
|---|---|---|---|---|
| T2.1 | `adapters/noon-minutes/parser`: parse search and product-page HTML into `RawListing` | M | Parses fixtures saved from the home machine (≥ 3 search pages, ≥ 5 product pages, including an out-of-stock one). Extracts title, brand (from its own element, not the flattened text), size text, price, was-price, `isSponsored` ("Ad"), `isBundle` (title contains "Combo" or SKU matches `^V.*V-1$`), `inStock` ("Coming Back Soon!" = false), deep link. | Fixture contract tests |
| T2.2 | `adapters/noon-minutes/adapter`: Playwright persistent context, rate limiter, daily cap, circuit breaker, **URL allowlist** | M | Only requests `/uae-en/search/` and `/uae-en/now-product/` pages. Any `/_svc/`, `/_vs/` or `/_serverFn/` request throws in tests. ≤ 1 request per 3 s with jitter. 50 sequential lookups from the home IP finish with 0 `blocked`. | Unit tests for allowlist/limiter; one manual live run logged in `adapter_runs` |
| T2.3 | Persistence: upsert listings, append snapshots, quarantine (> 60% jump or outside AED 1–200), staleness ranking | M | Quarantined prices are stored but never ranked. Scraped prices: 4 h normal / 24 h greyed / older unranked. Manual prices: 7-day window. | Unit + integration tests |
| T2.4 | Home deployment: `docker-compose` (server + Tailscale sidecar with Funnel), link-token gate, nightly SQLite `.backup` | M | Mom opens the URL on 4G (off home Wi-Fi). Requests without the token get 401. A restored backup passes a smoke test. | Manual checklist recorded in `docs/` |
| T2.5 | Canary (3 items per enabled platform, daily) + Telegram alerts + `GET /api/platforms/health` | S | Breaking the parser on purpose triggers a Telegram message within one canary cycle. Health shows last status and age per platform. | Integration test with a mocked Telegram API |

**Gate:** 7 consecutive days of green canaries from the home machine.

## Phase 3 — Watchlist, fees, Amazon (MVP)

| ID | Ticket | Size | Acceptance criteria | Tests |
|---|---|---|---|---|
| T3.1 | Watchlist import: CSV (from the survey and her order screenshots) → canonical `products` + `watchlist` | S | Importing her list creates products with brand, variant and size parsed. Rows that fail to parse land in the review queue. | Import test with a sample CSV |
| T3.2 | Admin review screen (`/api/admin/review` + simple UI) | M | Each `probable` match shows side-by-side (title, size, image, price). Confirm/reject sets `match_method='human'`. The queue empties. | e2e test |
| T3.3 | Scheduler (`croner`): watchlist refresh 3×/day at jittered Dubai times; per-platform caps | S | Refresh times vary by ±20 min. Daily request cap is never exceeded (asserted in `adapter_runs`). | Unit test with fake clock |
| T3.4 | Fees + memberships: seed file / small admin form; landed-price note in the UI | S | With Prime set, an AED 20 basket shows the AED 6 Amazon Now fee and AED 25+ shows free. The note appears when fees flip the winner. | Pricing tests |
| T3.5 | **Blocked → PHASE0 §4.3.** `adapters/amazon-now`: logged-in **throwaway** persistent profile, watchlist only, 1×/day | M | Login expiry gives `login_required` plus a Telegram alert, never a crash. Never runs against mom's account (her account email isn't present anywhere in config). | Fixture parser tests; manual live run |
| T3.6 | **Blocked → D15 (Careem B) or Amazon fallback.** Manual-price adapter + `/api/admin/manual-price` form | S | Entered prices show the "entered by hand" badge and drop out of ranking after 7 days. | Unit tests |
| T3.7 | "Cheaper alternative" section using unit price | S | For "Almarai Fresh Milk Full Fat 1L", the cheapest same-variant 1L alternative of another brand shows its per-100 ml price. Different variants (Low Fat, Long Life) are never offered as alternatives to Full Fat Fresh. | Unit tests |

## Phase 4 — Nice-to-haves

| ID | Ticket | Size | Notes |
|---|---|---|---|
| T4.1 | Basket compare (ARCHITECTURE §7) | M | Needs top-up vs basket answered |
| T4.2 | Price-drop alerts to mom (web push via the installed PWA) | M | iOS web push needs the PWA installed to the home screen |
| T4.3 | Careem option A (app API) | L | **Only if** you explicitly accept the risk and the survey shows Careem often wins |

---

## MVP definition of done (end of Phase 3)

1. Mom searches any watchlist item and sees prices from every enabled platform, or a "couldn't check" / "not compared" label, in **< 1 s** from cache.
2. One tap opens the cheapest item in its app.
3. Fees for her memberships are applied, and the UI says when fees flip the result.
4. A broken adapter reaches you on Telegram within **24 h**. Mom never sees an error page.
5. Running cost is **$0/month** (electricity aside).

## Success metrics (measured over the first 4 weeks after MVP)

- **She actually uses it:** ≥ 3 searches/week, from `search_log`.
- **It's accurate:** ≤ 1 "this price is wrong" report per week, and every report gets a root cause.
- **It saves money:** measured weekly saving ≥ the Phase 0 value-gate figure.
- **It's reliable:** ≥ 90% of canaries green per platform.

If usage drops below 1 search/week for 2 weeks running, stop maintaining it. That's the honest kill switch.

---

## §A Size-parser corpus

Output: `{ value, unit, packCount }`. `value` is per unit in a base unit (ml / g / pc), and the total is `value × packCount`. The first block are **real strings captured from Noon in Phase 0**.

| # | Input | value | unit | packCount | Note |
|---|---|---|---|---|---|
| 1 | `1L` | 1000 | ml | 1 | real |
| 2 | `2L` | 2000 | ml | 1 | real |
| 3 | `500ml` | 500 | ml | 1 | real |
| 4 | `180ml` | 180 | ml | 1 | real |
| 5 | `1 Gallon` | 3785 | ml | 1 | real. Assumes US gallon; check against the pack label |
| 6 | `4x1L` | 1000 | ml | 4 | real |
| 7 | `18x125ml` | 125 | ml | 18 | real |
| 8 | `Packaging Disclaimer - Packaging May Vary4x1L` | 1000 | ml | 4 | real, noise glued to the size |
| 9 | `6x170g` | 170 | g | 6 | real |
| 10 | `1Kg` | 1000 | g | 1 | real |
| 11 | `1kg` | 1000 | g | 1 | real |
| 12 | `500g` | 500 | g | 1 | real |
| 13 | `150g - 8.5g Protein` | 150 | g | 1 | real, ignore the nutrition claim |
| 14 | `120g - 8 Triangles` | 120 | g | 1 | real, total weight wins over piece count |
| 15 | `2x180g` | 180 | g | 2 | real |
| 16 | `(4 x 66g)` | 66 | g | 4 | real |
| 17 | `4x100g` | 100 | g | 4 | real |
| 18 | `10 Capsules (56g)` | 56 | g | 1 | real, an explicit weight wins |
| 19 | `1.4L` | 1400 | ml | 1 | real |
| 20 | `385ml` | 385 | ml | 1 | real |
| 21 | `1.5L` | 1500 | ml | 1 | |
| 22 | `1 Litre` | 1000 | ml | 1 | |
| 23 | `1 ltr` | 1000 | ml | 1 | |
| 24 | `750 ML` | 750 | ml | 1 | |
| 25 | `6 x 200 ml` | 200 | ml | 6 | |
| 26 | `2 x 1.5L` | 1500 | ml | 2 | |
| 27 | `Pack of 12` | 1 | pc | 12 | |
| 28 | `12 pcs` | 1 | pc | 12 | |
| 29 | `30 Pieces` | 1 | pc | 30 | |
| 30 | `1 Pc` | 1 | pc | 1 | |
| 31 | `٥٠٠ مل` | 500 | ml | 1 | Arabic-Indic digits + "مل" |
| 32 | `١ لتر` | 1000 | ml | 1 | "لتر" = litre |
| 33 | `٤٠٠ غ` | 400 | g | 1 | "غ" = gram |
| 34 | `Large` | null | — | — | `needsReview` |
| 35 | *(empty)* | null | — | — | `needsReview` |

## §B Variant keywords (normalize to one canonical tag)

| Tag | Synonyms seen or expected |
|---|---|
| `full_fat` | full fat, full cream, whole |
| `low_fat` | low fat, semi skimmed, light, lite |
| `fat_free` | fat free, skimmed, skim, 0% fat |
| `fresh` | fresh |
| `long_life` | long life, UHT |
| `salted` / `unsalted` | salted / unsalted |
| `plain` | plain, natural (dairy context) |
| flavour tags | chocolate, strawberry, mango, vanilla, banana… |

**Rule:** if the variant tag sets differ, it is **not** an exact match. It's at best an `alternative`.

## §C Matcher pair table (expected tiers)

| A | B | Expected |
|---|---|---|
| Almarai Fresh Milk Full Fat · 1L | Almarai Full Fat Fresh Milk · 1 Litre | `exact` |
| Almarai Fresh Milk Full Fat · 1L | Almarai Fresh Milk Full Cream · 1L | `exact` (full cream = full fat) |
| Almarai Fresh Milk Full Fat · 1L | Almarai Fresh Milk Low Fat · 1L | `alternative` |
| Almarai Fresh Milk Full Fat · 1L | Almarai Long Life Milk Full Fat · 1L | `alternative` |
| Almarai Fresh Milk Full Fat · 1L | Almarai Fresh Milk Full Fat · 2L | `alternative` (size differs) |
| Almarai Fresh Milk Full Fat · 1L | MLK Fresh Milk Full Fat · 1L | `alternative` (brand differs) |
| Almarai Fresh Milk Full Fat · 2L | Nestle Gold Corn Flakes 375G & Almarai Fresh Milk Full Fat 2L Combo | **excluded** (bundle) |
| Almarai Long Life Milk Full Fat · 4x1L | Almarai Long Life Milk Full Fat · Packaging Disclaimer - Packaging May Vary4x1L | `exact` |
| Almarai Natural Butter Salted · 400g | Almarai Natural Butter Unsalted · 4x100g | `alternative` |
| Al Rawabi Fresh Milk Full Fat · 1L | Almarai Fresh Milk Full Fat · 1L | `alternative` |
