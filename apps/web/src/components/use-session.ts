'use client';

import { useEffect, useState } from 'react';

import { api, setCsrfToken } from '../lib/api';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  tenant: { id: string; slug: string; name: string };
  membership: { id: string; role: string };
  permissions: string[];
  csrfToken: string;
}

export const useSession = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void api<CurrentUser>('/me')
      .then(({ data }) => {
        if (!active) return;
        setCsrfToken(data.csrfToken);
        setUser(data);
      })
      .catch(() => {
        if (active) window.location.replace('/login');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
};
