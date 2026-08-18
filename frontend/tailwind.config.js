/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf8f3',
          100: '#faecd9',
          200: '#f3d4ae',
          300: '#e9b579',
          400: '#dd8e46',
          500: '#d47128',
          600: '#c55a1e',
          700: '#a4441b',
          800: '#84381e',
          900: '#6c301b',
        },
        ink: {
          50: '#f7f6f4',
          100: '#eeece7',
          200: '#d8d4ca',
          300: '#b9b2a2',
          400: '#958b78',
          500: '#796e5b',
          600: '#62594a',
          700: '#4f483e',
          800: '#413c35',
          900: '#38342e',
        },
        wuxing: {
          jin: '#c0c0c0',
          mu: '#3aa84d',
          shui: '#2f80ed',
          huo: '#e64a33',
          tu: '#c68a3f'
        }
      },
      fontFamily: {
        song: ['"Noto Serif SC"', '"Source Han Serif"', '"Songti SC"', 'serif'],
        kai: ['"KaiTi"', '"STKaiti"', 'serif']
      }
    },
  },
  plugins: [],
}
