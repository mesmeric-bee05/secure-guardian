/**
 * Platform-wide CSRF protection utility.
 * Generates per-session tokens and provides validation + header helpers.
 */

const CSRF_KEY = 'csrf_token';

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function getCsrfToken(): string {
  let token = sessionStorage.getItem(CSRF_KEY);
  if (!token) {
    token = generateToken();
    sessionStorage.setItem(CSRF_KEY, token);
  }
  return token;
}

export function validateCsrfToken(submittedToken: string): boolean {
  const token = sessionStorage.getItem(CSRF_KEY);
  return !!token && token.length > 0 && submittedToken === token;
}

export function csrfHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': getCsrfToken() };
}

/**
 * Wraps an async callback with CSRF validation.
 * Throws if the token is invalid.
 */
export async function withCsrfValidation<T>(
  token: string,
  callback: () => Promise<T>
): Promise<T> {
  if (!validateCsrfToken(token)) {
    throw new Error('CSRF token validation failed. Please refresh the page and try again.');
  }
  return callback();
}
