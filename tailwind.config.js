/** @type {import('tailwindcss').Config} */

/**
 * Every colour is a CSS variable defined in src/index.css, read here through
 * `rgb(var(--token) / <alpha-value>)` so opacity modifiers (`bg-surface/70`)
 * still work. Nothing in this file is a literal colour, which is what makes the
 * dark mode a single set of variable overrides rather than a `dark:` variant on
 * every utility in the app.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

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

      /**
       * TYPE SCALE - seven steps, and there are no others.
       *
       * Pages used to reach for `text-[1.55rem]` and `text-[1.75rem]` inline,
       * which is how a "scale" stops being one. These four named steps replace
       * every arbitrary value in the app; the rest are Tailwind's own xs/sm/base.
       *
       *   2xs      11px  micro-meta: ids, timestamps, ledger lines
       *   xs       12px  labels, table cells, helper text
       *   sm       14px  body copy (Tailwind default)
       *   section  15px  card headings
       *   base     16px  modal headings (Tailwind default)
       *   title    24px  page h1
       *   metric   28px  stat-tile figures
       */
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        section: ["0.9375rem", { lineHeight: "1.4rem", letterSpacing: "-0.01em" }],
        title: ["1.5rem", { lineHeight: "1.85rem", letterSpacing: "-0.02em" }],
        metric: ["1.75rem", { lineHeight: "1.9rem", letterSpacing: "-0.025em" }],
      },

      colors: {
        canvas: token("canvas"),
        surface: { DEFAULT: token("surface"), 2: token("surface-2") },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
          // Reaches WCAG 1.4.11 3:1. Use for anything whose border is what
          // tells a user it is interactive; see src/index.css.
          control: token("line-control"),
        },
        ink: {
          DEFAULT: token("ink"),
          muted: token("ink-muted"),
          faint: token("ink-faint"),
          ghost: token("ink-ghost"),
        },
        // The one accent. Near-black in light, near-white in dark.
        brand: {
          DEFAULT: token("brand"),
          hover: token("brand-hover"),
          fg: token("brand-fg"),
          tint: token("brand-tint"),
        },
        // Destructive solid action. Deliberately not the `critical` status
        // tint: a filled button must carry white at AA, which the badge-dot red
        // does not. See the note in src/index.css.
        danger: {
          DEFAULT: token("danger"),
          hover: token("danger-hover"),
          fg: token("danger-fg"),
        },
        // Navigation rail, its own surface family.
        rail: {
          DEFAULT: token("rail"),
          2: token("rail-2"),
          line: token("rail-line"),
          fg: token("rail-fg"),
          muted: token("rail-muted"),
        },
        // Status tones. Never used as decoration - only where a real state is
        // being reported, and always beside a word.
        neutral: {
          bg: token("tone-neutral-bg"),
          fg: token("tone-neutral-fg"),
          line: token("tone-neutral-line"),
          dot: token("tone-neutral-dot"),
        },
        positive: {
          bg: token("tone-positive-bg"),
          fg: token("tone-positive-fg"),
          line: token("tone-positive-line"),
          dot: token("tone-positive-dot"),
        },
        caution: {
          bg: token("tone-caution-bg"),
          fg: token("tone-caution-fg"),
          line: token("tone-caution-line"),
          dot: token("tone-caution-dot"),
        },
        critical: {
          bg: token("tone-critical-bg"),
          fg: token("tone-critical-fg"),
          line: token("tone-critical-line"),
          dot: token("tone-critical-dot"),
        },
        info: {
          bg: token("tone-info-bg"),
          fg: token("tone-info-fg"),
          line: token("tone-info-line"),
          dot: token("tone-info-dot"),
        },
      },

      /**
       * RADIUS SCALE - one documented rule, applied everywhere.
       *
       *   sm   4px   dots, ticks, the selvedge mark
       *   md   6px   badges, chips, small inline controls
       *   lg   8px   buttons, inputs, selects, tabs, list rows
       *   xl  12px   cards, tables, notes, panels
       *   2xl 16px   modals and other overlay surfaces
       *
       * Anything full-round is a circle by nature (avatar, status dot), not a
       * pill button. There are no pill buttons in this app.
       */
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },

      // Tinted to the ground rather than pure black, and scaled in dark mode
      // via --shadow-strength (a light-mode shadow disappears on a dark ground).
      boxShadow: {
        xs: "0 1px 2px rgb(var(--shadow-hue) / calc(0.05 * var(--shadow-strength)))",
        card:
          "0 1px 2px rgb(var(--shadow-hue) / calc(0.04 * var(--shadow-strength)))," +
          " 0 1px 3px rgb(var(--shadow-hue) / calc(0.06 * var(--shadow-strength)))",
        "card-hover":
          "0 2px 6px rgb(var(--shadow-hue) / calc(0.06 * var(--shadow-strength)))," +
          " 0 10px 24px rgb(var(--shadow-hue) / calc(0.10 * var(--shadow-strength)))",
        pop:
          "0 20px 48px rgb(var(--shadow-hue) / calc(0.22 * var(--shadow-strength)))," +
          " 0 6px 12px rgb(var(--shadow-hue) / calc(0.10 * var(--shadow-strength)))",
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
