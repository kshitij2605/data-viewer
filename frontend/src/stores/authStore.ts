import { create } from 'zustand';
import * as authApi from '../api/auth.ts';
import type { UserInfo } from '../api/auth.ts';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    localStorage.setItem('token', res.token);
    set({ user: res.user, token: res.token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const user = await authApi.getMe();
      set({ user, token, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
