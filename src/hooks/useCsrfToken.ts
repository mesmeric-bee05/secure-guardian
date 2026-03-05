import { useState, useEffect, useCallback } from 'react';

/**
 * CSRF protection hook - generates a per-session token
 * and validates it on form submissions.
 */
export function useCsrfToken() {
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    // Generate a cryptographically random token per session
    const existingToken = sessionStorage.getItem('csrf_token');
    if (existingToken) {
      setToken(existingToken);
    } else {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const newToken = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('csrf_token', newToken);
      setToken(newToken);
    }
  }, []);

  const validateToken = useCallback((submittedToken: string): boolean => {
    return submittedToken === token && token.length > 0;
  }, [token]);

  const getTokenHeader = useCallback((): Record<string, string> => {
    return { 'X-CSRF-Token': token };
  }, [token]);

  return { token, validateToken, getTokenHeader };
}
