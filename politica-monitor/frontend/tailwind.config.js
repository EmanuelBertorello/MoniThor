/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#080812',
          card: '#0f0f1a',
          border: '#1a1a2e',
          hover: '#14142a',
          input: '#0c0c1e',
        },
        primary: { DEFAULT: '#6366f1', dark: '#4f46e5', light: '#818cf8' },
        accent: { DEFAULT: '#8b5cf6', light: '#a78bfa' },
        success: { DEFAULT: '#10b981', light: '#34d399' },
        danger: { DEFAULT: '#ef4444', light: '#f87171' },
        warning: { DEFAULT: '#f59e0b', light: '#fbbf24' },
        info: { DEFAULT: '#3b82f6', light: '#60a5fa' },
        muted: '#475569',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'ping-once': 'ping 0.8s ease-out 1',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(12px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideInLeft: { from: { transform: 'translateX(-12px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(99,102,241,0.25)',
        'glow-md': '0 0 24px rgba(99,102,241,0.35)',
        'card': '0 4px 32px rgba(0,0,0,0.5)',
        'sidebar': '4px 0 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
