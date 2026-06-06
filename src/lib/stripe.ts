import { loadStripe } from "@stripe/stripe-js";

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

if (!key) {
  if (import.meta.env.PROD) {
    throw new Error("VITE_STRIPE_PUBLISHABLE_KEY is required in production.");
  }
  console.warn("VITE_STRIPE_PUBLISHABLE_KEY is not set — payments will not work.");
}

export const stripePromise = key ? loadStripe(key) : Promise.resolve(null);
