/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0e1a',
          2: '#111827',
          3: '#1a2235',
          4: '#1e2a42',
        },
        brand: {
          DEFAULT: '#3b82f6',
          light: '#60a5fa',
        },
        border: {
          DEFAULT: '#1e3058',
          2: '#2d4a7a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
