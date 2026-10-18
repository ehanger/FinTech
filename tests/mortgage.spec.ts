import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T12:00:00Z'));
});

test('home links to mortgage; calculations stay entirely client-side', async ({ page }) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType()) || request.url().includes('/api/')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Financial planning tools');
  await expect(page.getByText(/A little clarity|Big decisions, broken down|A clearer path forward|Personal finance, made clearer/)).toHaveCount(0);
  await page.getByRole('link', { name: /Open mortgage calculator/ }).click();
  await expect(page).toHaveURL(/\/mortgage$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mortgage calculator');
  await expect(page.getByText(/Find your comfortably|More than a mortgage payment|A home\. A plan|Make it your home|Plan beyond the loan/)).toHaveCount(0);
  await expect(page.getByTestId('total-monthly')).toContainText('$7,306.25');
  await page.getByLabel('First payment month').fill('2026-01');
  await page.getByLabel('City / state or ZIP code').fill('Austin, TX');
  await expect(page.getByTestId('annual-savings')).toBeVisible();
  await page.getByLabel('Annual household income').fill('200000');
  await page.getByLabel('Filing status').selectOption('single');
  await page.getByLabel('Deductions not including mortgage interest').fill('20000');
  await expect(page.getByRole('region', { name: 'Annual federal deduction benefit projection' }).locator('tbody tr')).toHaveCount(30);
  await page.getByRole('button', { name: 'Show amortization' }).click();
  const schedule = page.getByRole('region', { name: 'Monthly amortization schedule' });
  await expect(schedule.locator('tbody tr')).toHaveCount(360);
  await expect(schedule.locator('tbody tr').last().locator('td').last()).toHaveText('$0.00');
  await page.getByRole('button', { name: 'Hide amortization' }).click();
  await expect(schedule).toBeHidden();
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('insurance modes, zero interest, validation and cash purchases', async ({ page }) => {
  await page.goto('/mortgage');
  await page.getByLabel('Home insurance basis').selectOption('percentage');
  await expect(page.getByTestId('total-monthly')).toContainText('$7,472.92');
  await page.getByLabel('Mortgage interest rate').fill('0');
  await page.getByLabel('Fixed loan term').selectOption('15');
  await expect(page.getByTestId('piti')).toHaveText('$6,333.33');
  await page.getByLabel('Down payment', { exact: true }).fill('1100000');
  await expect(page.getByRole('alert')).toContainText('Down payment cannot exceed');
  await expect(page.getByTestId('piti')).toHaveCount(0);
  await page.getByLabel('Down payment', { exact: true }).fill('1000000');
  await expect(page.getByTestId('piti')).toHaveText('$1,333.33');
  await page.getByRole('button', { name: 'Show amortization' }).click();
  await expect(page.getByText('No mortgage to amortize:', { exact: false })).toBeVisible();
  await page.getByLabel('House purchase price').fill('');
  await expect(page.getByRole('alert')).toContainText('Required fields cannot be blank');
});

test('partial calendar years and mobile layout', async ({ page }) => {
  await page.goto('/mortgage');
  await page.getByLabel('City / state or ZIP code').fill('78701');
  const table = page.getByRole('region', { name: 'Annual federal deduction benefit projection' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Year', 'Home value', 'Deductible interest', 'Deductible property tax¹',
    'SALT cap', 'Standard deduction', 'Allowed itemized', 'Marginal rate',
    'Federal savings / yr', 'Federal savings / mo', 'Effective interest rate',
  ]);
  await expect(table.locator('tbody tr').first().locator('th, td')).toHaveCount(11);
  await expect(table.locator('tbody tr')).toHaveCount(31);
  await expect(table.locator('tbody tr').first()).toContainText('3 months');
  await expect(table.locator('tbody tr').last()).toContainText('9 months');
  await page.getByLabel('Of that total: state / local taxes').fill('20000');
  await expect(page.getByRole('alert')).toContainText('must be included within deductions not including mortgage interest');
  await page.getByLabel('Of that total: state / local taxes').fill('3000');
  await page.getByText('How this estimate works & important assumptions').click();
  await expect(page.getByRole('heading', { name: 'The benefit is the difference, not the whole deduction.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('deductions mirror SALT, include property tax and stay live through mortgage edits', async ({ page }) => {
  await page.goto('/mortgage');
  const deductions = page.getByLabel('Deductions not including mortgage interest');
  const salt = page.getByLabel('Of that total: state / local taxes');
  await expect(deductions).toHaveValue('13000');
  await expect(salt).toHaveValue('13000');
  await page.getByLabel('City / state or ZIP code').fill('Seattle, WA');
  await page.getByLabel('Annual household income').fill('250000');
  await deductions.fill('40000');
  await expect(salt).toHaveValue('40000');
  await salt.fill('20000');
  await expect(salt).toHaveValue('20000');
  await deductions.fill('45000');
  await expect(salt).toHaveValue('45000');
  await page.getByText('How this estimate works & important assumptions').click();
  const savings = await page.getByTestId('annual-savings').innerText();
  await page.getByLabel('House purchase price').fill('800000');
  await expect(page.getByTestId('annual-savings')).not.toHaveText(savings);
  await expect(deductions).toHaveValue('44400');
  await expect(salt).toHaveValue('44400');
  await expect(page.getByTestId('effective-interest-rate').first()).toHaveText(/\d+\.\d{2}%/);
  await page.getByLabel('House purchase price').fill('');
  await expect(page.getByLabel('Annual household income')).toHaveValue('250000');
  await expect(page.getByLabel('City / state or ZIP code')).toHaveValue('Seattle, WA');
  await expect(page.locator('details.assumptions')).toHaveAttribute('open', '');
  await page.getByLabel('House purchase price').fill('800000');
  await expect(deductions).toHaveValue('44400');
  await expect(page.getByTestId('annual-savings')).toBeVisible();
  await expect(page.locator('details.assumptions')).toHaveAttribute('open', '');
  await salt.fill('20000');
  await page.getByLabel('Annual property tax rate').fill('2');
  await expect(deductions).toHaveValue('46000');
  await expect(salt).toHaveValue('46000');
  await page.getByLabel('Mortgage interest rate').fill('0');
  await expect(page.getByTestId('annual-savings')).toContainText('$0.00');
  await expect(page.getByTestId('effective-interest-rate').first()).toHaveText('0.00%');
  await page.getByLabel('Down payment', { exact: true }).fill('800000');
  await expect(page.getByTestId('effective-interest-rate').first()).toHaveText('N/A');
});

test('all form inputs survive reload and reset replaces saved values', async ({ page }) => {
  await page.goto('/mortgage');
  const values: Record<string, string> = {
    'House purchase price': '1200000', 'Down payment': '240000',
    'Mortgage interest rate': '5.75', 'First payment month': '2026-03',
    'Annual property tax rate': '1.5', 'Annual home insurance': '3200',
    'Annual maintenance budget Optional': '4500', 'Monthly HOA dues': '125',
    'Annual household income': '300000', 'City / state or ZIP code': 'Austin, TX',
    'Deductions not including mortgage interest': '35000', 'Of that total: state / local taxes': '22000',
  };
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Fixed loan term').selectOption('15');
  await page.getByLabel('Filing status').selectOption('single');
  await page.getByLabel('Home insurance basis').selectOption('percentage');
  await page.getByLabel('Annual home insurance rate').fill('0.7');
  await page.reload();
  for (const [label, value] of Object.entries(values)) {
    if (label !== 'Annual home insurance') await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  }
  await expect(page.getByLabel('Fixed loan term')).toHaveValue('15');
  await expect(page.getByLabel('Filing status')).toHaveValue('single');
  await expect(page.getByLabel('Home insurance basis')).toHaveValue('percentage');
  await expect(page.getByLabel('Annual home insurance rate')).toHaveValue('0.7');
  await page.getByLabel('Home insurance basis').selectOption('fixed');
  await expect(page.getByLabel('Annual home insurance', { exact: true })).toHaveValue('3200');
  await expect(page.getByTestId('annual-savings')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.reload();
  const defaults: Record<string, string> = {
    'House purchase price': '1000000', 'Down payment': '100000',
    'Mortgage interest rate': '7.25', 'First payment month': '2026-10',
    'Annual property tax rate': '1.2', 'Annual home insurance': '2000',
    'Annual maintenance budget Optional': '0', 'Monthly HOA dues': '0',
    'Annual household income': '180000', 'City / state or ZIP code': '',
    'Deductions not including mortgage interest': '13000', 'Of that total: state / local taxes': '13000',
  };
  for (const [label, value] of Object.entries(defaults)) await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  await expect(page.getByLabel('Fixed loan term')).toHaveValue('30');
  await expect(page.getByLabel('Filing status')).toHaveValue('married');
  await page.getByLabel('Home insurance basis').selectOption('percentage');
  await expect(page.getByLabel('Annual home insurance rate')).toHaveValue('0.4');
});

test('unavailable or corrupt browser storage does not break the calculator', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('fintech.mortgage-planner.v1', '{broken'); });
  await page.goto('/mortgage');
  await expect(page.getByLabel('House purchase price')).toHaveValue('1000000');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } });
  });
  await page.reload();
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
  await page.getByLabel('House purchase price').fill('800000');
  await expect(page.getByTestId('total-monthly')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByLabel('House purchase price')).toHaveValue('1000000');
});

test('down payment planning updates savings, warns about retirement, and persists inputs', async ({ page }) => {
  await page.goto('/mortgage');
  const section = page.locator('details.down-payment-plan');
  const toggle = section.locator('summary');
  await expect(toggle).toHaveText('Planning the down payment');
  await expect(page.getByLabel('Retirement savings', { exact: true })).toBeHidden();
  await toggle.click();
  await page.getByLabel('Retirement savings', { exact: true }).fill('200000');
  await page.getByLabel('Non-retirement liquid savings').fill('80000');
  await page.getByLabel('Expected home sale proceeds').fill('50000');
  await page.getByLabel('Monthly expenses excluding housing').fill('2000');
  await page.getByLabel('House purchase price').fill('500000');
  await page.getByLabel('Mortgage interest rate').fill('0');
  await page.getByLabel('Annual property tax rate').fill('0');
  await page.getByLabel('Annual home insurance', { exact: true }).fill('0');
  await expect(page.getByTestId('closing-costs')).toHaveText('$10,000.00');
  await expect(page.getByTestId('purchase-cash')).toHaveText('$110,000.00');
  await expect(page.getByTestId('non-retirement-remaining')).toHaveText('$20,000.00');
  await expect(page.getByTestId('retirement-remaining')).toHaveText('$200,000.00');
  await expect(page.getByTestId('savings-remaining')).toHaveText('$220,000.00');
  await expect(page.getByTestId('monthly-spending')).toHaveText('$3,111.11');
  await expect(page.getByTestId('runway-excluding-retirement')).toHaveText('0 years 6 months');
  await expect(page.getByTestId('runway-including-retirement')).toHaveText('5 years 10 months');
  await page.getByLabel('Down payment', { exact: true }).fill('150000');
  await expect(page.getByTestId('closing-costs')).toHaveText('$8,750.00');
  await expect(section.getByRole('status')).toContainText('$28,750.00 of retirement savings');
  await expect(page.getByTestId('retirement-remaining')).toHaveText('$171,250.00');
  await page.getByLabel('Expected home sale proceeds').fill('200000');
  await expect(section.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('non-retirement-remaining')).toHaveText('$121,250.00');
  await page.getByLabel('Down payment', { exact: true }).fill('');
  await expect(section).toHaveAttribute('open', '');
  await expect(section.getByText('Correct the mortgage inputs', { exact: false })).toBeVisible();
  await page.getByLabel('Down payment', { exact: true }).fill('150000');
  await expect(page.getByTestId('savings-remaining')).toHaveText('$321,250.00');
  await page.getByLabel('Monthly expenses excluding housing').fill('');
  await expect(section.getByRole('alert')).toContainText('Required fields cannot be blank');
  await expect(page.getByTestId('savings-remaining')).toHaveCount(0);
  await page.getByLabel('Monthly expenses excluding housing').fill('2000');
  await page.reload();
  await toggle.click();
  await expect(page.getByLabel('Retirement savings', { exact: true })).toHaveValue('200000');
  await expect(page.getByLabel('Non-retirement liquid savings')).toHaveValue('80000');
  await expect(page.getByLabel('Expected home sale proceeds')).toHaveValue('200000');
  await expect(page.getByLabel('Monthly expenses excluding housing')).toHaveValue('2000');
  await expect(page.getByTestId('savings-remaining')).toHaveText('$321,250.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await toggle.click();
  await expect(page.getByTestId('savings-remaining')).toBeHidden();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.reload();
  await toggle.click();
  for (const label of ['Retirement savings', 'Non-retirement liquid savings', 'Monthly expenses excluding housing']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('0');
  }
  await expect(page.getByLabel('Expected home sale proceeds')).toHaveValue('0');
  await expect(section.getByRole('alert')).toContainText('Insufficient funds');
  await expect(page.getByTestId('runway-including-retirement')).toHaveText('N/A — purchase not funded');
});