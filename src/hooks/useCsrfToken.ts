import { useState, useCallback } from 'react';
import { getCsrfToken, validateCsrfToken } from '@/lib/csrf';

/**
 * CSRF protection hook - wraps the platform-wide csrf utility
 * for use in React components.
 */
export function useCsrfToken() {
  const [token] = useState(() => getCsrfToken());

  const validate = useCallback((submittedToken: string): boolean => {
    return validateCsrfToken(submittedToken);
  }, []);

  const getTokenHeader = useCallback((): Record<string, string> => {
    return { 'X-CSRF-Token': token };
  }, [token]);

  return { token, validateToken: validate, getTokenHeader };
}
