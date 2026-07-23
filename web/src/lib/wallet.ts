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
import { mapWalletError } from './errors';

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

// Pure error-mapping lives in ./errors so it can be unit-tested without
// importing the (browser-only) wallet kit.
export { mapWalletError };
