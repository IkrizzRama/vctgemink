/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Simplified, consistent palette per design notes
        'vct-black-900': '#090909',
        'vct-black-800': '#181818',
        'vct-red': '#E11D48',
        'vct-gray-100': '#F5F5F5',
        'vct-white': '#FFFFFF',
        'vct-gold': '#D4AF37',
      },
      spacing: {
        // Explicit consistent spacing tokens (small set)
        4: '1rem',
        8: '2rem',
        12: '3rem',
        16: '4rem',
        24: '6rem',
        32: '8rem',
      },
      boxShadow: {
        'red-md': '0 12px 30px rgba(225,29,72,0.12)',
      }
    },
  },
  plugins: [],
}