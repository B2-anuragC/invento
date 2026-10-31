import { describe, expect, it } from 'vitest';

import { registerError, signInError } from './auth-validation';

describe('signInError', () => {
  it('asks for each missing field in order', () => {
    expect(signInError({ email: '', password: '' })).toBe('Enter your email address.');
    expect(signInError({ email: '   ', password: 'secret' })).toBe('Enter your email address.');
    expect(signInError({ email: 'owner@example.test', password: '' })).toBe('Enter your password.');
  });

  it('accepts a filled form; the server decides whether the details are right', () => {
    expect(signInError({ email: 'owner@example.test', password: 'x' })).toBe('');
  });
});

describe('registerError', () => {
  it('requires a name of at least two characters', () => {
    expect(registerError({ name: '', email: 'a@b.test', password: 'Valid#Pass1' })).toBe('Enter your name (at least 2 characters).');
    expect(registerError({ name: ' A ', email: 'a@b.test', password: 'Valid#Pass1' })).toBe('Enter your name (at least 2 characters).');
  });

  it('asks for the email, then a new password', () => {
    expect(registerError({ name: 'QA Owner', email: '', password: '' })).toBe('Enter your email address.');
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: '' })).toBe('Create a password.');
  });

  it('accepts a filled form; password strength is explained by the server rule', () => {
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: 'weak' })).toBe('');
  });
});
