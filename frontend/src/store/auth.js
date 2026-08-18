import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../utils/api.js'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      login: async (username, password) => {
        const { data } = await api.post('/auth/login', { username, password })
        set({ user: data.user, token: data.token })
        return data.user
      },

      register: async (params) => {
        const { data } = await api.post('/auth/register', params)
        set({ user: data.user, token: data.token })
        return data.user
      },

      logout: () => set({ user: null, token: null }),

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me')
          set({ user: data.user })
        } catch {}
      }
    }),
    { name: 'mingli-auth' }
  )
)
