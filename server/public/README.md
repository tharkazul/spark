# Rooka Promotional Website & Legal Hub (rooka.io)

This directory contains the standalone production website for **Rooka** (`rooka.io`), including the modern promotional landing page, App Store/TestFlight compliant **Privacy Policy**, **Terms of Service (EULA)**, and **Support Help Center**.

---

## 📁 Website Structure

```
website/
├── index.html       # Main high-converting promotional landing page with live interactive phone preview & AI Coach simulator
├── privacy.html     # Comprehensive GDPR & Apple App Store / TestFlight compliant Privacy Policy
├── terms.html       # Terms of Service & End User License Agreement (EULA)
├── support.html     # Athlete Help Center & Support contact page
├── style.css        # Modern dark-mode athletic styling with glassmorphism & responsive typography
├── script.js        # Interactive AI simulator, FAQ accordion, and navigation script
└── README.md        # Deployment instructions
```

---

## 🚀 Quick Deployment Options for `rooka.io`

### Option 1: Cloudflare Pages (Recommended - Fastest & Free SSL)
1. Log into your Cloudflare Dashboard for domain `rooka.io`.
2. Go to **Workers & Pages** -> **Create Application** -> **Pages** -> **Upload assets**.
3. Drag & drop the contents of the `website/` folder.
4. Assign custom domain `rooka.io` and `www.rooka.io`.

### Option 2: Vercel (1-Click Deployment)
1. Run `npx vercel` inside this `website` directory.
2. Link your custom domain `rooka.io` in the Vercel project settings.

### Option 3: Netlify
1. Drag and drop the `website` directory into [app.netlify.com/drop](https://app.netlify.com/drop).
2. Set custom domain to `rooka.io`.

### Option 4: Direct Node.js / Express Server Hosting
The pages in this folder have also been mirrored to `server/public/`. When your Node.js backend is running on `server.js`, visiting your root domain will serve `index.html`, `/privacy.html`, `/terms.html`, and `/support.html` automatically!

---

## 🔐 Admin Dashboard (`/admin.html`)

`admin.html` + `admin.js` are the admin-only dashboard (user management and
discount codes). It is not part of the promotional site and is served by the
Node backend, gated by `/api/admin/*` which requires an admin account.

### Styling

The page uses **pre-compiled Tailwind** in `admin.css`, not `cdn.tailwindcss.com`
— the CDN build is an in-browser compiler that logs *"should not be used in
production"* on every load. After adding or changing utility classes in
`admin.html` or `admin.js`, regenerate it:

```bash
npx tailwindcss -c server/tailwind.admin.config.js -i server/tailwind.admin.input.css -o server/public/admin.css --minify
```

Two caveats:

- The config lists `admin.html` and `admin.js` **explicitly**. An
  `admin.{html,js}` brace glob silently matches only the HTML, which drops every
  class used solely from JS (`line-through` on the struck-through original
  prices, the Strava/Garmin badge colours) — the stylesheet then looks complete
  but is not.
- Classes assembled at runtime must appear as complete literal strings in those
  files, or Tailwind's scanner will not emit them.

### Cache busting

`rooka.io` is served through a Cloudflare tunnel, which caches `.js`/`.css` more
aggressively than `.html`. That can pair a fresh `admin.html` with a stale
`admin.js` — the new sections then render but never populate. Both tags carry a
`?v=` query; **bump it whenever you change those files**.

---

## 📱 App Store Connect & TestFlight URLs

When filling out App Store Connect or TestFlight metadata:
- **Privacy Policy URL:** `https://rooka.io/privacy.html` (or `https://rooka.io/privacy`)
- **Marketing / Promotional URL:** `https://rooka.io`
- **Support URL:** `https://rooka.io/support.html` (or `https://rooka.io/support`)
- **Terms of Service URL:** `https://rooka.io/terms.html` (or `https://rooka.io/terms`)
