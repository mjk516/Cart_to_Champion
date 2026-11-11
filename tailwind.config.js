/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans KR"', 'system-ui', 'sans-serif'],
        pen: ['"Nanum Pen Script"', 'cursive'],
      },
      colors: { racing: { DEFAULT: '#e10600', dark: '#a30400' } },
    },
  },
  plugins: [],
};
