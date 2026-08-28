/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./src/app/**/*.{js,jsx,ts,tsx}", "./src/components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Required for the in-app Dark Mode switch (Profile > Preferences).
  // Without this Tailwind defaults to `darkMode: 'media'`, the `.dark {}` block
  // in global.css never activates, and NativeWind's toggleColorScheme() has no
  // visible effect — the switch flips back and the theme never changes.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['PlusJakartaSans_500Medium', 'PlusJakartaSans-Medium', 'sans-serif'],
        jakarta: ['PlusJakartaSans_500Medium', 'PlusJakartaSans-Medium', 'sans-serif'],
        'jakarta-regular': ['PlusJakartaSans_400Regular', 'PlusJakartaSans-Regular', 'sans-serif'],
        'jakarta-medium': ['PlusJakartaSans_500Medium', 'PlusJakartaSans-Medium', 'sans-serif'],
        'jakarta-semibold': ['PlusJakartaSans_600SemiBold', 'PlusJakartaSans-SemiBold', 'sans-serif'],
        'jakarta-bold': ['PlusJakartaSans_700Bold', 'PlusJakartaSans-Bold', 'sans-serif'],
        'jakarta-extrabold': ['PlusJakartaSans_800ExtraBold', 'PlusJakartaSans-ExtraBold', 'sans-serif'],
        rajdhani: ['Rajdhani_700Bold', 'Rajdhani-Bold', 'sans-serif'],
        'rajdhani-medium': ['Rajdhani_500Medium', 'Rajdhani-Medium', 'sans-serif'],
        'rajdhani-semibold': ['Rajdhani_600SemiBold', 'Rajdhani-SemiBold', 'sans-serif'],
        'rajdhani-bold': ['Rajdhani_700Bold', 'Rajdhani-Bold', 'sans-serif'],
        numeric: ['Rajdhani_700Bold', 'Rajdhani-Bold', 'sans-serif'],
        mono: ['Rajdhani_700Bold', 'Rajdhani-Bold', 'monospace'],
        barlow: ['Rajdhani_700Bold', 'Rajdhani-Bold', 'sans-serif'],
      },
      // A real type ramp. Before this the app used Tailwind's defaults but only
      // ever reached for the bottom of them: 538 strings sat between 8 and 12px
      // against 48 at 18px or above, so nothing led and nothing receded. The
      // steps below are deliberately far apart — label / secondary / body /
      // title / headline — so hierarchy is visible rather than implied.
      fontSize: {
        xs:     ['11px', { lineHeight: '15px' }],  // labels, captions, units
        sm:     ['13px', { lineHeight: '18px' }],  // secondary body
        base:   ['15px', { lineHeight: '22px' }],  // body
        lg:     ['20px', { lineHeight: '26px' }],  // card + section titles
        xl:     ['24px', { lineHeight: '30px' }],
        '2xl':  ['28px', { lineHeight: '32px' }],  // headline metrics
        '3xl':  ['34px', { lineHeight: '38px' }],
        '4xl':  ['40px', { lineHeight: '44px' }],
      },
      // Card corners used to be whatever the file reached for: the `Card`
      // primitive said 24px while ~15 hand-rolled surfaces said 16px, 20 said
      // 8px, and two said 26px -- so a card corner depended on which file you
      // opened. These three are the whole vocabulary now. Roles, not sizes, so
      // the value can move without a find-and-replace:
      //   card    -- a top-level surface, full width, sits on the canvas
      //   tile    -- a grid tile, chat card, or anything nested inside a card
      //   control -- input, button, chip, segmented-control track
      // Pills and avatars keep `rounded-full`; those aren't corners.
      borderRadius: {
        card: '24px',
        tile: '16px',
        control: '12px',
      },
      colors: {
        // The brand orange, and the only oranges. There were 8 near-identical
        // values in circulation (#FF5733 #FF5A1F #FF6B35 #FF6F3B #FF8554
        // #FF2B00 #E63900 + this one) because each surface picked its own --
        // the marketing site even declared #FF5733 as "Volt Coral" while the
        // app declared #FF5F3B under the same name. Third-party brand colors
        // (Strava #FC4C02, Garmin #007CC3, Apple #FF2D55) are deliberately NOT
        // in this scale; they belong to someone else and must not be unified.
        brand: {
          DEFAULT: '#FF5F3B',  // canonical accent, light mode
          dark: '#FF6B45',     // accent on dark canvas (was also #FF6B35)
          deep: '#E8481F',     // pressed / deepest stop (was also #FF2B00, #E63900)
          light: '#FF9E66',    // tint, gradient head
          ink: '#1B1B1F',
          accent: 'rgb(var(--accent) / <alpha-value>)',
        },
        neutral: {
          50: '#F7F7F9',
          100: '#EAEAED',
          200: '#DEDEE3',
          400: '#B4B4BD',
          600: '#6F6F79',
          800: '#3A3A40',
        },
        dark: {
          canvas: '#17171A',
          card: '#212226',
          border: '#2D2E33',
          text: '#F5F5F7',
          muted: '#9A9AA2',
        },
        semantic: {
          success: 'var(--color-success)',
          'success-bg': 'var(--color-success-bg)',
          'success-text': 'var(--color-success-text)',
          warning: 'var(--color-warning)',
          'warning-bg': 'var(--color-warning-bg)',
          'warning-text': 'var(--color-warning-text)',
          error: 'var(--color-error)',
          'error-bg': 'var(--color-error-bg)',
          'error-text': 'var(--color-error-text)',
          info: 'var(--color-info)',
          'info-bg': 'var(--color-info-bg)',
          'info-text': 'var(--color-info-text)',
        },
        sport: {
          swim: 'var(--sport-swim)',
          ride: 'var(--sport-ride)',
          run: 'var(--sport-run)',
          cardio: 'var(--sport-cardio)',
          strength: 'var(--sport-strength)',
          yoga: 'var(--sport-yoga)',
          walk: 'var(--sport-walk)',
        },
        // Channel triplets + <alpha-value> so opacity modifiers work. With a
        // plain `var(--x)` holding a hex, Tailwind silently emits NO rule for
        // `bg-theme-accent/20` -- 223 such classes across 50 files were dead,
        // which is why translucent accent surfaces never appeared and
        // `border-theme-border/50` fell back to React Native's default black.
        theme: {
          bg: 'rgb(var(--bg-main) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          border: 'rgb(var(--border-color) / <alpha-value>)',
          text: 'rgb(var(--text-main) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          accent: 'rgb(var(--accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--accent-hover) / <alpha-value>)',
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
