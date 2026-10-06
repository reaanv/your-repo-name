# Phase 0 Findings — Platform Access & Value Check

**Date of probe:** 2026-10-06
**Scope:** Noon Minutes, Careem Quik, Amazon Now (Dubai). Talabat Mart and Deliveroo HOP are out of scope by decision.
**How:**
- plain `curl` from a US cloud IP;
- Firecrawl with a UAE exit IP (4 page fetches total);
- public sources.

No logged-in sessions. No mobile-app inspection. No calls to any endpoint that robots.txt disallows.

> **Headline:** only **one of the three platforms (Noon Minutes) can be reached cleanly**, without login, from the web.
> - Amazon Now has a website but needs **sign-in just to browse**.
> - Careem Quik looks **app-only**.
>
> As things stand, the free and low-risk route gives a two-way comparison at best (Noon vs Amazon), with Careem filled in by hand or dropped. Decide on that before you build.

---

## 1. Summary

| Platform | Web storefront? | Prices visible without login? | Anti-bot seen | Address handling | Data path | Verdict | Confidence |
|---|---|---|---|---|---|---|---|
| **Noon Minutes** | **Yes**: `minutes.noon.com` | **Yes** (search + product pages) | Cloudflare "Just a moment…" challenge for plain curl from a US datacenter IP. **Passed** from a UAE IP via Firecrawl. | Pages render with **no address set**. Whether that price matches mom's dark store is **unknown** | Server-rendered HTML of search and product pages. Product URLs are published in public sitemaps. | **GO**: tier 3 (web) | High (access), Low (address effect) |
| **Amazon Now** | **Yes**: `amazon.ae/now` | **No**. Redirects to the Amazon sign-in page (seen from both US and UAE IPs). | Login wall | Needs a signed-in account with a delivery address | Logged-in browser session only | **CONDITIONAL**: see §3.2 | High (login wall) |
| **Careem Quik** | **Not found**. `careem.com/en-AE/groceries/` is a marketing page with App Store / Google Play links. | n/a | `app.careem.com` returns Cloudflare 403 from a datacenter IP | In-app only | Mobile app only | **NO-GO** for the free, low-risk path. See §3.3. | Medium-high |

---

## 2. Evidence

### 2.1 Noon Minutes
- **Storefront:** `https://minutes.noon.com/uae-en/`. Site name in the page metadata: "noon Minutes". Page timezone: `Asia/Dubai`.
- **robots.txt** (`https://minutes.noon.com/robots.txt`), fetched 2026-10-06:
  ```
  User-agent: *
  Disallow: /_svc/
  Disallow: /_vs/
  Disallow: /_serverFn/
  Disallow: /*/wvl/
  Disallow: /*/wv/
  Allow: /
  ```
  → Product and search pages are allowed. **The internal API paths (`/_svc/`, `/_serverFn/`) are disallowed.** Our adapter will parse HTML pages and **never call those endpoints**, even though the site's own JavaScript does. That's the defensible position.
- **Sitemaps:** `https://f.nooncdn.com/noon-cdn/s/app/minutes-web/sitemap-index.xml` lists 9 product (`sitemap-pdp-*`) and several listing (`sitemap-plp-*`) files. `sitemap-pdp-0.xml` alone has **10,000 product URLs**, shaped `https://minutes.noon.com/uae-en/now-product/<SKU>-1/`. Product pages are meant to be public and indexed (`robots: index, follow`).
- **Search page:** `https://minutes.noon.com/uae-en/search/?q=almarai%20milk` returned HTTP 200 with titles, sizes, current price and strikethrough price, with no login. 17 pages of results. Its meta tag is `noindex, follow` (not for indexing, but not disallowed either).
- **Product page:** shows title, variant, price, was-price and stock state ("Coming Back Soon!" = out of stock).
- **Cloudflare:** plain `curl` from a US cloud IP got `403` + "Just a moment…" (a JS challenge). Firecrawl's basic proxy from a UAE IP got `200`. **Implication:** run the collector from a home IP in Dubai with a real browser (Playwright). Don't run it from a cloud server.

**Sample prices captured** (2026-10-06, no address set, AED). These seed the test fixtures and are **not** proof of what mom would pay.

| Title (as listed) | Size text | Price | Was |
|---|---|---|---|
| Almarai Fresh Milk Full Fat | 1L | 7.35 | — |
| Almarai Fresh Milk Full Fat | 2L | 12.50 | 13.50 |
| Almarai Fresh Milk Full Fat | 500ml | 3.70 | — |
| Almarai Fresh Milk Full Fat | 1 Gallon | 21.80 | 23.80 |
| Almarai Fresh Milk Low Fat | 1L | 7.35 | — |
| Almarai Long Life Milk Full Fat | 1L | 5.95 | — |
| Almarai Long Life Milk Full Fat | Packaging Disclaimer - Packaging May Vary4x1L | 18.95 | 21.95 |
| MLK Fresh Milk Full Fat | 1L | 6.25 | 7.10 |
| Nadec Long Life Milk Full Fat | 18x125ml | 19.95 | — |

**Data quirks the parser and matcher must handle** (all seen in the real output):
- **Sponsored results** ("Ad") mixed into search results. Don't treat their position as relevance.
- **Combo bundles**: "Nestle Gold Corn Flakes 375G & Almarai Fresh Milk Full Fat 2L Combo". Their SKUs start with `V…V-1` instead of `Z…Z-1`. **Exclude combos** from single-item matching.
- **Noise inside the size field**: `Packaging Disclaimer - Packaging May Vary4x1L` (no space before `4x1L`), `150g - 8.5g Protein`, `120g - 8 Triangles`.
- **Units:** `1 Gallon`, `1Kg` vs `1kg`, `4x1L`, `18x125ml`, `2x180g`, `6x170g`, `(4 x 66g)`.
- **Prices without a currency label**, e.g. `7.35`, and whole numbers like `29` or `5`.
- **Brand glued to the title** in the markdown output (`OgxBrazilian Keratin…`). Use the separate brand element in the HTML, not the flattened text.

### 2.2 Amazon Now
- `https://www.amazon.ae/now` → `301` → `https://www.amazon.ae/tez/browse?qcbrand=…`. For an anonymous visitor that then goes to `https://www.amazon.ae/ap/signin?…openid.assoc_handle=amzn_tez_discovery_ae_ae…`. This happened from both a US IP (curl) and a UAE IP (Firecrawl).
- **Sign-in is needed even to browse.** There are no public product pages comparable to Noon's.
- Fees (Amazon's own announcement): "Prime members using the service can enjoy free shipping on Amazon Now orders above AED 25 or pay a delivery fee of only AED 6 per order for basket sizes below this value." ([aboutamazon.com](https://www.aboutamazon.com/news/innovation/amazon-now-delivery-uae))
- **Conflicting reports on eligibility.** Some secondary coverage says Amazon Now is **Prime-only**, and Amazon's announcement only states Prime fees. **UNVERIFIED** whether a non-Prime account can see Now prices.
- Amazon's Conditions of Use (amazon.com version) forbid "data mining, robots, or similar data gathering and extraction tools". I didn't check the amazon.ae wording; assume it's the same.
- Listed Dubai coverage includes Dubai Marina, JBR, JLT, Silicon Oasis, Barsha, JVC, Karama, Mizhar, Warqa, Business Bay, Al Nahda, DIP, Festival City, Arjan, Jebel Ali, Al Sufouh, Al Bada, Raffa, Rashidiya and Meydan. **Check mom's area is on it.**

### 2.3 Careem Quik
- `https://www.careem.com/en-AE/groceries/` → page title "Quik | Careem". Its "Order now" buttons link back to the same page with a `trigId` tracking parameter (an app-install / deep-link funnel), next to App Store and Google Play badges. No product listing, prices or search.
- `https://www.careem.com/en-AE/quik/` → 404.
- `https://app.careem.com/` → Cloudflare 403 from a datacenter IP. I didn't investigate further, since there's no sign it hosts Quik shopping.
- Public coverage describes Quik as ordered "directly through the Careem super app". ([Gulf Business](https://gulfbusiness.com/careem-launches-15-minute-grocery-delivery-service-in-dubai))
- **Conclusion: app-only.** The only automated route is intercepting the app's private API traffic. That means:
  - an Android emulator or rooted phone plus a traffic-inspection proxy;
  - probably getting around certificate pinning;
  - a clear ToS breach;
  - real risk to the account used.

---

## 3. Per-platform recommendation

### 3.1 Noon Minutes → **GO (web, tier 3)**
- Collector: Playwright running on the home machine (Dubai residential IP). For watchlist items, fetch product pages by SKU URL. For live searches, use the search page.
- Limits:
  - only parse HTML;
  - never call `/_svc/` or `/_serverFn/`;
  - at most 1 request every 3–5 s with jitter;
  - watchlist refresh 2–3× a day.
- **Open risk:** the web page shows a price with **no address**. If dark-store pricing differs by area, these prices could be wrong for mom. Test in §4 step 2.

### 3.2 Amazon Now → **CONDITIONAL**
1. Use a **separate Amazon.ae account that isn't mom's**, with mom's area as its delivery address, and check whether it can open `amazon.ae/now` and see prices.
   - **If yes:** a logged-in Playwright session with a saved browser profile, **watchlist items only, once a day**. Accept a small risk that this throwaway account gets banned.
   - **If it's Prime-only:** the only working account is mom's paid Prime account. **Do not automate it.** Losing it costs real money. Fall back to manual price entry for her watchlist items, or drop Amazon Now from v1.
2. Fees are known (above), so the fee schedule can be hard-coded and re-checked monthly.

### 3.3 Careem Quik → **NO-GO for automation (at $0 and low risk). Decision needed.**

| Option | Effort | Risk | Honest take |
|---|---|---|---|
| A. Intercept the app's API (tier 4) | High (emulator, proxy, possible pinning bypass) | Highest (ToS, account ban, legal grey zone, see ARCHITECTURE R2) | Possible, but the most fragile and riskiest piece of the whole project |
| B. Manual weekly entry of Careem prices for her top ~20 items | ~10 min/week | None | **Most likely to be abandoned within a month.** Manual chores die. |
| C. Drop Careem from v1 | None | None | Product shows "Noon vs Amazon" only, and says so |

**Recommendation:** C for v1. Revisit A only if the Phase 0 survey shows Careem is often the cheapest by a meaningful margin. If it rarely wins, leaving it out costs nothing.

---

## 4. Manual checks still needed (phone in hand, ~45 min total)

These can't be done from a server. Do them at mom's address.

1. **Price survey (value gate).** Fill `phase0-survey.csv`: 20 of mom's real repeat items × 3 apps. Use her account as she normally shops. Just look, don't buy.
2. **Does address change Noon's price?** For 5 items, compare the price in the Noon Minutes app at mom's address with the web price at `minutes.noon.com` with no address set. If they differ, the adapter must set an address (more work, and possibly needs login).
3. **Amazon Now eligibility.** Can a non-Prime, non-mom Amazon.ae account see Now prices for her area? (§3.2)
4. **Coverage.** Confirm all 3 apps deliver to her address (dark-store coverage).
5. **Fees and memberships.** Write down each app's delivery fee, minimum order and small-order fee at her address, and which memberships she has (Prime / noon One / Careem Plus).

### Value-gate formula
```
For each item i she buys in a typical week (qty_i):
  saving_i = qty_i × (price on the app she'd normally use − cheapest price among the apps)
weekly_saving = Σ saving_i − extra delivery fees caused by splitting orders
```
- **weekly_saving < AED 15** → stop, or build it as a hobby knowing it won't pay back the time.
- **AED 15–40** → build the lean v1 (Noon + Amazon).
- **> AED 40, and Careem often the cheapest** → reconsider Careem option A.

I have no data yet on which band she falls into. The survey is what tells you.

---

## 5. Sources
- Noon Minutes storefront, robots.txt, sitemap index, search and product pages: `minutes.noon.com` (fetched 2026-10-06)
- Amazon Now launch, fees and coverage: [About Amazon](https://www.aboutamazon.com/news/innovation/amazon-now-delivery-uae), [Gulf Business](https://gulfbusiness.com/en/2025/retail/amazon-launches-amazon-now-service-across-uae/), [Communicate](https://communicateonline.me/news/amazon-gets-faster-in-the-uae-with-amazon-now-delivery-in-minutes-and-thousands-of-items-available-within-two-hours/)
- Careem Quik app-based ordering: [Gulf Business](https://gulfbusiness.com/careem-launches-15-minute-grocery-delivery-service-in-dubai), `careem.com/en-AE/groceries/` (fetched 2026-10-06)
