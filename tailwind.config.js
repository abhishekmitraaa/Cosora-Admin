/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Characterful display for titles, KPI figures and the wordmark.
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        // Industrial-precise workhorse for the dense operating surface.
        sans: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Mill data: GSTIN, PAN, ids, currency codes, thread counts.
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Monochrome ground — clean neutral greys, white surfaces.
        canvas: "#f4f4f5",
        surface: "#ffffff",
        line: { DEFAULT: "#e6e6e8", strong: "#d4d4d7" },
        ink: { DEFAULT: "#161618", muted: "#6a6a70", faint: "#a2a2a8" },
        // Near-black — the anchor. Brand, active state, primary action, focus.
        brand: {
          DEFAULT: "#1d1d20",
          600: "#1d1d20",
          700: "#0a0a0b",
          800: "#050506",
          tint: "#efeff0",
          fg: "#ffffff",
        },
        // The navigation rail — near-black.
        rail: {
          DEFAULT: "#111113",
          2: "#1a1a1d",
          line: "#2b2b2e",
          muted: "#9a9aa0",
          fg: "#f0f0f1",
        },
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      boxShadow: {
        xs: "0 1px 2px rgba(17,17,20,0.05)",
        card: "0 1px 2px rgba(17,17,20,0.04), 0 1px 3px rgba(17,17,20,0.06)",
        "card-hover": "0 2px 6px rgba(17,17,20,0.06), 0 10px 24px rgba(17,17,20,0.10)",
        pop: "0 20px 48px rgba(17,17,20,0.22), 0 6px 12px rgba(17,17,20,0.10)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.985)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "content-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "scale-in": "scale-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "content-in": "content-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
