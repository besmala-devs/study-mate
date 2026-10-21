import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1b1a",
        paper: "#faf9f6",
        accent: "#3d5a80",
        accentSoft: "#e8eef5",
        warn: "#b5482a",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [typography],
};

export default config;
