# Azul Pricing Model

## Tier Overview

| Tier | Target | Controllers | Price | Billing |
|------|--------|-------------|-------|---------|
| **Free** | Homeowners trying it out | 1 | $0 | — |
| **Home** | Residential power users | Up to 3 | $49/year | Annual |
| **Pro** | Landscapers, property managers | Up to 25 | $199/year | Annual |
| **Enterprise** | Golf courses, corporate campuses, HOAs | Unlimited | $999/year | Annual |

---

## Feature Matrix

| Feature | Free | Home | Pro | Enterprise |
|---------|------|------|-----|-----------|
| Manual zone control (app + web) | Yes | Yes | Yes | Yes |
| Scheduling (1 schedule) | Yes | Yes | Yes | Yes |
| Multiple schedules (up to 5/controller) | — | Yes | Yes | Yes |
| Cloud monitoring + SSE real-time | — | Yes | Yes | Yes |
| Event log (30-day hot) | 7 days | 30 days | 90 days | 1 year |
| Event log (S3 cold archive) | — | — | 1 year | Unlimited |
| Zone photos | — | Yes | Yes | Yes |
| Push notifications (rain skip, errors) | — | Yes | Yes | Yes |
| Multi-controller support | — | Up to 3 | Up to 25 | Unlimited |
| Multi-client workspace (landscaper view) | — | — | Yes | Yes |
| Client-facing reports | — | — | Yes | Yes |
| Seasonal adjust (% multiplier) | — | Yes | Yes | Yes |
| API access | — | — | Yes | Yes |
| Priority support (48h response) | — | — | Yes | Yes |
| Dedicated support (24h SLA) | — | — | — | Yes |
| Custom firmware builds | — | — | — | Yes |
| On-prem / self-hosted option | — | — | — | Yes |

---

## Cost Estimation Per User Per Year

### Infrastructure Costs

| Component | Free | Home | Pro | Enterprise |
|-----------|------|------|-----|-----------|
| Postgres (RDS db.t4g.micro share) | $0.50 | $1.50 | $8.00 | $25.00 |
| MQTT broker (shared) | $0.25 | $0.75 | $4.00 | $12.00 |
| S3 event storage | $0.00 | $0.02 | $0.50 | $2.00 |
| Lambda/compute (API) | $0.10 | $0.30 | $2.00 | $8.00 |
| SSE connections (always-on) | $0.00 | $0.50 | $3.00 | $10.00 |
| Push notifications (SNS/FCM) | $0.00 | $0.05 | $0.50 | $2.00 |
| Auth0 (per MAU) | $0.00* | $0.00* | $0.23 | $0.23 |
| **Subtotal infra** | **$0.85** | **$3.12** | **$18.23** | **$59.23** |

*Auth0 free tier covers first 7,500 MAUs

### Support Costs (amortized)

| Component | Free | Home | Pro | Enterprise |
|-----------|------|------|-----|-----------|
| Community/self-serve | $0 | $0 | $0 | $0 |
| Email support | — | $2.00 | $5.00 | $15.00 |
| Priority SLA | — | — | $10.00 | $30.00 |
| **Subtotal support** | **$0** | **$2.00** | **$15.00** | **$45.00** |

### Total Cost Per User Per Year

| | Free | Home | Pro | Enterprise |
|--|------|------|-----|-----------|
| Infrastructure | $0.85 | $3.12 | $18.23 | $59.23 |
| Support | $0.00 | $2.00 | $15.00 | $45.00 |
| **Total cost** | **$0.85** | **$5.12** | **$33.23** | **$104.23** |

---

## Revenue & Margin Analysis

### Pricing vs. Cost

| Tier | Price | Cost | Gross Profit | Margin |
|------|-------|------|-------------|--------|
| Free | $0 | $0.85 | -$0.85 | — |
| Home | $49 | $5.12 | $43.88 | 89.6% |
| Pro | $199 | $33.23 | $165.77 | 83.3% |
| Enterprise | $999 | $104.23 | $894.77 | 89.6% |

### Revenue Projection (Year 2 — 5,000 users)

Assumed distribution: 70% Free, 20% Home, 7% Pro, 3% Enterprise

| Tier | Users | Revenue | Cost | Gross Profit |
|------|-------|---------|------|-------------|
| Free | 3,500 | $0 | $2,975 | -$2,975 |
| Home | 1,000 | $49,000 | $5,120 | $43,880 |
| Pro | 350 | $69,650 | $11,631 | $58,019 |
| Enterprise | 150 | $149,850 | $15,635 | $134,215 |
| **Total** | **5,000** | **$268,500** | **$35,361** | **$233,139** |

**Blended gross margin: 86.8%**

### Revenue Projection (Year 4 — 25,000 users)

Same distribution assumption, with volume discounts reducing infra costs ~20%:

| Tier | Users | Revenue | Cost | Gross Profit |
|------|-------|---------|------|-------------|
| Free | 17,500 | $0 | $11,900 | -$11,900 |
| Home | 5,000 | $245,000 | $20,480 | $224,520 |
| Pro | 1,750 | $348,250 | $46,522 | $301,728 |
| Enterprise | 750 | $749,250 | $62,538 | $686,712 |
| **Total** | **25,000** | **$1,342,500** | **$141,440** | **$1,201,060** |

---

## Key Assumptions

1. **Hardware sold separately** — Controller hardware is a one-time purchase ($89–$149 depending on zone count). Hardware margin is not included here.
2. **Free tier as funnel** — Free users cost ~$0.85/year each. At 70% of the base, this is a $2–12K annual cost to acquire paid users. Acceptable CAC if 10%+ convert within 12 months.
3. **Pro tier is the growth engine** — Landscapers managing 10–25 controllers generate high LTV with low support overhead. Each Pro user replaces 5–10 potential Home users.
4. **Enterprise is high-touch, low-volume** — Custom onboarding, dedicated support channel. Priced to cover the support cost and then some.
5. **Event log retention drives upgrades** — Free users see 7 days; hitting "your logs expired" is a natural upgrade trigger.
6. **Seasonal adjust and multi-schedule are the Home hooks** — These are the features homeowners actually want beyond basic timer functionality.

---

## Competitive Reference

| Competitor | Comparable Tier | Annual Price | Notes |
|-----------|----------------|-------------|-------|
| Rachio | Home (8-zone) | $0 (hw only) | Cloud free, but hardware is $180–$230 |
| Hunter Hydrawise | Pro | $120–$360/yr | Per-controller pricing for landscapers |
| Rain Bird | Enterprise | Custom | Typically $500–$2000/yr for commercial |
| Orbit B-hyve Pro | Pro | $99/yr/controller | Per-controller, gets expensive at scale |

**Azul's advantage:** Per-account pricing (not per-controller) makes Pro and Enterprise significantly cheaper at scale than per-controller competitors. A landscaper with 20 controllers pays $199/year vs. $1,980+/year with Orbit.

---

## Decisions Made

- **Free tier includes full cloud connectivity (WiFi + BLE).** BLE-only is not viable — users expect remote access. The $0.85/user/year subsidy is covered by ~2% conversion to Home, well below typical SaaS freemium rates (3–5%). Gate on features (1 controller, 1 schedule, 7-day logs), not connectivity.
- **Monthly billing offered at a premium.** Monthly pricing reduces commitment and attracts trial users, but increases churn and payment processing overhead. Premium: ~30% markup over annual equivalent.

| Tier | Annual | Monthly | Monthly annualized |
|------|--------|---------|-------------------|
| Home | $49/yr | $4.99/mo | $59.88/yr (+22%) |
| Pro | $199/yr | $19.99/mo | $239.88/yr (+21%) |
| Enterprise | $999/yr | — (annual only) | — |

Enterprise remains annual-only — the sales cycle and onboarding cost don't support month-to-month.

---

---

## Conservative Revenue Forecast (5-Year)

### Assumptions

- **Market:** US residential irrigation (~12M homes with in-ground systems), commercial/landscaper (~500K businesses)
- **Adoption curve:** Slow start, organic growth through landscaper referrals and word-of-mouth. No paid advertising until Year 3.
- **Churn:** 15% annual for Home, 10% for Pro, 5% for Enterprise (net of reactivations)
- **Hardware attach rate:** 100% of new paid users buy at least 1 controller; Pro/Enterprise buy avg 3–8
- **Monthly billing mix:** 40% of Home users choose monthly (higher effective price, higher churn)

### Hardware Revenue

| Product | COGS | Retail | Margin |
|---------|------|--------|--------|
| 8-zone controller | $38 | $99 | $61 (62%) |
| 16-zone controller | $52 | $149 | $97 (65%) |
| Expansion module (8-zone add-on) | $22 | $59 | $37 (63%) |
| Flow sensor add-on | $15 | $49 | $34 (69%) |

Average hardware revenue per new user: ~$120 (weighted by tier)

### User Growth (Conservative)

| | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|--|--------|--------|--------|--------|--------|
| New users (total) | 500 | 1,500 | 4,000 | 8,000 | 12,000 |
| Cumulative users | 500 | 1,850 | 5,350 | 12,100 | 21,700 |
| Paying users (cumulative) | 120 | 480 | 1,550 | 3,800 | 7,200 |
| Free (cumulative) | 380 | 1,370 | 3,800 | 8,300 | 14,500 |

*Cumulative accounts for churn. Paying = Home + Pro + Enterprise.*

### Paying User Mix (of new paying users each year)

| | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|--|--------|--------|--------|--------|--------|
| Home | 80% | 75% | 65% | 60% | 55% |
| Pro | 18% | 20% | 28% | 30% | 33% |
| Enterprise | 2% | 5% | 7% | 10% | 12% |

### Revenue by Stream

#### Year 1 (Launch year — 500 users, 120 paying)

| Revenue Source | Calculation | Amount |
|---------------|-------------|--------|
| Home subscriptions | 96 × $49 | $4,704 |
| Pro subscriptions | 22 × $199 | $4,378 |
| Enterprise subscriptions | 2 × $999 | $1,998 |
| Monthly premium uplift (~40% Home monthly) | 38 × $10.88 | $413 |
| Hardware (new users) | 120 × $120 avg | $14,400 |
| Hardware (Pro/Enterprise extras) | 24 × 2.5 extra × $120 | $7,200 |
| **Total Year 1** | | **$33,093** |

#### Year 2 (1,850 cumulative users, 480 paying)

| Revenue Source | Calculation | Amount |
|---------------|-------------|--------|
| Home subscriptions (cumulative active) | 340 × $49 | $16,660 |
| Pro subscriptions | 95 × $199 | $18,905 |
| Enterprise subscriptions | 18 × $999 | $17,982 |
| Monthly premium uplift | 136 × $10.88 | $1,480 |
| Hardware (new paying users) | 400 × $120 | $48,000 |
| Hardware (Pro/Enterprise extras) | 75 × 3 × $120 | $27,000 |
| Flow sensors / expansions | ~50 × $54 avg | $2,700 |
| **Total Year 2** | | **$132,727** |

#### Year 3 (5,350 cumulative users, 1,550 paying)

| Revenue Source | Calculation | Amount |
|---------------|-------------|--------|
| Home subscriptions | 890 × $49 | $43,610 |
| Pro subscriptions | 420 × $199 | $83,580 |
| Enterprise subscriptions | 75 × $999 | $74,925 |
| Monthly premium uplift | 356 × $10.88 | $3,873 |
| Hardware (new paying users) | 1,200 × $120 | $144,000 |
| Hardware (Pro/Enterprise extras) | 350 × 3.5 × $120 | $147,000 |
| Flow sensors / expansions | ~200 × $54 | $10,800 |
| **Total Year 3** | | **$507,788** |

#### Year 4 (12,100 cumulative users, 3,800 paying)

| Revenue Source | Calculation | Amount |
|---------------|-------------|--------|
| Home subscriptions | 1,900 × $49 | $93,100 |
| Pro subscriptions | 1,100 × $199 | $218,900 |
| Enterprise subscriptions | 220 × $999 | $219,780 |
| Monthly premium uplift | 760 × $10.88 | $8,269 |
| Hardware (new paying users) | 2,600 × $120 | $312,000 |
| Hardware (Pro/Enterprise extras) | 900 × 4 × $120 | $432,000 |
| Flow sensors / expansions | ~500 × $54 | $27,000 |
| **Total Year 4** | | **$1,311,049** |

#### Year 5 (21,700 cumulative users, 7,200 paying)

| Revenue Source | Calculation | Amount |
|---------------|-------------|--------|
| Home subscriptions | 3,200 × $49 | $156,800 |
| Pro subscriptions | 2,300 × $199 | $457,700 |
| Enterprise subscriptions | 500 × $999 | $499,500 |
| Monthly premium uplift | 1,280 × $10.88 | $13,926 |
| Hardware (new paying users) | 4,000 × $120 | $480,000 |
| Hardware (Pro/Enterprise extras) | 1,800 × 4.5 × $120 | $972,000 |
| Flow sensors / expansions | ~1,000 × $54 | $54,000 |
| **Total Year 5** | | **$2,633,926** |

### 5-Year Summary

| | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|--|--------|--------|--------|--------|--------|
| **Total Revenue** | $33K | $133K | $508K | $1.31M | $2.63M |
| Subscription (recurring) | $11K | $55K | $206K | $540K | $1.13M |
| Hardware (one-time) | $22K | $78K | $302K | $771K | $1.51M |
| **Subscription %** | 35% | 41% | 41% | 41% | 43% |

### Cost & Profit Estimate

| | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|--|--------|--------|--------|--------|--------|
| Infrastructure | $1,200 | $5,400 | $18,000 | $42,000 | $78,000 |
| Hardware COGS | $8,500 | $30,000 | $115,000 | $295,000 | $575,000 |
| Support (1 FTE Year 3+) | $0 | $0 | $75,000 | $150,000 | $225,000 |
| Operations (founder salary) | $0 | $50,000 | $100,000 | $150,000 | $200,000 |
| Marketing (Year 3+) | $0 | $0 | $50,000 | $100,000 | $150,000 |
| **Total Costs** | **$9,700** | **$85,400** | **$358,000** | **$737,000** | **$1,228,000** |
| **Net Profit** | **$23K** | **$47K** | **$150K** | **$574K** | **$1.41M** |
| **Net Margin** | 71% | 36% | 29% | 44% | 53% |

### Revenue Mix at Maturity (Year 5)

```
Subscriptions (43%) ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░
Hardware      (57%) ██████████████████████████░░░░░░░░░░░░░░░░░░░░░
```

Subscription revenue crosses $1M ARR midway through Year 5. Hardware dominates early but subscription grows as a percentage as the installed base compounds.

---

## Why This Is Conservative

1. **No paid acquisition until Year 3** — relies entirely on organic/landscaper referral
2. **500 users Year 1** — achievable with a single Product Hunt launch + irrigation forums
3. **15% Home churn** — higher than typical SaaS (assumes seasonal/dormant accounts)
4. **No upsell revenue** — doesn't model Home→Pro upgrades (likely 5–10%/year)
5. **No partnership revenue** — water utilities, smart home platforms, or insurance programs not included
6. **Single product line** — no weather station, soil sensor, or other peripherals modeled

---

## Open Questions

- Hardware bundle discount (controller + 1 year Home for $129)?
- Referral program for landscapers (free month per client referred)?
- Trial period for paid tiers (14-day free trial of Home, then downgrade to Free)?
