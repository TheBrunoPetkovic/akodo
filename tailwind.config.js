/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        ctp: {
          rosewater: "var(--ctp-rosewater)",
          flamingo: "var(--ctp-flamingo)",
          pink: "var(--ctp-pink)",
          mauve: "var(--ctp-mauve)",
          red: "var(--ctp-red)",
          maroon: "var(--ctp-maroon)",
          peach: "var(--ctp-peach)",
          yellow: "var(--ctp-yellow)",
          green: "var(--ctp-green)",
          teal: "var(--ctp-teal)",
          sky: "var(--ctp-sky)",
          sapphire: "var(--ctp-sapphire)",
          blue: "var(--ctp-blue)",
          lavender: "var(--ctp-lavender)",
          text: "var(--ctp-text)",
          subtext1: "var(--ctp-subtext1)",
          subtext0: "var(--ctp-subtext0)",
          overlay2: "var(--ctp-overlay2)",
          overlay1: "var(--ctp-overlay1)",
          overlay0: "var(--ctp-overlay0)",
          surface2: "var(--ctp-surface2)",
          surface1: "var(--ctp-surface1)",
          surface0: "var(--ctp-surface0)",
          base: "var(--ctp-base)",
          mantle: "var(--ctp-mantle)",
          crust: "var(--ctp-crust)",
        },
      },
    },
  },
  plugins: [],
};
