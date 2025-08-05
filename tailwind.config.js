/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        egov: {
          blue: '#003f8c',
          darkblue: '#002a5c',
          lightblue: '#e6f0ff',
          gray: '#f5f5f5',
          border: '#cccccc',
        },
      },
      fontFamily: {
        sans: ['メイリオ', 'Meiryo', 'sans-serif'],
      },
    },
  },
  plugins: [],
};