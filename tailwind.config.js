/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./src/app/**/*.{js,jsx,ts,tsx}", "./src/components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--bg-main)',
          card: 'var(--bg-card)',
          border: 'var(--border-color)',
          text: 'var(--text-main)',
          muted: 'var(--text-muted)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
          'accent-soft': 'var(--accent-soft)',
          'accent-border': 'var(--accent-border)'
        },
        focus: 'var(--color-focus)',
        metric: 'var(--color-metric)',
      }
    },
  },
  plugins: [],
}
