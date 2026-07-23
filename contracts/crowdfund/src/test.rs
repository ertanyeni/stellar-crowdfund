#![cfg(test)]

use super::*;
use reward_token::{RewardToken, RewardTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

/// Deploy both contracts and wire the crowdfund as the reward-token minter.
fn setup(env: &Env, goal: i128) -> (CrowdfundClient, RewardTokenClient) {
    env.mock_all_auths();
    let admin = Address::generate(env);

    let token_id = env.register(RewardToken, ());
    let token = RewardTokenClient::new(env, &token_id);
    token.init(&admin);

    let cf_id = env.register(Crowdfund, ());
    let cf = CrowdfundClient::new(env, &cf_id);
    cf.init(&admin, &token_id, &goal);

    // The crowdfund contract becomes the only authorised minter.
    token.set_minter(&cf_id);

    (cf, token)
}

#[test]
fn pledge_updates_total_and_rewards_backer() {
    let env = Env::default();
    let (cf, token) = setup(&env, 1000);
    let backer = Address::generate(&env);

    let total = cf.pledge(&backer, &250);
    assert_eq!(total, 250);
    assert_eq!(cf.total(), 250);
    assert_eq!(cf.pledged(&backer), 250);
    // The inter-contract call minted reward tokens 1:1.
    assert_eq!(token.balance(&backer), 250);
    assert_eq!(token.total_supply(), 250);
}

#[test]
fn multiple_pledges_accumulate_and_track_progress() {
    let env = Env::default();
    let (cf, token) = setup(&env, 1000);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    cf.pledge(&a, &400);
    cf.pledge(&b, &300);
    cf.pledge(&a, &100);
    assert_eq!(cf.total(), 800);
    assert_eq!(cf.pledged(&a), 500);
    assert_eq!(token.balance(&a), 500);
    assert_eq!(cf.progress_bps(), 8000); // 80%
}

#[test]
fn progress_caps_at_100_percent() {
    let env = Env::default();
    let (cf, _token) = setup(&env, 100);
    let backer = Address::generate(&env);
    cf.pledge(&backer, &250);
    assert_eq!(cf.progress_bps(), 10_000);
}

#[test]
fn pledge_rejects_nonpositive() {
    let env = Env::default();
    let (cf, _token) = setup(&env, 1000);
    let backer = Address::generate(&env);
    assert_eq!(cf.try_pledge(&backer, &0), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn init_rejects_bad_goal() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token_id = env.register(RewardToken, ());
    let cf_id = env.register(Crowdfund, ());
    let cf = CrowdfundClient::new(&env, &cf_id);
    assert_eq!(
        cf.try_init(&admin, &token_id, &0),
        Err(Ok(Error::InvalidGoal))
    );
}
