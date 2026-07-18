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
        // Near-neutral cool paper — chosen ground, not default grey.
        canvas: "#f1f2f6",
        surface: "#ffffff",
        line: { DEFAULT: "#e4e5ec", strong: "#d2d5df" },
        ink: { DEFAULT: "#1a1d27", muted: "#585e70", faint: "#969bab" },
        // Denim / natural-indigo dye — the anchor. Used for brand, active
        // state, primary action and focus.
        brand: {
          DEFAULT: "#3a4a94",
          600: "#3a4a94",
          700: "#2f3d7d",
          800: "#26305f",
          tint: "#eceef7",
          fg: "#ffffff",
        },
        // Marigold / turmeric dye — the single signature pop. Decoration and
        // identity only, never a status or a control.
        marigold: { DEFAULT: "#e2a12c", 600: "#cf8f1c", light: "#f0bb5a" },
        // The navigation rail — deep vat indigo.
        rail: {
          DEFAULT: "#1b2547",
          2: "#222d54",
          line: "#33406b",
          muted: "#9aa2c4",
          fg: "#eef0f8",
        },
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      boxShadow: {
        xs: "0 1px 2px rgba(20,24,45,0.05)",
        card: "0 1px 2px rgba(20,24,45,0.04), 0 1px 3px rgba(20,24,45,0.06)",
        "card-hover": "0 2px 6px rgba(20,24,45,0.06), 0 10px 24px rgba(20,24,45,0.10)",
        pop: "0 20px 48px rgba(20,24,45,0.20), 0 6px 12px rgba(20,24,45,0.08)",
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
