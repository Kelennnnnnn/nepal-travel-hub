// TODO(NPR-formatter): the platform is moving to an NPR-only pricing model
// (see the payment-model removal task). This currently just prefixes a
// plain number — replace with a real Intl.NumberFormat(..., { style:
// "currency", currency: "NPR" }) formatter (and decide on symbol placement/
// grouping conventions for NPR) once that model is designed. Every USD/"$"
// formatter removed from the codebase during that cleanup was pointed here.
export function formatPrice(amount: number): string {
  return `NPR ${amount.toLocaleString()}`;
}
