# rooka Promotional Website & Legal Hub (rooka.io)

This directory contains the standalone production website for **rooka** (`rooka.io`), including the modern promotional landing page, App Store/TestFlight compliant **Privacy Policy**, **Terms of Service (EULA)**, and **Support Help Center**.

---

## 📁 Website Structure

```
website/
├── index.html       # Landing page: season planning, Adapt, features, coaches, pricing, beta signup, FAQ
├── privacy.html     # Privacy policy (App Store / Play Store privacy URL)
├── terms.html       # Terms of service & EULA
├── support.html     # Support page with contact form (support URL)
├── style.css        # Shared styles; colour tokens mirror the app (src/global.css), light + dark
├── script.js        # Theme toggle, mobile menu, beta invite + support forms
├── images/app/      # Current app screenshots and coach avatars used by the site
└── README.md        # This file
```

Keep facts on the site in line with the app: prices come from `src/locales/en.ts` (onboarding paywall),
rooka+ gating from `src/utils/permissions.ts`, coach names from `coachPersona` in the locale files.
The season chart on the homepage is an example season computed with the app's PMC model (`src/domain/pmc.ts`).
After editing, copy the changed files to `server/public/` as well.

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

## 📱 App Store Connect & TestFlight URLs

When filling out App Store Connect or TestFlight metadata:
- **Privacy Policy URL:** `https://rooka.io/privacy.html` (or `https://rooka.io/privacy`)
- **Marketing / Promotional URL:** `https://rooka.io`
- **Support URL:** `https://rooka.io/support.html` (or `https://rooka.io/support`)
- **Terms of Service URL:** `https://rooka.io/terms.html` (or `https://rooka.io/terms`)
