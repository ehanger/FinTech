export const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(value);
export const wholeMoney = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);
export const percent = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'percent', maximumFractionDigits: 1,
}).format(value);
export const paymentDate = (year: number, month: number) => new Intl.DateTimeFormat('en-US', {
  month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(Date.UTC(year, month - 1, 1)));

export function yearsAndMonths(months: number): string {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return `${years} ${years === 1 ? 'year' : 'years'} ${remainder} ${remainder === 1 ? 'month' : 'months'}`;
}