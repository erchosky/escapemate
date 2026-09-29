export const AUTH_ERROR_CODES = ["discord_oauth_failed", "auth_unknown_error"] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const LEGACY_AUTH_ERROR_MESSAGES: Record<string, AuthErrorCode> = {
  "No se pudo iniciar sesión con Discord.": "discord_oauth_failed",
};

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && AUTH_ERROR_CODES.includes(value as AuthErrorCode);
}

export function resolveAuthErrorCode(value: string | undefined | null): AuthErrorCode | null {
  if (!value) return null;
  if (isAuthErrorCode(value)) return value;
  return LEGACY_AUTH_ERROR_MESSAGES[value] ?? "auth_unknown_error";
}

export function authErrorRedirectPath(code: AuthErrorCode) {
  return `/login?error=${code}`;
}
