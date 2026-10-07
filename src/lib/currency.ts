const NPR_FORMATTER = new Intl.NumberFormat("en-NP", {
  style: "currency",
  currency: "NPR",
  maximumFractionDigits: 0,
});

export function formatPrice(amount: number): string {
  return NPR_FORMATTER.format(amount);
}
