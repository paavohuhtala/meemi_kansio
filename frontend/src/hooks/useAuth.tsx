import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout, type User } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string, invite_code?: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const login = async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    queryClient.setQueryData(['auth', 'me'], result);
    return result;
  };

  const register = async (username: string, password: string, invite_code?: string) => {
    const result = await apiRegister(username, password, invite_code);
    queryClient.setQueryData(['auth', 'me'], result);
    return result;
  };

  const logout = async () => {
    await apiLogout();
    queryClient.setQueryData(['auth', 'me'], null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
