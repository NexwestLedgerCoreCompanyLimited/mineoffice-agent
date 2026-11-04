/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "#EEF2F8",
        ink: "#0F1C33",
        muted: "#48566E",
        faint: "#5D6B82",
        line: "#D8E0EC",
        "line-strong": "#C6D1E1",
        panel: "#F3F6FB",
        brand: {
          DEFAULT: "#1557E6",
          text: "#1148BD",
          tint: "#E6EEFF",
          soft: "#F1F6FF",
          edge: "#BCD0F7"
        },
        lantern: {
          DEFAULT: "#F2A516",
          tint: "#FFF8E8",
          text: "#6B4300",
          deep: "#4F3300"
        },
        good: { DEFAULT: "#1B8A4B", tint: "#E9F6EE", edge: "#A9DBBD" },
        bad: { DEFAULT: "#8A1F1A", tint: "#FCEDEC", edge: "#F0B7B3" }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', 'monospace'],
        pixel: ['"Pixelify Sans"', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
