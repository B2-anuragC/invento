// Checked when the user submits rather than by disabling the button: browser
// autofill fills the fields without notifying the app until the user interacts,
// so a button disabled on empty state would stay disabled over filled fields.

export function signInError(input: { email: string; password: string }): string {
  if (!input.email.trim()) return 'Enter your email address.';
  if (!input.password) return 'Enter your password.';
  return '';
}

export function registerError(input: { name: string; email: string; password: string }): string {
  if (input.name.trim().length < 2) return 'Enter your name (at least 2 characters).';
  return signInError(input) === 'Enter your password.' ? 'Create a password.' : signInError(input);
}
