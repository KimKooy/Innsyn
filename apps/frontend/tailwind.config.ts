import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1cb5a8',
          50: '#e9faf8',
          100: '#c8f1ec',
          500: '#1cb5a8',
          600: '#159a8f',
          700: '#0f7a72',
        },
        soft: '#f0f7fc',
        ink: '#1a2733',
        line: '#dbe6ed',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
