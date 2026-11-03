// Sign-in and registration form checks shared by the web panel and the mobile
// app. Checked when the user submits rather than by disabling the button:
// browser autofill fills the fields without notifying the app until the user
// interacts, so a button disabled on empty state would stay disabled over
// filled fields. Password strength is judged by the server.

export const PASSWORD_RULE_HINT = 'At least 8 characters, with uppercase and lowercase letters, a number, and a symbol.';
export const PASSWORD_RULE_MESSAGE = 'Use a stronger password: at least 8 characters, with uppercase and lowercase letters, a number, and a symbol.';
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists.';

export function signInError(input: { email: string; password: string }): string {
  if (!input.email.trim()) return 'Enter your email address.';
  if (!input.password) return 'Enter your password.';
  return '';
}

export function registerError(input: { name: string; email: string; password: string }): string {
  if (input.name.trim().length < 2) return 'Enter your name (at least 2 characters).';
  if (!input.email.trim()) return 'Enter your email address.';
  if (!input.password) return 'Create a password.';
  return '';
}
