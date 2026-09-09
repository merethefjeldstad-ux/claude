import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "oklch(98% 0.004 80)",
          panel: "oklch(99% 0.002 80)",
          "panel-alt": "oklch(97% 0.01 230)",
          border: "oklch(90% 0.004 80)",
          "border-soft": "oklch(92% 0.004 80)",
          text: "oklch(22% 0.01 260)",
          "text-muted": "oklch(52% 0.01 260)",
          "text-faint": "oklch(60% 0.01 260)",
          "text-disabled": "oklch(65% 0.01 260)",
          "text-off": "oklch(75% 0.01 260)",
        },
        accent: {
          DEFAULT: "#4C6B8A",
          hover: "#3A5570",
        },
        cat: {
          "kjapt-bg": "oklch(94% 0.05 150)",
          "kjapt-fg": "oklch(32% 0.08 150)",
          "middels-bg": "oklch(94% 0.06 80)",
          "middels-fg": "oklch(38% 0.09 80)",
          "tidkrevende-bg": "oklch(94% 0.05 30)",
          "tidkrevende-fg": "oklch(40% 0.09 30)",
        },
      },
      fontFamily: {
        sans: ["'Public Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
