#![no_std]
//! RewardToken — a minimal fungible token on Soroban.
//!
//! The Crowdfund contract is set as the `minter` and mints reward tokens to
//! backers when they pledge (an inter-contract call). Balances are transferable.
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, Env,
    Symbol,
};

contractmeta!(key = "name", val = "RewardToken");
contractmeta!(key = "version", val = "0.1.0");

const MINT: Symbol = symbol_short!("mint");
const XFER: Symbol = symbol_short!("transfer");

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 10 * DAY_IN_LEDGERS;
const BUMP_AMOUNT: u32 = 45 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Minter,
    Supply,
    Balance(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    InvalidAmount = 4,
    InsufficientBalance = 5,
}

#[contract]
pub struct RewardToken;

#[contractimpl]
impl RewardToken {
    /// Initialise with an admin (who may later assign the minter).
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Supply, &0i128);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Admin assigns the single authorised minter (the Crowdfund contract).
    pub fn set_minter(env: Env, minter: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Mint `amount` tokens to `to`. Only the configured minter may call this;
    /// when the Crowdfund contract calls it, its own auth is implicit.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let minter: Address = env
            .storage()
            .instance()
            .get(&DataKey::Minter)
            .ok_or(Error::NotAuthorized)?;
        minter.require_auth();

        let new_bal = Self::balance(env.clone(), to.clone()) + amount;
        Self::write_balance(&env, &to, new_bal);
        let supply = Self::total_supply(env.clone()) + amount;
        env.storage().instance().set(&DataKey::Supply, &supply);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        env.events().publish((MINT, to), amount);
        Ok(())
    }

    /// Move `amount` from `from` to `to`. Requires `from`'s authorization.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let from_bal = Self::balance(env.clone(), from.clone());
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        Self::write_balance(&env, &from, from_bal - amount);
        let to_bal = Self::balance(env.clone(), to.clone()) + amount;
        Self::write_balance(&env, &to, to_bal);

        env.events().publish((XFER, from, to), amount);
        Ok(())
    }

    pub fn balance(env: Env, addr: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(addr))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Supply).unwrap_or(0)
    }

    pub fn minter(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Minter)
    }

    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    fn write_balance(env: &Env, addr: &Address, amount: i128) {
        let key = DataKey::Balance(addr.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
}

mod test;
