import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  medical_conditions: string[] | null;
  date_of_birth: string | null;
  preferred_language: 'en' | 'sw';
  onboarding_completed: boolean;
}

interface UserRole {
  role: 'user' | 'chw' | 'admin';
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
      }
      if (rolesRes.data) {
        setRoles(rolesRes.data as UserRole[]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setRolesLoaded(true);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid Supabase auth deadlock, but track completion
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setRolesLoaded(true);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id).then(() => setLoading(false));
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      setRolesLoaded(false);
    }
    return { error };
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single();
    if (data) setProfile(data as Profile);
    return { data, error };
  }, [user]);

  const hasRole = useCallback((role: 'user' | 'chw' | 'admin') => {
    return roles.some(r => r.role === role);
  }, [roles]);

  const isAdmin = useCallback(() => hasRole('admin'), [hasRole]);
  const isChw = useCallback(() => hasRole('chw'), [hasRole]);

  return {
    user,
    session,
    profile,
    roles,
    loading,
    rolesLoaded,
    signUp,
    signIn,
    signOut,
    updateProfile,
    hasRole,
    isAdmin,
    isChw,
  };
}
