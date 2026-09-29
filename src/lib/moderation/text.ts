const PAYMENT_CONTEXT_PATTERN =
  /\b(?:rmt|real\s*money|dinero\s*real|paypal|bizum|stripe|wise|crypto|usdt|venmo|cashapp)\b|(?:€|\$)|\b(?:usd|eur)\b/i;

const TRADE_FOR_MONEY_PATTERN =
  /\b(?:vendo|venta|compr[oa]|pay|sell|buy)\b.{0,40}\b(?:rublos?|rubles?|roubles?|carries?|carry|quest|raid|loot|kits?)\b|\b(?:rublos?|rubles?|roubles?|carries?|carry|quest|raid|loot|kits?)\b.{0,40}\b(?:vendo|venta|compr[oa]|pay|sell|buy)\b/i;

export function normalizeModerationText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@*_.\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function containsForbiddenTradeText(value: string) {
  const normalized = normalizeModerationText(value);
  if (!normalized) return false;

  return PAYMENT_CONTEXT_PATTERN.test(normalized) || TRADE_FOR_MONEY_PATTERN.test(normalized);
}
