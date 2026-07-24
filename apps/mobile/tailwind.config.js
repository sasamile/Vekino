/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#249DF2",
          foreground: "#ffffff",
        },
        brand: "#249DF2",
        sky: {
          DEFAULT: "#43B2FA",
          light: "#8FD6FF",
        },
        soft: {
          bg: "#F5F6F8",
          card: "#FFFFFF",
          muted: "#6D7178",
        },
      },
    },
  },
  plugins: [],
};
