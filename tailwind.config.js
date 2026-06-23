/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{ts,tsx}",
    "./App.tsx",
    "./index.tsx",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
      },
      colors: {
        grass: {
          light: '#4ade80',
          dark: '#22c55e',
          shadow: '#15803d',
        },
        dirt: {
          light: '#e7cba9',
          dark: '#dbb484',
        },
      },
    },
  },
};
