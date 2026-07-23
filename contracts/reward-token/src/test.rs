#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> RewardTokenClient {
    env.mock_all_auths();
    let id = env.register(RewardToken, ());
    let client = RewardTokenClient::new(env, &id);
    let admin = Address::generate(env);
    let minter = Address::generate(env);
    client.init(&admin);
    client.set_minter(&minter);
    client
}

#[test]
fn mint_increases_balance_and_supply() {
    let env = Env::default();
    let client = setup(&env);
    let user = Address::generate(&env);
    client.mint(&user, &100);
    assert_eq!(client.balance(&user), 100);
    assert_eq!(client.total_supply(), 100);
}

#[test]
fn transfer_moves_balance() {
    let env = Env::default();
    let client = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.mint(&alice, &100);
    client.transfer(&alice, &bob, &40);
    assert_eq!(client.balance(&alice), 60);
    assert_eq!(client.balance(&bob), 40);
}

#[test]
fn transfer_insufficient_fails() {
    let env = Env::default();
    let client = setup(&env);
    let alice = Address::generate(&env);
    client.mint(&alice, &10);
    let bob = Address::generate(&env);
    assert_eq!(
        client.try_transfer(&alice, &bob, &50),
        Err(Ok(Error::InsufficientBalance))
    );
}

#[test]
fn mint_rejects_nonpositive() {
    let env = Env::default();
    let client = setup(&env);
    let u = Address::generate(&env);
    assert_eq!(client.try_mint(&u, &0), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn cannot_init_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(RewardToken, ());
    let client = RewardTokenClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.init(&admin);
    assert_eq!(client.try_init(&admin), Err(Ok(Error::AlreadyInitialized)));
}
