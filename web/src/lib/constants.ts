import { Networks } from '@stellar/stellar-sdk';

/** Deployed + initialized on Stellar testnet. */
export const CROWDFUND_ID = 'CDKNHK7RJDVGUQ2TBBYW5DQWBRKVP5AF7CCIZIYJWNRF6FSR3URZALG2';
export const REWARD_TOKEN_ID = 'CBMJ37QJKPTSJIW5EPLGZJWA5XLKE7JFGUCVLNBHGCRQWX6N7HP6DTH5';

export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** Any existing account works as the source for read-only simulations. */
export const READ_SOURCE = 'GCXWOCNYVVOBGV2B5CWGRP2J4HCUW7PFQRJZNNLBIHOMUSK5I3T253C4';

export const explorerTx = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerContract = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;
export const explorerAccount = (addr: string) =>
  `https://stellar.expert/explorer/testnet/account/${addr}`;
