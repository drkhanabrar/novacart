// FILE: src/lib/services/nova-auth.ts
//
// Shared bearer-token check for the NOVA operational endpoints.
//
// These routes can retire products, rewrite scoring weights and delete raw
// telemetry, so an unset token denies access rather than allowing it. Failing
// open on a missing environment variable is how a scheduled job quietly becomes
// a public endpoint.

export function isAuthorized(request: Request): boolean {
  const configured = process.env.NOVA_RESEARCH_TOKEN?.trim();
  if (!configured) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const expected = `Bearer ${configured}`;

  // Length check first so the comparison below is only reached on equal-length
  // inputs; this keeps the timing profile flat for wrong-length guesses.
  if (header.length !== expected.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= header.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}
