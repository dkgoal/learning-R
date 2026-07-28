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
        // BMW-neutral palette — deliberately NOT BMW blue in the brand mark,
        // to avoid implying official affiliation (R-02).
        ink: "#0b1220",
        surface: "#f7f8fa",
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
