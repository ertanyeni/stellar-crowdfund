/** Truncate a long id/address to `head…tail`. */
export function short(value: string, chars = 4): string {
  return value.length <= chars * 2 + 1
    ? value
    : `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

/** Group a number with thousands separators. */
export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Whether a pledge amount string is a positive whole number. */
export function isValidAmount(raw: string): boolean {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isInteger(n) && n > 0;
}
