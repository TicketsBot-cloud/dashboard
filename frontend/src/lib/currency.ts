const ZERO_DECIMAL_CURRENCIES = new Set(["jpy"]);

export function formatCurrency(amountMinorUnits: number, currency: string): string {
  const code = currency.toLowerCase();
  const digits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const value = amountMinorUnits / Math.pow(10, digits);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrencyFromMajor(amount: number, currency: string): string {
  const code = currency.toLowerCase();
  const digits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
