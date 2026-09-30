// Random-token generation + hashing, shared by every flow that emails a
// one-time link and only ever persists the token's hash (agency
// invitations, and — via dispatch-notifications — the same invitations
// once their email send moved off the request path). Never store the
// return value of randomTokenHex() anywhere except the outgoing email
// itself; only sha256Hex(token) is safe to persist.

export function randomTokenHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
