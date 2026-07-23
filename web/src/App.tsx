import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
  getCampaign,
  getPledged,
  getRewardBalance,
  isFunded,
  fundWithFriendbot,
  preparePledgeXdr,
  submitSignedTx,
  fetchPledgeEvents,
  getLatestLedger,
  NotFundedError,
  type Campaign,
  type PledgeEvent,
} from './lib/contract';
import {
  openWalletModal,
  signXdr,
  mapWalletError,
  WalletClosed,
  type ConnectedWallet,
} from './lib/wallet';
import {
  CROWDFUND_ID,
  REWARD_TOKEN_ID,
  explorerContract,
  explorerTx,
  explorerAccount,
} from './lib/constants';

type TxState = 'idle' | 'pending' | 'success' | 'error';
interface Tx {
  state: TxState;
  message?: string;
  hash?: string;
}

const short = (a: string, n = 4) =>
  a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
const fmt = (n: number) => n.toLocaleString('en-US');

export default function App() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [funded, setFunded] = useState<boolean | null>(null);
  const [pledged, setPledged] = useState(0);
  const [rewards, setRewards] = useState(0);
  const [funding, setFunding] = useState(false);

  const [amount, setAmount] = useState('');
  const [tx, setTx] = useState<Tx>({ state: 'idle' });
  const [busy, setBusy] = useState(false);

  const [events, setEvents] = useState<PledgeEvent[]>([]);
  const cursor = useRef<number>(0);
  const seen = useRef<Set<string>>(new Set());

  const refreshCampaign = useCallback(async () => {
    try {
      setCampaign(await getCampaign());
      setCampaignError(null);
    } catch (e) {
      setCampaignError(e instanceof Error ? e.message : 'Failed to load campaign.');
    }
  }, []);

  const refreshBacker = useCallback(async (address: string) => {
    const [p, r, f] = await Promise.all([
      getPledged(address).catch(() => 0),
      getRewardBalance(address).catch(() => 0),
      isFunded(address).catch(() => false),
    ]);
    setPledged(p);
    setRewards(r);
    setFunded(f);
  }, []);

  const pollEvents = useCallback(async () => {
    try {
      // Stay within the RPC's forward-scan window so recent events are caught.
      const start = cursor.current || (await getLatestLedger()) - 8_000;
      const { events: fresh, latestLedger } = await fetchPledgeEvents(Math.max(1, start));
      cursor.current = latestLedger;
      const toAdd: PledgeEvent[] = [];
      for (const ev of fresh) {
        const key = `${ev.ledger}:${ev.backer}:${ev.total}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        toAdd.push(ev);
      }
      if (toAdd.length) setEvents((prev) => [...toAdd.reverse(), ...prev].slice(0, 12));
    } catch {
      /* transient RPC hiccup — next tick retries */
    }
  }, []);

  useEffect(() => {
    refreshCampaign();
    pollEvents();
    const id = setInterval(() => {
      refreshCampaign();
      pollEvents();
    }, 5000);
    return () => clearInterval(id);
  }, [refreshCampaign, pollEvents]);

  const onConnect = async () => {
    try {
      const w = await openWalletModal();
      setWallet(w);
      setTx({ state: 'idle' });
      await refreshBacker(w.address);
    } catch (e) {
      if (e instanceof WalletClosed) return;
      setTx({ state: 'error', message: e instanceof Error ? e.message : 'Could not connect.' });
    }
  };

  const onDisconnect = () => {
    setWallet(null);
    setFunded(null);
    setPledged(0);
    setRewards(0);
    setTx({ state: 'idle' });
  };

  const onFund = async () => {
    if (!wallet) return;
    setFunding(true);
    try {
      await fundWithFriendbot(wallet.address);
      await refreshBacker(wallet.address);
    } catch (e) {
      setTx({ state: 'error', message: e instanceof Error ? e.message : 'Funding failed.' });
    } finally {
      setFunding(false);
    }
  };

  const amountNum = Number(amount);
  const amountValid = amount !== '' && Number.isInteger(amountNum) && amountNum > 0;
  const canPledge = !!wallet && amountValid && !busy && funded !== false;

  const onPledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !canPledge) return;
    setBusy(true);
    setTx({ state: 'pending', message: 'Preparing transaction…' });
    try {
      const xdr = await preparePledgeXdr(wallet.address, amountNum);
      setTx({ state: 'pending', message: 'Waiting for wallet signature…' });
      const signed = await signXdr(xdr, wallet.address);
      setTx({ state: 'pending', message: 'Submitting to the testnet…' });
      const { hash } = await submitSignedTx(signed);
      setTx({ state: 'success', message: 'Pledge confirmed — reward tokens minted.', hash });
      setAmount('');
      await Promise.all([refreshCampaign(), refreshBacker(wallet.address), pollEvents()]);
    } catch (err) {
      const msg = err instanceof NotFundedError ? err.message : mapWalletError(err);
      setTx({ state: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  };

  const pct = campaign ? Math.min(100, Math.round(campaign.progressBps / 100)) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◈</span>
          <div>
            <h1>StellarFund</h1>
            <p className="tagline">On-chain crowdfunding · reward tokens on pledge</p>
          </div>
        </div>
        <span className="net-badge">TESTNET</span>
      </header>

      <main className="stack">
        {/* Campaign */}
        <section className="card card--gold">
          <div className="eyebrow">
            <span className="idx">01</span> Campaign · two contracts
          </div>
          {campaignError && !campaign && <p className="error-text">{campaignError}</p>}
          {!campaign && !campaignError && <p className="muted">Loading campaign…</p>}
          {campaign && (
            <>
              <h2 className="question">Fund the mission</h2>
              <p className="subtle">
                {fmt(campaign.total)} / {fmt(campaign.goal)} pledged · backers earn reward tokens 1:1
              </p>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span className="progress-fill" style={{ width: `${pct}%` }} />
                <span className="progress-label num">{pct}%</span>
              </div>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-num num">{fmt(campaign.total)}</span>
                  <span className="stat-label">Pledged</span>
                </div>
                <div className="stat">
                  <span className="stat-num num">{fmt(campaign.goal)}</span>
                  <span className="stat-label">Goal</span>
                </div>
                <div className="stat">
                  <span className="stat-num num">{pct}%</span>
                  <span className="stat-label">Funded</span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Wallet + pledge */}
        <section className="card card--blue">
          <div className="eyebrow">
            <span className="idx">02</span> Back the campaign
          </div>
          {!wallet ? (
            <div className="row between wrap">
              <p className="muted small" style={{ maxWidth: '58%' }}>
                Connect any Stellar wallet (Freighter, xBull, Albedo, Lobstr…) on Testnet to pledge.
              </p>
              <button className="btn primary" onClick={onConnect}>
                Connect wallet
              </button>
            </div>
          ) : (
            <>
              <div className="row between wrap">
                <div>
                  <span className="label">Connected · {wallet.walletName}</span>
                  <a className="mono addr" href={explorerAccount(wallet.address)} target="_blank" rel="noreferrer">
                    {short(wallet.address, 6)}
                  </a>
                </div>
                <div className="row gap">
                  {funded === false && (
                    <button className="btn primary sm" onClick={onFund} disabled={funding}>
                      {funding ? 'Funding…' : 'Fund with Friendbot'}
                    </button>
                  )}
                  <button className="btn ghost sm" onClick={onDisconnect}>
                    Disconnect
                  </button>
                </div>
              </div>

              <div className="mine-row">
                <div className="mine">
                  <span className="mine-num num">{fmt(pledged)}</span>
                  <span className="mine-label">Your pledge</span>
                </div>
                <div className="mine">
                  <span className="mine-num num">{fmt(rewards)}</span>
                  <span className="mine-label">Reward tokens</span>
                </div>
              </div>

              {funded === false && (
                <p className="error-text small">
                  This account isn’t funded on testnet yet — fund it to cover the transaction fee.
                </p>
              )}

              <form className="pledge-form" onSubmit={onPledge}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Pledge amount"
                />
                <button className="btn primary" type="submit" disabled={!canPledge}>
                  {busy ? 'Pledging…' : 'Pledge'}
                </button>
              </form>
            </>
          )}

          {tx.state !== 'idle' && (
            <div className={`tx-result ${tx.state}`}>
              <span className="tx-dot" aria-hidden="true" />
              <div>
                <strong>
                  {tx.state === 'pending' && 'Processing'}
                  {tx.state === 'success' && 'Success'}
                  {tx.state === 'error' && 'Error'}
                </strong>
                <p>{tx.message}</p>
                {tx.hash && (
                  <a className="mono" href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">
                    {short(tx.hash, 8)} ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Live event feed */}
        <section className="card card--green">
          <div className="row between">
            <div className="eyebrow" style={{ marginBottom: 0 }}>
              <span className="idx">03</span> Live activity
            </div>
            <span className="live-dot" title="Streaming contract events">● live</span>
          </div>
          {events.length === 0 ? (
            <p className="muted small">Waiting for on-chain pledge events…</p>
          ) : (
            <ul className="feed">
              {events.map((ev, i) => (
                <li key={`${ev.ledger}-${ev.backer}-${i}`} className="feed-item">
                  <span className="mono">{short(ev.backer)}</span> pledged{' '}
                  <strong>{fmt(ev.amount)}</strong>
                  <span className="feed-meta">
                    total {fmt(ev.total)} · ledger {ev.ledger}
                    {ev.txHash && (
                      <>
                        {' · '}
                        <a href={explorerTx(ev.txHash)} target="_blank" rel="noreferrer">
                          tx ↗
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="foot">
        <a className="mono" href={explorerContract(CROWDFUND_ID)} target="_blank" rel="noreferrer">
          fund {short(CROWDFUND_ID, 4)} ↗
        </a>
        <a className="mono" href={explorerContract(REWARD_TOKEN_ID)} target="_blank" rel="noreferrer">
          token {short(REWARD_TOKEN_ID, 4)} ↗
        </a>
        <span>Stellar Orange Belt · Rise In</span>
      </footer>
    </div>
  );
}
