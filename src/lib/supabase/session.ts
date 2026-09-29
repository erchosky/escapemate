export type SessionUser = {
  id: string;
  user_metadata: Record<string, unknown>;
};

type ClaimsClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims: { sub?: string; user_metadata?: Record<string, unknown> } } | null;
      error: unknown;
    }>;
  };
};

// getClaims() verifies the session JWT locally against the project's signing keys (cached
// JWKS), instead of calling the Auth server on every request like getUser(). Projects still
// on the legacy symmetric secret transparently fall back to getUser().
export async function getSessionUser(supabase: ClaimsClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, user_metadata: data.claims.user_metadata ?? {} };
}
