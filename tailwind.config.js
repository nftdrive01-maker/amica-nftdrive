const { light, dark } = require("@charcoal-ui/theme");
/**
 * @type {import('tailwindcss/tailwind-config').TailwindConfig}
 */
module.exports = {
  darkMode: true,
  content: ["./src/**/*.tsx", "./src/**/*.html"],
  theme: {
    extend: {
      colors: {
        primary: "#1E3A8A",
        "primary-hover": "#1D4ED8",
        "primary-press": "#2563EB",
        "primary-disabled": "#1E3A8A4D",
        secondary: "#0EA5A4",
        "secondary-hover": "#14B8A6",
        "secondary-press": "#2DD4BF",
        "secondary-disabled": "#0EA5A44D",
        base: "#E6EEF7",
        "text-primary": "#1F2A44",
      },
      fontFamily: {
        M_PLUS_2: ["Montserrat", "M_PLUS_2", "sans-serif"],
        Montserrat: ["Montserrat", "sans-serif"],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
