/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        valodark: '#11141a', // Warna gelap khas UI Valorant
        valored: '#ff4655',  // Warna merah ikonik Valorant
      }
    },
  },
  plugins: [],
}