import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", '"Cascadia Mono"', "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
