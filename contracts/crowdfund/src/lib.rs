#![no_std]
//! Crowdfund — an on-chain crowdfunding campaign on Soroban.
//!
//! When a backer pledges, the campaign records the pledge and makes an
//! **inter-contract call** to `RewardToken.mint`, rewarding the backer 1:1 in
//! reward tokens. Progress and pledges are readable and a `pledge` event is
//! emitted for real-time frontends.
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, Env,
    IntoVal, Symbol, Val, Vec,
};

contractmeta!(key = "name", val = "Crowdfund");
contractmeta!(key = "version", val = "0.1.0");

const PLEDGE: Symbol = symbol_short!("pledge");

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 10 * DAY_IN_LEDGERS;
const BUMP_AMOUNT: u32 = 45 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Token,
    Goal,
    Total,
    Pledged(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InvalidGoal = 4,
}

#[contract]
pub struct Crowdfund;

#[contractimpl]
impl Crowdfund {
    /// Configure the campaign with its admin, reward-token address, and goal.
    pub fn init(env: Env, admin: Address, reward_token: Address, goal: i128) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if goal <= 0 {
            return Err(Error::InvalidGoal);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &reward_token);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::Total, &0i128);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Pledge `amount` to the campaign. Requires the backer's authorization,
    /// records the pledge, then makes an inter-contract call to mint reward
    /// tokens to the backer. Returns the new campaign total.
    pub fn pledge(env: Env, from: Address, amount: i128) -> Result<i128, Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        let prev = Self::pledged(env.clone(), from.clone());
        let pkey = DataKey::Pledged(from.clone());
        env.storage().persistent().set(&pkey, &(prev + amount));
        env.storage()
            .persistent()
            .extend_ttl(&pkey, BUMP_THRESHOLD, BUMP_AMOUNT);

        let total = Self::total(env.clone()) + amount;
        env.storage().instance().set(&DataKey::Total, &total);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        // --- inter-contract call: reward the backer 1:1 in reward tokens ---
        let mint_args: Vec<Val> = (from.clone(), amount).into_val(&env);
        env.invoke_contract::<()>(&token, &symbol_short!("mint"), mint_args);

        env.events().publish((PLEDGE, from), (amount, total));
        Ok(total)
    }

    pub fn total(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }

    pub fn pledged(env: Env, addr: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Pledged(addr))
            .unwrap_or(0)
    }

    pub fn goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap_or(0)
    }

    pub fn reward_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Token)
    }

    /// Campaign progress toward the goal, in basis points (0..=10000).
    pub fn progress_bps(env: Env) -> u32 {
        let goal = Self::goal(env.clone());
        if goal <= 0 {
            return 0;
        }
        let bps = Self::total(env.clone()).saturating_mul(10_000) / goal;
        if bps > 10_000 {
            10_000
        } else {
            bps as u32
        }
    }
}

mod test;
