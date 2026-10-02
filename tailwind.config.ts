import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Body stays Plus Jakarta Sans: p5 calls for Coolvetica, but no
        // webfont file exists in public/fonts/ (checked before this
        // change) -- see docs note in README/PR description.
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        rating: {
          DEFAULT: "hsl(var(--rating))",
          foreground: "hsl(var(--rating-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Pre-rebrand tokens -- kept only because a couple of existing
        // components still reference them (bg-brand-navy in Footer.tsx/
        // TopBar.tsx/PartnerCTA.tsx, to-sienna-dark in AgencyLanding.tsx)
        // and those files are out of scope here; re-pointed to the
        // closest new-palette equivalent so they render brand-consistent
        // instead of the old amber/navy hues.
        sienna: {
          DEFAULT: "hsl(var(--primary))",
          light: "hsl(212 55% 60%)",
          dark: "hsl(212 60% 22%)",
        },
        cream: "hsl(var(--secondary))",
        brand: {
          // p2 — the eight brand colours (also exposed as CSS vars in
          // index.css, e.g. for the texture/gradient utilities).
          "summit-blue": "hsl(var(--brand-summit-blue))",
          "glacier-mist": "hsl(var(--brand-glacier-mist))",
          "rhododendron-red": "hsl(var(--brand-rhododendron-red))",
          "dawn-blush": "hsl(var(--brand-dawn-blush))",
          "monks-robe": "hsl(var(--brand-monks-robe))",
          "lokta-peach": "hsl(var(--brand-lokta-peach))",
          "terai-forest": "hsl(var(--brand-terai-forest))",
          "sage-blush": "hsl(var(--brand-sage-blush))",
          amber: {
            DEFAULT: "hsl(var(--brand-monks-robe))",
            light: "hsl(23 91% 66%)",
            dark: "hsl(23 91% 40%)",
          },
          navy: {
            DEFAULT: "hsl(var(--sidebar-background))",
            light: "hsl(212 50% 28%)",
            dark: "hsl(212 60% 14%)",
          },
          blue: {
            DEFAULT: "hsl(var(--brand-summit-blue))",
            light: "hsl(212 55% 60%)",
            dark: "hsl(212 60% 30%)",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'glow': 'var(--shadow-glow)',
        'card': 'var(--shadow-sm)',
      },
      backgroundImage: {
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-card': 'var(--gradient-card)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-glass': 'var(--gradient-glass)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
