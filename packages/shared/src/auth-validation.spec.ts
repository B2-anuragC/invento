import { describe, expect, it } from 'vitest';

import { registerError, signInError } from './auth-validation.js';

describe('registerError', () => {
  it('requires a trimmed name of at least two characters', () => {
    for (const name of ['', ' A ', '  ']) {
      expect(registerError({ name, email: 'a@b.test', password: 'Valid#Pass1' })).toBe('Enter your name (at least 2 characters).');
    }
  });

  it('asks for the email when it is blank or only spaces', () => {
    expect(registerError({ name: 'QA Owner', email: '', password: 'Valid#Pass1' })).toBe('Enter your email address.');
    expect(registerError({ name: 'QA Owner', email: '   ', password: 'Valid#Pass1' })).toBe('Enter your email address.');
  });

  it('asks the user to create a password, not to enter one', () => {
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: '' })).toBe('Create a password.');
  });

  it('checks the fields in order: name, email, then password', () => {
    expect(registerError({ name: '', email: '', password: '' })).toBe('Enter your name (at least 2 characters).');
    expect(registerError({ name: 'QA Owner', email: '   ', password: '' })).toBe('Enter your email address.');
  });

  it('leaves password strength to the server', () => {
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: 'weak' })).toBe('');
  });
});

describe('signInError', () => {
  it('asks for each missing field, then accepts a filled form', () => {
    expect(signInError({ email: ' ', password: 'x' })).toBe('Enter your email address.');
    expect(signInError({ email: 'a@b.test', password: '' })).toBe('Enter your password.');
    expect(signInError({ email: 'a@b.test', password: 'x' })).toBe('');
  });
});
