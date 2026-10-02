// Minimal RFC 6238/4226 TOTP generator — used only by the test harness
// to complete MFA enrollment for fixture admin/super_admin/support/
// finance users against a real local GoTrue instance, so edge-function
// tests exercise genuine aal2 sessions (requirePlatformRole() rejects
// anything less for every elevated role) rather than faking the aal
// claim, which isn't possible through the real HTTP+JWT path the way
// it is inside a pgTAP session via set_config(). The production app
// never generates a code itself — a human reads one from their own
// authenticator app — so this has no equivalent anywhere else in the
// codebase; it exists purely to make elevated-role edge-function tests
// possible without a human in the loop.

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

/** Generates the current 6-digit TOTP code for a base32 secret (30s step, as GoTrue uses). */
export async function generateTotpCode(base32Secret: string, forTime = Date.now()): Promise<string> {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(forTime / 1000 / 30);

  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmac = await hmacSha1(key, counterBytes);
  const offset = hmac[19] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binary % 1_000_000).toString().padStart(6, "0");
  return code;
}
