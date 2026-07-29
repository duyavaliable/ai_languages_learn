import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

const NO_FLASH_SCRIPT = `
  (function() {
    try {
      var t = localStorage.getItem('lingua-theme');
      var d = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var c = document.documentElement.classList;
      d ? c.add('dark') : c.remove('dark');
    } catch (e) {}
  })();
`;

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light');

  useEffect(() => {
    const stored = localStorage.getItem('lingua-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored ?? (prefersDark ? 'dark' : 'light');
    setThemeState(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem('lingua-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
