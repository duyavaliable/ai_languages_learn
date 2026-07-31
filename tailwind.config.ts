import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
    './frontend/src/**/*.{ts,tsx,js,jsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        white: 'var(--color-white)',
        slate: {
          50: 'var(--color-slate-50)',
          100: 'var(--color-slate-100)',
          200: 'var(--color-slate-200)',
          300: 'var(--color-slate-300)',
          400: 'var(--color-slate-400)',
          500: 'var(--color-slate-500)',
          600: 'var(--color-slate-600)',
          700: 'var(--color-slate-700)',
          800: 'var(--color-slate-800)',
          900: 'var(--color-slate-900)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          border: 'hsl(var(--sidebar-border))',
          accent: 'hsl(var(--sidebar-accent))',
        },
        admin: {
          background: 'var(--admin-background)',
          foreground: 'var(--admin-foreground)',
          card: 'var(--admin-card)',
          'card-foreground': 'var(--admin-card-foreground)',
          muted: 'var(--admin-muted)',
          'muted-foreground': 'var(--admin-muted-foreground)',
          border: 'var(--admin-border)',
          input: 'var(--admin-input)',
          ring: 'var(--admin-ring)',
          primary: 'var(--admin-primary)',
          'primary-foreground': 'var(--admin-primary-foreground)',
          'primary-soft': 'var(--admin-primary-soft)',
          accent: 'var(--admin-accent)',
          'accent-foreground': 'var(--admin-accent-foreground)',
          success: 'var(--admin-success)',
          'success-foreground': 'var(--admin-success-foreground)',
          'success-soft': 'var(--admin-success-soft)',
          warning: 'var(--admin-warning)',
          'warning-foreground': 'var(--admin-warning-foreground)',
          'warning-soft': 'var(--admin-warning-soft)',
          danger: 'var(--admin-danger)',
          'danger-foreground': 'var(--admin-danger-foreground)',
          'danger-soft': 'var(--admin-danger-soft)',
          teal: 'var(--admin-teal)',
          'teal-soft': 'var(--admin-teal-soft)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        'admin-lg': 'var(--admin-radius-lg)',
        'admin': 'var(--admin-radius)',
        'admin-sm': 'var(--admin-radius-sm)',
      },
      boxShadow: {
        elegant: 'var(--shadow-elegant)',
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        sticky: 'var(--shadow-sticky)',
        'admin-card': 'var(--admin-shadow-card)',
        'admin-pop': 'var(--admin-shadow-pop)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'progress-fill': {
          from: { width: '0%' },
          to: { width: 'var(--progress-width)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'progress-fill': 'progress-fill 0.6s ease-out forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config