import { hashPassword, verifyPassword } from './auth.crypto.js';

describe('auth crypto', () => {
  it('hashes and verifies passwords without exposing the plaintext', async () => {
    const hash = await hashPassword('Correct Horse Battery Staple1!');
    expect(hash).not.toContain('Correct Horse');
    await expect(verifyPassword('Correct Horse Battery Staple1!', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });
});
