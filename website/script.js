// rooka.io site script: theme toggle, mobile menu, beta and support forms.
(function () {
  const root = document.documentElement;
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // --- Theme: follows the system until the visitor picks one ---
  const themeBtn = document.getElementById('theme-toggle');
  const activeTheme = () => root.getAttribute('data-theme') || (darkQuery && darkQuery.matches ? 'dark' : 'light');
  const syncThemeButton = () => {
    if (!themeBtn) return;
    const dark = activeTheme() === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  syncThemeButton();
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = activeTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('rooka-theme', next); } catch (e) { }
      syncThemeButton();
    });
  }
  if (darkQuery && darkQuery.addEventListener) {
    darkQuery.addEventListener('change', (e) => {
      let saved = null;
      try { saved = localStorage.getItem('rooka-theme'); } catch (err) { }
      if (!saved) {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        syncThemeButton();
      }
    });
  }

  // --- Mobile menu ---
  const menuBtn = document.querySelector('.menu-btn');
  const navLinks = document.getElementById('nav-links');
  if (menuBtn && navLinks) {
    const setOpen = (open) => {
      navLinks.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    menuBtn.addEventListener('click', () => setOpen(!navLinks.classList.contains('open')));
    navLinks.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // --- Beta invite form: emails rutger@rooka.io and records the request in /api/auth/waitlist ---
  const betaForm = document.getElementById('beta-form');
  if (betaForm) {
    const label = document.getElementById('beta-email-label');
    const hint = document.getElementById('beta-email-hint');
    const status = document.getElementById('beta-status');
    const copy = {
      ios: { label: 'Apple ID email', hint: 'Use the address you sign in to the App Store with. TestFlight sends the invite there.' },
      android: { label: 'Google account email', hint: 'Use the Google account on your phone. Play Store testing only works for that account.' },
    };
    const platform = () => (betaForm.querySelector('input[name="platform"]:checked') || {}).value || 'ios';
    betaForm.addEventListener('change', (e) => {
      if (e.target.name !== 'platform') return;
      label.textContent = copy[platform()].label;
      hint.textContent = copy[platform()].hint;
    });

    betaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = betaForm.querySelector('input[name="email"]');
      const email = emailInput.value.trim();
      status.className = 'form-status';
      if (!validEmail(email)) {
        status.classList.add('err');
        status.textContent = 'Enter a full email address, like name@example.com.';
        emailInput.focus();
        return;
      }
      const os = platform() === 'android' ? 'Android' : 'iPhone';
      const btn = betaForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      const mail = fetch('https://formsubmit.co/ajax/rutger@rooka.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          platform: os,
          _subject: `[rooka beta] ${os} invite request: ${email}`,
          _replyto: email,
          _template: 'table',
          _captcha: 'false',
          source: 'rooka.io beta form',
        }),
      }).then((r) => r.ok);
      const waitlist = fetch('/api/auth/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, notes: `Web beta signup (${os})` }),
      }).then((r) => r.ok);

      Promise.allSettled([mail, waitlist]).then((results) => {
        const sent = results.some((r) => r.status === 'fulfilled' && r.value);
        if (sent) {
          betaForm.querySelectorAll('.field').forEach((el) => { el.hidden = true; });
          btn.hidden = true;
          status.classList.add('ok');
          status.textContent = os === 'Android'
            ? `Request sent. We’ll email a Google Play testing link to ${email}.`
            : `Request sent. Your TestFlight invite will go to ${email}.`;
        } else {
          btn.disabled = false;
          btn.textContent = 'Request an invite';
          status.classList.add('err');
          status.innerHTML = 'The request didn’t go through. Try again, or email <a href="mailto:support@rooka.io">support@rooka.io</a>.';
        }
      });
    });
  }

  // --- Support form ---
  const supportForm = document.getElementById('support-form');
  if (supportForm) {
    const status = document.getElementById('support-status');
    supportForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(supportForm).entries());
      status.className = 'form-status';
      if (!validEmail((data.email || '').trim()) || !(data.message || '').trim()) {
        status.classList.add('err');
        status.textContent = 'Add your email address and a message so we can reply.';
        return;
      }
      const btn = supportForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      fetch('https://formsubmit.co/ajax/rutger@rooka.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: data.name || '',
          email: data.email.trim(),
          topic: data.topic,
          message: data.message.trim(),
          _subject: `[rooka support] ${data.topic}: ${data.name || data.email}`,
          _replyto: data.email.trim(),
          _template: 'table',
          _captcha: 'false',
          source: 'rooka.io support page',
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        supportForm.querySelectorAll('.field, .two, button').forEach((el) => { el.hidden = true; });
        status.classList.add('ok');
        status.textContent = 'Message sent. We’ll reply by email.';
      }).catch(() => {
        btn.disabled = false;
        btn.textContent = 'Send message';
        status.classList.add('err');
        status.innerHTML = 'Your message didn’t send. Try again, or email <a href="mailto:support@rooka.io">support@rooka.io</a> directly.';
      });
    });
  }
})();
