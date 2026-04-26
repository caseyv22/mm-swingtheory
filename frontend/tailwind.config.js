/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'st-green': '#064029',
        'st-accent': '#1D9E75',
        'st-light': '#E1F5EE',
        'st-offwhite': '#FAFBFF',
        'st-cloud': '#EDEFF7',
        'st-smoke': '#D3D6E0',
        'st-graphite': '#6E7180',
        'st-arsenic': '#40424D',
        'st-phantom': '#1E1E24',
      },
      fontFamily: {
        sans: ['"Manrope"', 'sans-serif'],
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
