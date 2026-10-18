import { useEffect, useMemo, useState } from 'react';
import { currentYearPropertyTax, defaultPlannerState, loadPlannerState, savePlannerState } from './plannerState';
import { calculateMortgage, validateMortgage, type MortgageInput, type MortgageResult } from './finance/mortgage';
import { projectTaxes, TAX_BASE_YEAR, validateTax, type TaxInput, type TaxYear } from './finance/tax';
import { calculateDownPayment, validateDownPayment, type DownPaymentInput } from './finance/downPayment';
import { money, paymentDate, percent, wholeMoney, yearsAndMonths } from './format';

interface NumberFieldProps {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: '$' | '%';
  hint?: string;
  max?: number;
  optional?: boolean;
}

function NumberField({ name, label, value, onChange, unit = '$', hint, max, optional }: NumberFieldProps) {
  return <div className="field"><label htmlFor={name}>{label}{optional && <span className="optional"> Optional</span>}</label><div className={`input-wrap ${unit === '%' ? 'suffix' : ''}`}><span aria-hidden="true">{unit}</span><input id={name} name={name} type="number" inputMode="decimal" min="0" max={max ?? 1_000_000_000} step="any" required={!optional} value={Number.isNaN(value) ? '' : value} onChange={(event) => onChange(event.target.value === '' ? (optional ? 0 : NaN) : event.target.valueAsNumber)} aria-describedby={hint ? `${name}-hint` : undefined} /></div>{hint && <small id={`${name}-hint`}>{hint}</small>}</div>;
}

function Errors({ errors }: { errors: string[] }) {
  return errors.length ? <div className="error-box" role="alert"><strong>Check your inputs</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null;
}

function PaymentSummary({ input, result }: { input: MortgageInput; result: MortgageResult }) {
  const first = result.schedule[0];
  const breakdown = [
    { label: 'Principal', value: first?.principal ?? 0, color: 'principal' },
    { label: 'Interest', value: first?.interest ?? 0, color: 'interest' },
    { label: 'Property tax', value: result.taxes, color: 'tax' },
    { label: 'Home insurance', value: result.insurance, color: 'insurance' },
  ];
  return <aside className="summary-card" aria-labelledby="summary-title">
    <h2 id="summary-title">Monthly housing cost</h2>
    <div className="hero-amount" data-testid="total-monthly">{money(result.totalMonthly)}<span>/ month</span></div><p className="summary-subtitle">Estimated total housing cost</p>
    <div className="cost-bar" aria-hidden="true">{breakdown.map((item) => <span key={item.label} className={item.color} style={{ flexGrow: item.value }} />)}</div>
    <div className="breakdown">{breakdown.map((item) => <div key={item.label}><span><i className={item.color} />{item.label}</span><strong>{money(item.value)}</strong></div>)}<div className="subtotal"><span>PITI payment</span><strong data-testid="piti">{money(result.piti)}</strong></div><div><span>HOA dues</span><strong>{money(input.hoaMonthly)}</strong></div><div><span>Maintenance reserve</span><strong>{money(result.maintenance)}</strong></div></div>
    <div className="summary-foot">Principal and interest breakdown reflects your first payment. Your fixed loan payment is {money(result.principalAndInterest)} per month; taxes and other costs can change.</div>
    {result.loanAmount > input.purchasePrice * 0.8 && <div className="summary-warning">Down payment is below 20%. PMI may apply and is not included.</div>}
    <div className="mini-stats"><div><span>Loan amount</span><b>{wholeMoney(result.loanAmount)}</b></div><div><span>Lifetime interest</span><b>{wholeMoney(result.totalInterest)}</b></div></div>
  </aside>;
}

function Amortization({ result }: { result: MortgageResult }) {
  const [visible, setVisible] = useState(false);
  return <section className="panel amortization" aria-labelledby="amortization-title"><div className="section-heading"><h2 id="amortization-title">Amortization schedule</h2><button className="button secondary" type="button" aria-expanded={visible} aria-controls="amortization-table" onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'} amortization <span aria-hidden="true">{visible ? '−' : '+'}</span></button></div>
    <div id="amortization-table" hidden={!visible}>{result.schedule.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Monthly amortization schedule"><table><caption>Fixed-rate mortgage · {result.schedule.length} payments · amounts rounded for display</caption><thead><tr><th scope="col">Payment</th><th scope="col">Month / year</th><th scope="col">Loan payment</th><th scope="col">Principal</th><th scope="col">Interest</th><th scope="col">Remaining balance</th></tr></thead><tbody>{result.schedule.map((row) => <tr key={row.number}><th scope="row">{row.number}</th><td>{paymentDate(row.year, row.month)}</td><td>{money(row.payment)}</td><td>{money(row.principal)}</td><td>{money(row.interest)}</td><td>{money(row.balance)}</td></tr>)}</tbody></table></div> : <p>No mortgage to amortize: your down payment covers the purchase price.</p>}</div>
  </section>;
}

function TaxProjection({ years }: { years: TaxYear[] }) {
  const first = years[0]!;
  return <>
    <div className="tax-highlights"><div><span>{first.year} mortgage-interest federal savings</span><strong data-testid="annual-savings">{money(first.annualSavings)}<small>/ year</small></strong></div><div><span>Monthly equivalent</span><strong>{money(first.monthlySavings)}<small>/ month</small></strong></div><div><span>Baseline marginal federal rate</span><strong>{percent(first.marginalRate)}<small>before mortgage interest</small></strong></div></div>
    <p className="table-note">Savings compare your best deduction <strong>without mortgage interest</strong> against your best deduction <strong>with mortgage interest</strong> (property tax is included in both baselines). “Federal savings” calculates the tax difference across brackets. Monthly savings = annual savings ÷ 12, even in partial years.</p>
    <div className="table-scroll tax-table" tabIndex={0} role="region" aria-label="Annual federal deduction benefit projection"><table><caption>Calendar-year projection through your final scheduled payment. Partial years are labeled.</caption><thead><tr><th scope="col">Year</th><th scope="col">Home value</th><th scope="col">Deductible interest</th><th scope="col">Deductible property tax¹</th><th scope="col">SALT cap</th><th scope="col">Standard deduction</th><th scope="col">Allowed itemized</th><th scope="col">Marginal rate</th><th scope="col">Federal savings / yr</th><th scope="col">Federal savings / mo</th><th scope="col">Effective interest rate</th></tr></thead><tbody>{years.map((row) => <tr key={row.year}><th scope="row">{row.year}{row.months !== 12 && <small>{row.months} months</small>}</th><td>{wholeMoney(row.homeValue)}</td><td>{money(row.deductibleInterest)}</td><td>{money(row.deductiblePropertyTax)}</td><td>{wholeMoney(row.saltCap)}</td><td>{wholeMoney(row.standardDeduction)}</td><td>{wholeMoney(row.itemized)}</td><td>{percent(row.marginalRate)}</td><td className="savings-cell">{money(row.annualSavings)}</td><td className="savings-cell">{money(row.monthlySavings)}</td><td className="savings-cell" data-testid="effective-interest-rate">{row.effectiveInterestRate === null ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.effectiveInterestRate)}</td></tr>)}</tbody></table></div>
    <p className="table-note">¹ Additional deductible property tax after sharing the SALT cap with your other state/local taxes. Property tax is part of your non-interest baseline. Effective interest rate = (interest paid − mortgage-interest federal savings) ÷ average monthly opening loan balance × 12 ÷ modeled months. This annualized after-tax estimate is not APR; cash purchases show N/A.</p>
  </>;
}

interface TaxSectionProps {
  input: MortgageInput;
  result: MortgageResult | null;
  currentYear: number;
  tax: TaxInput;
  onChange: (tax: TaxInput) => void;
}

function TaxSection({ input, result, currentYear, tax, onChange }: TaxSectionProps) {
  const update = <K extends keyof TaxInput>(key: K, value: TaxInput[K]) => onChange({ ...tax, [key]: value });
  const propertyTax = currentYearPropertyTax(input, currentYear);
  const includedPropertyTax = propertyTax ?? 0;
  const errors = validateTax(tax);
  const canEstimate = currentYear >= TAX_BASE_YEAR;
  const years = useMemo(() => !result || validateTax(tax).length || !canEstimate
    ? [] : projectTaxes(input, result, tax, currentYear), [input, result, tax, currentYear, canEstimate]);
  const updateDeductions = (total: number) => {
    const nonPropertyAmount = total - includedPropertyTax;
    // Every edit to the mirrored field resets SALT to the same total.
    // Direct SALT edits remain possible until the next deduction-total edit.
    onChange({ ...tax, otherDeductions: nonPropertyAmount, otherSalt: nonPropertyAmount });
  };
  return <section className="panel tax-section" aria-labelledby="tax-heading">
    <div className="section-heading"><div><h2 id="tax-heading">Mortgage interest deduction</h2><p>Itemizing only helps when it beats the deduction you would otherwise take.</p></div><span className="pill">Federal estimate</span></div>
    <div className="tax-inputs"><NumberField name="annual-income" label="Annual household income" value={tax.annualIncome} onChange={(n) => update('annualIncome', n)} hint="Treated as ordinary adjusted gross income (AGI)." /><div className="field"><label htmlFor="filing-status">Filing status</label><select id="filing-status" value={tax.filingStatus} onChange={(event) => update('filingStatus', event.target.value as TaxInput['filingStatus'])}><option value="married">Married filing jointly</option><option value="single">Single</option></select></div><div className="field"><label htmlFor="location">City / state or ZIP code</label><input id="location" value={tax.location} maxLength={120} placeholder="e.g. Austin, TX or 78701" onChange={(event) => update('location', event.target.value)} aria-describedby="location-hint" /><small id="location-hint">Scenario label only. No location lookup or state tax calculation.</small></div><NumberField name="other-deductions" label="Deductions not including mortgage interest" value={tax.otherDeductions + includedPropertyTax} onChange={updateDeductions} hint={`Includes ${money(includedPropertyTax)} of modeled ${currentYear} property tax, added automatically. Enter the total before the SALT cap; do not add property tax again.`} /><NumberField name="other-salt" label="Of that total: state / local taxes" value={tax.otherSalt + includedPropertyTax} onChange={(n) => update('otherSalt', n - includedPropertyTax)} hint="Defaults to the non-interest total whenever that field changes; editable. Includes property tax automatically. Reduce for deductions that are not state/local taxes." /></div>
    {!tax.location.trim() && errors.length === 1 ? <div className="info-box">Enter your city/state or ZIP to see your projection. Use your own local property tax rate above and state/local taxes here; location alone does not determine federal savings.</div> : <Errors errors={errors} />}
    {!result && <div className="info-box" role="status">Correct the mortgage inputs above to refresh the projection. Your deduction inputs and open sections are preserved.</div>}
    {!canEstimate && <div className="error-box">Tax projections support 2026 onward.</div>}
    {years.length > 0 && <><div className="projection-label">Your scenario: <strong>{tax.location}</strong> · {tax.filingStatus === 'married' ? 'Married filing jointly' : 'Single'}</div><TaxProjection years={years} /></>}
    <details className="assumptions"><summary>How this estimate works & important assumptions</summary><div className="assumptions-content">
      <h3>The benefit is the difference, not the whole deduction.</h3><p>If your standard deduction is $33,000, deductions excluding mortgage interest (including property tax) are $20,000, and eligible mortgage interest is $30,000, itemizing adds $17,000 of deductions. At a flat 24% marginal rate, that is $4,080 per year ($340 per month). If non-interest deductions already exceed the standard deduction, only the additional benefit from mortgage interest counts. Property tax savings are excluded. The federal savings columns account for deductions crossing tax brackets.</p>
      <ul><li><strong>2026 federal baseline:</strong> $16,100 single / $32,200 married filing jointly. Standard deductions and federal bracket thresholds grow 3% annually in this scenario. Future values are projections, not enacted tax tables.</li><li><strong>Home value and property tax:</strong> grow 3% per calendar year, with a constant entered tax rate. Your first payment month is also the assumed ownership start. First and final years are prorated by modeled months; actual tax payment dates, escrow, assessments, exemptions, and local assessment caps can differ.</li><li><strong>Income and non-interest deductions:</strong> income and the non-property portion of deductions remain flat in nominal dollars. The form includes modeled current-year property tax in both deduction fields automatically; future years substitute their projected property tax rather than double-counting it. Enter eligible deductions after category restrictions, but before the shared SALT cap. The SALT field mirrors each edit to the non-interest total as a convenience default and can then be overridden.</li><li><strong>SALT planning assumption:</strong> $40,400 cap and $505,000 income phaseout threshold in 2026, both indexed to assumed inflation of 3% annually indefinitely, with no 2030 reset. This scenario intentionally differs from current law. The cap falls by 30% of income over the threshold, with a fixed $10,000 high-income floor (not a scheduled reset). Income is also used as the MAGI estimate.</li><li><strong>Mortgage interest:</strong> assumes one new qualified acquisition loan for a primary residence, with a $750,000 debt limit for single and joint filers. Annual interest is scaled using average monthly opening balances when debt exceeds that limit. This is an approximation, not the full IRS mortgage-interest worksheet.</li><li><strong>High-income itemizing:</strong> includes the 2026 limitation reducing itemized deductions by 2/37 of the lesser of deductions or income above the 37% bracket threshold.</li><li><strong>Not included:</strong> state/local income tax savings, AMT, credits, preferential capital-gains rates, senior/dependent deductions, other mortgages, refinancing, points, PMI, closing costs, or future law changes. HOA, maintenance, principal and homeowners insurance are not treated as deductible personal housing expenses.</li><li><strong>Cash flow:</strong> tax savings are an annual tax estimate, not a reduction to the lender's monthly bill. Projections stop at the end of the modeled loan term, even for cash purchases. All form inputs are saved in local storage on this browser and restored on return. No inputs are sent to a server. Reset to defaults replaces the saved scenario; avoid entering sensitive details on a shared device.</li></ul>
      <p>Sources: <a href="https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32" target="_blank" rel="noreferrer">IRS 2026 inflation adjustments</a> · <a href="https://www.irs.gov/publications/p936" target="_blank" rel="noreferrer">IRS Publication 936</a> · <a href="https://www.law.cornell.edu/uscode/text/26/164" target="_blank" rel="noreferrer">26 USC §164 (SALT)</a> · <a href="https://www.law.cornell.edu/uscode/text/26/68" target="_blank" rel="noreferrer">26 USC §68 (itemized limits)</a>. Consult a qualified tax professional before making a purchase decision.</p>
    </div></details>
  </section>;
}

function DownPaymentPlanning({ savings, downPayment, result, onChange }: {
  savings: DownPaymentInput;
  downPayment: number;
  result: MortgageResult | null;
  onChange: (savings: DownPaymentInput) => void;
}) {
  const update = (key: keyof DownPaymentInput, value: number) => onChange({ ...savings, [key]: value });
  const errors = validateDownPayment(savings);
  const plan = result && !errors.length ? calculateDownPayment(savings, downPayment, result.loanAmount, result.totalMonthly) : null;
  const duration = (months: number | null) => plan && plan.shortfall > 0 ? 'N/A — purchase not funded'
    : months === null ? 'No depletion (zero expenses)' : yearsAndMonths(months);
  return <details className="panel down-payment-plan">
    <summary><h2>Planning the down payment</h2></summary>
    <div className="down-payment-content">
      <p className="input-note">Down payment plus closing costs uses home sale proceeds first, then non-retirement savings, then retirement savings. Unused sale proceeds are added to non-retirement savings.</p>
      <div className="input-grid">
        <NumberField name="retirement-savings" label="Retirement savings" value={savings.retirementSavings} onChange={(n) => update('retirementSavings', n)} />
        <NumberField name="non-retirement-savings" label="Non-retirement liquid savings" value={savings.nonRetirementSavings} onChange={(n) => update('nonRetirementSavings', n)} />
        <NumberField name="home-sale-proceeds" label="Expected home sale proceeds" value={savings.homeSaleProceeds} onChange={(n) => update('homeSaleProceeds', n)} hint="Net cash after paying off the current mortgage and selling costs. Do not also include this in savings." optional />
        <NumberField name="monthly-expenses" label="Monthly expenses excluding housing" value={savings.monthlyExpenses} onChange={(n) => update('monthlyExpenses', n)} />
      </div>
      <Errors errors={errors} />
      {!result && <p className="info-box">Correct the mortgage inputs to calculate savings after purchase.</p>}
      {plan && <>
        <dl className="planning-results">
          <div><dt>Down payment</dt><dd>{money(downPayment)}</dd></div>
          <div><dt>Estimated closing costs (2.5% of loan)</dt><dd data-testid="closing-costs">{money(plan.closingCosts)}</dd></div>
          <div><dt>Total cash needed</dt><dd data-testid="purchase-cash">{money(plan.purchaseCash)}</dd></div>
          <div><dt>Home sale proceeds used</dt><dd>{money(plan.saleProceedsUsed)}</dd></div>
          <div><dt>Non-retirement savings used</dt><dd>{money(plan.nonRetirementUsed)}</dd></div>
          <div><dt>Retirement savings used</dt><dd>{money(plan.retirementUsed)}</dd></div>
        </dl>
        {plan.retirementUsed > 0 && <p className="planning-warning" role="status">Warning: this purchase uses {money(plan.retirementUsed)} of retirement savings. Withdrawal restrictions, taxes, and penalties may apply; they are not included.</p>}
        {plan.shortfall > 0 && <p className="error-box" role="alert">Insufficient funds: an additional {money(plan.shortfall)} is needed for the down payment and closing costs. Savings duration is unavailable until the purchase is fully funded.</p>}
        <h3>Savings after purchase</h3>
        <dl className="planning-results">
          <div><dt>Non-retirement savings remaining</dt><dd data-testid="non-retirement-remaining">{money(plan.nonRetirementRemaining)}</dd></div>
          <div><dt>Retirement savings remaining</dt><dd data-testid="retirement-remaining">{money(plan.retirementRemaining)}</dd></div>
          <div><dt>Total savings remaining</dt><dd data-testid="savings-remaining">{money(plan.totalRemaining)}</dd></div>
        </dl>
        <h3>Savings duration with no income</h3>
        <p className="input-note">Monthly spending: <strong data-testid="monthly-spending">{money(plan.monthlySpending)}</strong> ({money(result!.totalMonthly)} housing + {money(savings.monthlyExpenses)} other expenses).</p>
        <dl className="planning-results planning-duration">
          <div><dt>Excluding retirement savings</dt><dd data-testid="runway-excluding-retirement">{duration(plan.monthsExcludingRetirement)}</dd></div>
          <div><dt>Including retirement savings</dt><dd data-testid="runway-including-retirement">{duration(plan.monthsIncludingRetirement)}</dd></div>
        </dl>
      </>}
      <p className="table-note">Nominal dollars only. Savings duration rounds down to complete months and holds current monthly spending constant, including housing costs even beyond loan payoff. No income, investment returns, inflation, income or withdrawal taxes, penalties, or mortgage-interest tax savings are modeled. Property tax and insurance remain included in housing costs. Retirement savings are assumed accessible for the inclusive estimate. Closing costs are estimated as 2.5% of the loan amount, so cash purchases have $0 estimated closing costs in this model; actual costs may differ.</p>
    </div>
  </details>;
}

export function MortgagePage() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [planner, setPlanner] = useState(() => loadPlannerState(today));
  const [storageAvailable, setStorageAvailable] = useState(true);
  const input = planner.mortgage;
  const tax = planner.tax;
  useEffect(() => { setStorageAvailable(savePlannerState(planner)); }, [planner]);
  const update = <K extends keyof MortgageInput>(key: K, value: MortgageInput[K]) =>
    setPlanner((previous) => {
      const mortgage = { ...previous.mortgage, [key]: value };
      const propertyTax = currentYearPropertyTax(mortgage, currentYear);
      const totalChanged = propertyTax !== null && propertyTax !== currentYearPropertyTax(previous.mortgage, currentYear);
      return { ...previous, mortgage, tax: totalChanged
        ? { ...previous.tax, otherSalt: previous.tax.otherDeductions } : previous.tax };
    });
  const reset = () => setPlanner(defaultPlannerState(new Date()));
  const errors = validateMortgage(input);
  if (!input.firstPayment.startsWith(`${currentYear}-`)) errors.push('Choose a first payment month in the current year.');
  const valid = errors.length === 0;
  const result = useMemo(() => valid ? calculateMortgage(input) : null, [input, valid]);
  return <>
    <div className="breadcrumb"><a href="/">Your toolkit</a><span aria-hidden="true">/</span><span>Mortgage planner</span></div>
    <section className="page-intro"><h1>Mortgage calculator</h1></section>
    <div className="section-heading"><p className="input-note">{storageAvailable ? 'Inputs are saved on this browser and restored on your next visit. No data is sent to a server.' : 'Browser storage is unavailable. Inputs work for this visit but cannot be saved.'}</p><button type="button" className="button secondary" onClick={reset}>Reset to defaults</button></div>
    <div className="calculator-grid"><section className="panel mortgage-inputs" aria-labelledby="mortgage-input-heading"><div className="section-heading"><h2 id="mortgage-input-heading">Mortgage inputs</h2><span className="pill">USD</span></div>
      <div className="input-grid"><NumberField name="purchase-price" label="House purchase price" value={input.purchasePrice} onChange={(n) => update('purchasePrice', n)} /><NumberField name="down-payment" label="Down payment" value={input.downPayment} onChange={(n) => update('downPayment', n)} hint={valid ? `${percent(input.downPayment / input.purchasePrice)} of purchase price` : undefined} /><NumberField name="interest-rate" label="Mortgage interest rate" value={input.interestRate} onChange={(n) => update('interestRate', n)} unit="%" max={100} /><div className="field"><label htmlFor="term-years">Fixed loan term</label><select id="term-years" value={input.termYears} onChange={(event) => update('termYears', Number(event.target.value) as 15 | 30)}><option value={30}>30 years</option><option value={15}>15 years</option></select></div><div className="field"><label htmlFor="first-payment">First payment month</label><input type="month" id="first-payment" value={input.firstPayment} min={`${currentYear}-01`} max={`${currentYear}-12`} onChange={(event) => update('firstPayment', event.target.value)} /><small>Also the assumed ownership start, in {currentYear}.</small></div><NumberField name="property-tax-rate" label="Annual property tax rate" value={input.propertyTaxRate} onChange={(n) => update('propertyTaxRate', n)} unit="%" max={100} hint="Percentage of the home's value." /></div>
      <div className="input-divider"><h3>Other housing costs</h3></div><div className="input-grid"><div className="field"><label htmlFor="insurance-mode">Home insurance basis</label><select id="insurance-mode" value={input.insuranceMode} onChange={(event) => update('insuranceMode', event.target.value as MortgageInput['insuranceMode'])}><option value="fixed">Fixed annual amount</option><option value="percentage">Annual % of home value</option></select></div>{input.insuranceMode === 'fixed' ? <NumberField name="insurance-annual" label="Annual home insurance" value={input.insuranceAnnual} onChange={(n) => update('insuranceAnnual', n)} /> : <NumberField name="insurance-rate" label="Annual home insurance rate" value={input.insuranceRate} onChange={(n) => update('insuranceRate', n)} unit="%" max={100} />}<NumberField name="maintenance-annual" label="Annual maintenance budget" value={input.maintenanceAnnual} onChange={(n) => update('maintenanceAnnual', n)} hint="Average maintenance is 0.5–1% of the house value per year." optional /><NumberField name="hoa-monthly" label="Monthly HOA dues" value={input.hoaMonthly} onChange={(n) => update('hoaMonthly', n)} /></div><Errors errors={errors} /><p className="input-note">Results update as you type. Estimates exclude PMI and closing costs.</p>
    </section>{result ? <PaymentSummary input={input} result={result} /> : <aside className="summary-card"><h2>Estimate unavailable</h2><p>Correct the highlighted input issues to calculate your payment.</p></aside>}</div>
    {result && <Amortization result={result} />}
    <TaxSection input={input} result={result} currentYear={currentYear} tax={tax} onChange={(next) => setPlanner((previous) => ({ ...previous, tax: next }))} />
    <DownPaymentPlanning savings={planner.savings} downPayment={input.downPayment} result={result} onChange={(savings) => setPlanner((previous) => ({ ...previous, savings }))} />
  </>;
}