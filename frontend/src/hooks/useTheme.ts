import { useEffect, useState, useCallback } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cbt-theme'

export function useTheme(defaultTheme: Theme = 'dark') {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
    const initial = stored ?? defaultTheme
    const root = document.documentElement
    const isDark = initial === 'dark'
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    return initial
  })

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark'
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggleTheme }
}

