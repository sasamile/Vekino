/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#042046",
          foreground: "#ffffff",
        },
        brand: "#F26A3A", // naranja del isotipo Vekino
      },
    },
  },
  plugins: [],
};
