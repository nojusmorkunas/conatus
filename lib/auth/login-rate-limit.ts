import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// The credentials provider and the device-token endpoint both accept a
// password, so they share one budget. Keep the key namespaces identical or an
// attacker can spend a fresh allowance by switching entry points.
const IP_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const USERNAME_LIMIT = { limit: 5, windowMs: 5 * 60 * 1000 };

export const LOGIN_RETRY_AFTER_SECONDS = USERNAME_LIMIT.windowMs / 1000;

export function checkLoginRateLimit(
  normalizedUsername: string,
  request?: Request | null,
) {
  if (request?.headers) {
    if (!checkRateLimit(`login:ip:${getClientIp(request)}`, IP_LIMIT).ok) {
      return false;
    }
  }
  return checkRateLimit(`login:username:${normalizedUsername}`, USERNAME_LIMIT).ok;
}
