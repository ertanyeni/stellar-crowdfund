/**
 * Interaction with the Crowdfund + RewardToken contracts on the Stellar testnet:
 * read-only simulations, a signed `pledge` write (which triggers an
 * inter-contract reward mint), reward-token balance, and pledge-event polling.
 */
import {
  rpc,
  Contract,
  Address,
  Account,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import {
  CROWDFUND_ID,
  REWARD_TOKEN_ID,
  RPC_URL,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  READ_SOURCE,
} from './constants';

export const server = new rpc.Server(RPC_URL);
const crowdfund = new Contract(CROWDFUND_ID);
const rewardToken = new Contract(REWARD_TOKEN_ID);

const toNum = (v: unknown): number =>
  typeof v === 'bigint' ? Number(v) : Number(v ?? 0);

// ---------------------------------------------------------------- reads ----
async function simulate<T>(
  contract: Contract,
  method: string,
  ...args: xdr.ScVal[]
): Promise<T> {
  const source = new Account(READ_SOURCE, '0');
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const retval = sim.result?.retval;
  if (!retval) throw new Error(`Empty result from ${method}`);
  return scValToNative(retval) as T;
}

export interface Campaign {
  total: number;
  goal: number;
  progressBps: number;
}

export async function getCampaign(): Promise<Campaign> {
  const [total, goal, progressBps] = await Promise.all([
    simulate<bigint>(crowdfund, 'total'),
    simulate<bigint>(crowdfund, 'goal'),
    simulate<number>(crowdfund, 'progress_bps'),
  ]);
  return { total: toNum(total), goal: toNum(goal), progressBps: toNum(progressBps) };
}

export async function getPledged(address: string): Promise<number> {
  return toNum(await simulate<bigint>(crowdfund, 'pledged', new Address(address).toScVal()));
}

export async function getRewardBalance(address: string): Promise<number> {
  return toNum(await simulate<bigint>(rewardToken, 'balance', new Address(address).toScVal()));
}

// -------------------------------------------------------------- writes -----
export class NotFundedError extends Error {}

/** Build → simulate → assemble a `pledge` transaction, returning XDR to sign. */
export async function preparePledgeXdr(from: string, amount: number): Promise<string> {
  let account: Account;
  try {
    account = await server.getAccount(from);
  } catch {
    throw new NotFundedError(
      'Account not funded on testnet — use “Fund with Friendbot”, then try again.',
    );
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      crowdfund.call(
        'pledge',
        new Address(from).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
      ),
    )
    .setTimeout(60)
    .build();

  // Simulation captures the inter-contract footprint + auth before signing.
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return rpc.assembleTransaction(tx, sim).build().toXDR();
}

export interface TxResult {
  hash: string;
  newTotal: number | null;
}

export async function submitSignedTx(signedXdr: string): Promise<TxResult> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    throw new Error(`Submission rejected: ${JSON.stringify(sent.errorResult)}`);
  }

  const hash = sent.hash;
  let got = await server.getTransaction(hash);
  const deadline = Date.now() + 30_000;
  while (got.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    got = await server.getTransaction(hash);
  }
  if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    let newTotal: number | null = null;
    try {
      if (got.returnValue) newTotal = toNum(scValToNative(got.returnValue));
    } catch {
      /* return value is optional for the UI */
    }
    return { hash, newTotal };
  }
  throw new Error(`Transaction failed on-chain (${got.status}).`);
}

// -------------------------------------------------------------- events -----
export interface PledgeEvent {
  ledger: number;
  backer: string;
  amount: number;
  total: number;
  txHash?: string;
}

export async function getLatestLedger(): Promise<number> {
  return (await server.getLatestLedger()).sequence;
}

export async function fetchPledgeEvents(
  startLedger: number,
): Promise<{ events: PledgeEvent[]; latestLedger: number }> {
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [CROWDFUND_ID] }],
    limit: 100,
  });

  const events: PledgeEvent[] = [];
  for (const ev of res.events ?? []) {
    try {
      const topics = ev.topic.map((t) => scValToNative(t));
      if (topics[0] !== 'pledge') continue;
      const data = scValToNative(ev.value) as unknown;
      const tuple = Array.isArray(data) ? data : [data, 0];
      events.push({
        ledger: ev.ledger,
        backer: String(topics[1]),
        amount: toNum(tuple[0]),
        total: toNum(tuple[1]),
        txHash: (ev as { txHash?: string }).txHash,
      });
    } catch {
      /* skip malformed event */
    }
  }
  return { events, latestLedger: res.latestLedger };
}

// ------------------------------------------------------------- friendbot ---
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok && res.status !== 400) {
    throw new Error(`Friendbot funding failed (${res.status}).`);
  }
}

export async function isFunded(address: string): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  return res.ok;
}
