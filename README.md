# FinTech

Personal financial planning tools built with React, Node.js, MongoDB, and TypeScript. All financial calculations run in the browser. The mortgage tool never calls the API or writes to MongoDB. Form inputs are saved in this browser's local storage and restored on return.

## Run with Docker

Requires Docker Desktop with Linux containers running and Docker Compose v2.

From the project root (`C:\LearningProjects\FinTech` on this workstation):

```powershell
Copy-Item .env.example .env
# Edit .env and replace both example passwords with strong, distinct values.
docker compose up --build -d
docker compose ps
```

Open **http://localhost:8080**. All three services run on the same machine:

| Component | Directory | Responsibility |
| --- | --- | --- |
| React + Vite, served by Nginx | `Frontend/` | Home page, mortgage planner, all calculations |
| Node.js + Express | `Backend/` | MongoDB connectivity and `/api/health`; future authenticated persistence |
| MongoDB 8 | `Database/` | Durable data volume and TypeScript-authored initialization scripts |

Only the frontend port is published, bound to localhost. Nginx forwards `/api/` to the private backend; MongoDB is not exposed to the host. The backend uses a database-scoped `readWrite` user rather than root. There are deliberately no public user-data CRUD endpoints until a future tool adds authentication and authorization.

```powershell
docker compose logs --tail 100
docker compose down
```

`down` retains saved data. **`docker compose down -v` permanently deletes the MongoDB volume.** Initialization runs only for a new volume. Changing `.env` credentials does not change existing database users: update the users in MongoDB or deliberately recreate a disposable development volume. Use HTTPS, managed secrets, backups, and authentication before any public deployment. This setup is for local use, not a production security certification.

## Local development

Requires Node.js 24+ and npm. Lockfiles are checked in for each package.

```powershell
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**. The mortgage tool works without the backend or database. Inputs survive reloading or leaving the page. **Reset to defaults** replaces the saved mortgage, tax, and down-payment planning inputs. Avoid sensitive information on shared devices. If browser storage is blocked or full, calculations still work but inputs cannot be saved. Cached first-payment dates from previous years roll forward to the current month because projections start in the current year.

To run the backend outside Compose, provide `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD`, and optionally `MONGO_HOST` (default `localhost`), `MONGO_DATABASE` (default `fintech`), and `PORT` (default `3000`) as environment variables, with a reachable MongoDB instance already initialized. Run `npm run dev --prefix Backend`. The Compose database has no published port by design.

## Verification

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
docker compose --env-file .env.example config --quiet
```

Builds type-check all three components. Unit tests cover mortgage math, zero-rate/cash purchases, amortization, validation, federal brackets, incremental itemization benefits, SALT limits, high-income limits, and partial-year projections. Backend tests exercise the health endpoint with successful and failed database pings. Browser tests run against the production frontend build on desktop and mobile Chromium, checking navigation, live updates, amortization, tax projections, input errors, layout overflow, and absence of calculator API/XHR calls.

Database TypeScript compiles to JavaScript for `mongosh` during the image build; compiled files and dependency directories are not committed. All authored application and database scripting code is TypeScript.

## Mortgage planner

- Defaults: $1,000,000 purchase price, 7.25% interest, $0 HOA and $0 maintenance. The maintenance field notes an average budget of 0.5–1% of home value annually.
- Mortgage edits update tax projections live without clearing tax inputs or closing their assumptions section, including during temporarily invalid mortgage input.

- Purchase price, down payment, property tax rate, annual insurance percentage or fixed amount, interest rate, 15/30-year fixed term, optional annual maintenance, and monthly HOA.
- PITI, first-payment principal/interest breakdown, total monthly housing costs, loan amount, and lifetime interest.
- Expandable monthly amortization schedule with payment month/year, principal, interest, payment amount, and remaining balance.
- First payment month defaults to the current browser month and can be any month in the current year. This also approximates ownership start for the tax model.
- Below 20% down, a warning explains that PMI may apply. PMI and closing costs are not included.

## Federal deduction projection

Annual household income is treated as ordinary AGI (and MAGI for the SALT phaseout). Single and married-filing-jointly filers are supported. City/state or ZIP is a **scenario label**, not a tax lookup: the federal calculation uses the property tax rate and non-housing state/local tax amounts supplied by the user. No state income-tax savings are calculated or implied.

Enter **deductions not including mortgage interest**, including modeled property tax, and the SALT portion **already included within that total**. Both fields automatically include current-year property tax (prorated for the ownership start); do not add it again. Changes to house price, property tax rate or start month adjust the included property tax. Whenever the non-interest total changes, the SALT field mirrors it as a convenience default; override SALT afterward if some deductions are not state/local taxes. Deductions should reflect category-specific eligibility restrictions, but SALT is entered before its shared cap. Internally, only the non-property portions are stored so future years substitute their own projected property tax without double-counting.

For each calendar year through the final scheduled payment:

1. Sum mortgage interest from the actual amortization schedule.
2. Apply an approximate $750,000 qualified acquisition-debt limit using average monthly opening balances for the financed period. Assumes one new loan on a primary residence.
3. Grow home value and associated property tax by 3% annually. Prorate property tax in partial first/final modeled years.
4. Apply the shared federal SALT cap and income phaseout to other state/local taxes plus property tax.
5. Compare the best deduction without mortgage interest against the best deduction with mortgage interest, including the standard deduction and high-income itemized limitation. Property tax is included in **both** scenarios: federal savings reflect mortgage interest alone.
6. Show non-interest deductions after the SALT cap, incremental reduction in taxable income, baseline marginal rate, marginal-rate savings estimate, and progressive-bracket tax difference as yearly and monthly savings. Monthly values are annual savings divided by 12, including partial years; they are not a lender payment discount.
7. Show **effective interest rate**: (interest paid − mortgage-interest federal savings) ÷ average monthly opening loan balance × 12 ÷ modeled months. Equivalently, note rate × (1 − savings ÷ interest paid). This annualized after-tax estimate accounts for the actual outstanding debt and partial years; it is not APR. Zero-rate loans show 0%; cash purchases show N/A.

Illustrative example: $20,000 non-interest deductions (including property tax) + $30,000 eligible mortgage interest − $33,000 standard deduction = $17,000 additional deduction. At 24%, the benefit is $4,080/year or $340/month, provided the deduction stays within that bracket. Existing itemization and property-tax benefits are never attributed to mortgage interest.

### Planning the down payment

The collapsible section at the bottom accepts retirement savings, non-retirement liquid savings, optional net home sale proceeds (after the current mortgage payoff and selling costs), and monthly expenses excluding housing. Inputs default to zero and are saved locally with the other planner inputs.

- Required purchase cash is the down payment plus estimated closing costs of **2.5% of the loan amount**. A cash purchase therefore has zero modeled closing costs; actual costs can differ.
- Funding uses sale proceeds first, non-retirement savings next, and retirement savings last. Excess proceeds become non-retirement savings. Retirement use triggers a warning; insufficient total funds produce a shortfall and no savings-duration estimate.
- Remaining savings are shown separately and combined. No-income duration divides remaining savings by current total monthly housing costs plus other monthly expenses, rounding **down to complete months**, displayed as years and months, with and without retirement savings.
- This is a constant-spending nominal-dollar estimate: no income, returns, inflation, income/withdrawal taxes, withdrawal penalties, or mortgage-interest tax benefits. Housing costs include property tax and stay constant even beyond mortgage payoff. Retirement funds are assumed accessible for the inclusive estimate. Zero monthly spending is shown as no depletion.
- Changing mortgage inputs, including the down payment, immediately updates purchase costs, remaining savings, and savings duration.

### Tax baseline and limits

- **2026** standard deductions: $16,100 single and $32,200 married filing jointly. Federal ordinary-income brackets also use the published 2026 baseline.
- Standard deductions **and bracket thresholds** are projected to grow 3% annually after 2026. Income and the non-property portion of deductions remain flat in nominal dollars. Future values are scenarios, not published tax tables.
- SALT planning assumption: $40,400 cap and $505,000 phaseout threshold for 2026; both grow with assumed inflation (3% annually) for all future years, with no 2030 reset. This intentionally differs from current law. The 30% income phaseout and fixed $10,000 high-income floor are retained; that floor is not a scheduled cap reset.
- High-income itemizing: applies the 2026 reduction of 2/37 of the lesser of itemized deductions or modeled income above the 37% bracket threshold.
- Projections support browser calendar years 2026 onward. Update the tax constants and assumptions when actual law or inflation adjustments change.

**Limitations:** This is a planning estimate, not tax advice or tax-preparation software. It omits AMT, credits, capital-gains rates, senior/dependent deductions, state tax benefits, special local assessments/exemptions/caps, refinancing, other mortgages, points, and future legislative changes. Property tax is modeled as paid evenly rather than based on local due dates or escrow deposits. Insurance, principal, maintenance and HOA are not deducted. Mortgage debt averaging approximates rather than reproduces the full IRS worksheet. Consult a qualified tax professional.

Sources:

- [IRS Revenue Procedure 2025-32: 2026 brackets and deductions](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32)
- [IRS Publication 936: mortgage interest](https://www.irs.gov/publications/p936)
- [26 USC §164: SALT limitation](https://www.law.cornell.edu/uscode/text/26/164)
- [26 USC §68: overall limitation on itemized deductions](https://www.law.cornell.edu/uscode/text/26/68)
