export function isFakePaymentPageEnabled(nodeEnv: string | undefined, provider: string | undefined): boolean {
  return nodeEnv !== "production" && provider?.trim().toLowerCase() === "fake";
}

export function parseOrderCode(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const code = Number(value);
  return Number.isSafeInteger(code) ? code : null;
}
