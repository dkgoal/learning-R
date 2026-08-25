import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0d1424",
        surface: "#f6f7fb",
        line: "#e3e6ef",
        // Status palette used across gates, expirables, and enrollment chips.
        ok: "#12734f",
        warn: "#8a5a00",
        risk: "#a11d33",
        info: "#1f4d8f",
      },
      maxWidth: {
        content: "80rem",
      },
    },
  },
  plugins: [],
};

export default config;
