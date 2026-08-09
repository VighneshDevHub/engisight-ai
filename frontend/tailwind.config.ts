import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Maritime / engineering palette per user preference
        navy: {
          50:  "#f0f5fb",
          100: "#dce7f5",
          200: "#b8cde8",
          300: "#88abd6",
          400: "#5682bf",
          500: "#3663a3",
          600: "#274d86",
          700: "#1e3d6c",   // base dark navy
          800: "#173056",
          900: "#0f2142",   // deep dark navy
          950: "#091530",   // midnight navy
        },
        cyan: {
          450: "#16c7d9",
          550: "#0ea5b5",
        },
        steel: {
          50:  "#f3f6fa",
          100: "#e5ecf3",
          200: "#cbd8e5",
          300: "#a4b9d0",
          400: "#7693b5",
          500: "#567498",
          600: "#425b7b",
          700: "#364a64",
          800: "#2e3f54",
          900: "#283648",
        },
      },
      boxShadow: {
        xs: "0 1px 2px rgba(0,0,0,0.05)",
        glow: "0 0 0 3px rgba(22, 199, 217, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
