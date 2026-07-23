/**
 * Multi-wallet access via StellarWalletsKit — opens a modal listing every
 * supported Stellar wallet (Freighter, xBull, Albedo, Lobstr, Rabet, Hana…),
 * then exposes address + transaction signing for the selected one.
 */
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
  type ISupportedWallet,
} from '@creit.tech/stellar-wallets-kit';
import { requestAccess as freighterRequestAccess } from '@stellar/freighter-api';

export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: allowAllModules(),
});

export interface ConnectedWallet {
  address: string;
  walletId: string;
  walletName: string;
}

/** Open the wallet picker; resolves with the chosen wallet + address. */
export function openWalletModal(): Promise<ConnectedWallet> {
  return new Promise((resolve, reject) => {
    kit
      .openModal({
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            kit.setWallet(option.id);
            let address = '';
            try {
              address = (await kit.getAddress()).address;
            } catch (inner) {
              // Freighter returns "request access first" until the dApp is
              // granted access — trigger the access prompt explicitly.
              if (option.id !== FREIGHTER_ID) throw inner;
            }
            if (!address && option.id === FREIGHTER_ID) {
              const r = await freighterRequestAccess();
              if (r.error || !r.address) {
                throw new WalletError(mapWalletError(r.error?.message ?? 'Access denied.'));
              }
              address = r.address;
            }
            if (!address) throw new WalletError('No address returned from the wallet.');
            resolve({ address, walletId: option.id, walletName: option.name });
          } catch (e) {
            reject(e instanceof WalletError ? e : new WalletError(mapWalletError(e)));
          }
        },
        onClosed: (err?: Error) => {
          if (err) reject(new WalletError(mapWalletError(err)));
          else reject(new WalletClosed());
        },
      })
      .catch((e) => reject(new WalletError(mapWalletError(e))));
  });
}

export async function signXdr(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    address,
    networkPassphrase: WalletNetwork.TESTNET,
  });
  return signedTxXdr;
}

export class WalletError extends Error {}
export class WalletClosed extends Error {}

/**
 * Normalise the many shapes of wallet errors into the three cases the UI
 * cares about: not installed, user rejected, or something else.
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
