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
        /* 格子颜色走 CSS 变量，换界面时只改变量，格子组件不用改判断 */
        grass: {
          light: 'var(--grass-light)',
          dark: 'var(--grass-dark)',
          shadow: 'var(--grass-shadow)',
        },
        dirt: {
          light: 'var(--dirt-light)',
          dark: 'var(--dirt-dark)',
        },
      },
    },
  },
};
