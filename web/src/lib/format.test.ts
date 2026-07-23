import { describe, it, expect } from 'vitest';
import { short, fmt, isValidAmount } from './format';
import { mapWalletError } from './errors';

describe('short', () => {
  it('truncates long values with an ellipsis', () => {
    expect(short('GABCDEF1234567890XYZ', 4)).toBe('GABC…0XYZ');
  });
  it('leaves short values untouched', () => {
    expect(short('GABC')).toBe('GABC');
  });
});

describe('fmt', () => {
  it('groups thousands', () => {
    expect(fmt(1000)).toBe('1,000');
    expect(fmt(250)).toBe('250');
  });
});

describe('isValidAmount', () => {
  it('accepts positive integers', () => {
    expect(isValidAmount('250')).toBe(true);
  });
  it('rejects zero, negatives, blanks and decimals', () => {
    expect(isValidAmount('0')).toBe(false);
    expect(isValidAmount('-5')).toBe(false);
    expect(isValidAmount('')).toBe(false);
    expect(isValidAmount('1.5')).toBe(false);
  });
});

describe('mapWalletError', () => {
  it('maps a missing wallet', () => {
    expect(mapWalletError(new Error('Freighter is not installed'))).toMatch(/not found/i);
  });
  it('maps a user rejection', () => {
    expect(mapWalletError(new Error('User declined the request'))).toMatch(/rejected/i);
  });
  it('passes through other messages', () => {
    expect(mapWalletError(new Error('network timeout'))).toBe('network timeout');
  });
});
