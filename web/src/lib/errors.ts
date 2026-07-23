/**
 * Normalise the many shapes of wallet errors into the three cases the UI
 * cares about: not installed, user rejected, or something else. Kept pure
 * (no wallet-kit import) so it is unit-testable in isolation.
 */
export function mapWalletError(e: unknown): string {
  const raw =
    (e as { message?: string })?.message != null
      ? String((e as { message?: string }).message)
      : String(e);
  const m = raw.toLowerCase();

  if (
    m.includes('not installed') ||
    m.includes('not found') ||
    m.includes('no wallet') ||
    m.includes('could not be found') ||
    m.includes('unavailable') ||
    m.includes('is not available')
  ) {
    return 'Wallet not found — install/enable the extension and reload.';
  }
  if (
    m.includes('reject') ||
    m.includes('declined') ||
    m.includes('denied') ||
    m.includes('cancel') ||
    m.includes('user did not')
  ) {
    return 'Request rejected in the wallet.';
  }
  return raw || 'Wallet error.';
}
