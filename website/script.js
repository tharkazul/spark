// rooka.io site script: theme toggle, mobile menu, newsletter and support forms.
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

  // --- Newsletter form: emails rutger@rooka.io and records the address in /api/auth/waitlist ---
  const newsForm = document.getElementById('news-form');
  if (newsForm) {
    const status = document.getElementById('news-status');
    newsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = newsForm.querySelector('input[name="email"]');
      const email = emailInput.value.trim();
      status.className = 'form-status';
      if (!validEmail(email)) {
        status.classList.add('err');
        status.textContent = 'Enter a full email address, like name@example.com.';
        emailInput.focus();
        return;
      }
      const btn = newsForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      const mail = fetch('https://formsubmit.co/ajax/rutger@rooka.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          _subject: `[rooka news] signup: ${email}`,
          _replyto: email,
          _template: 'table',
          _captcha: 'false',
          source: 'rooka.io newsletter form',
        }),
      }).then((r) => r.ok);
      const waitlist = fetch('/api/auth/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, notes: 'Web newsletter signup' }),
      }).then((r) => r.ok);

      Promise.allSettled([mail, waitlist]).then((results) => {
        const sent = results.some((r) => r.status === 'fulfilled' && r.value);
        if (sent) {
          newsForm.querySelectorAll('.field').forEach((el) => { el.hidden = true; });
          btn.hidden = true;
          status.classList.add('ok');
          status.textContent = `Thanks! We’ll send rooka news to ${email}.`;
        } else {
          btn.disabled = false;
          btn.textContent = 'Keep me posted';
          status.classList.add('err');
          status.innerHTML = 'That didn’t go through. Try again, or email <a href="mailto:support@rooka.io">support@rooka.io</a>.';
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
