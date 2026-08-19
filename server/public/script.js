// Rooka Website Interactive Script
document.addEventListener('DOMContentLoaded', () => {
  // 1. FAQ Accordion Toggle
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // Close other open items
        faqItems.forEach(other => other.classList.remove('open'));
        if (!isOpen) {
          item.classList.add('open');
        }
      });
    }
  });

  // 2. Interactive AI Coach Simulator Tabs (with Hyrox / Hybrid Race Prep)
  const simTabBtns = document.querySelectorAll('.sim-tab-btn');
  const userQueryEl = document.getElementById('sim-user-query');
  const coachResponseEl = document.getElementById('sim-coach-response');

  const coachSimData = {
    recovery: {
      question: "My legs feel heavy and my HRV dropped 15ms. Should I still do my 5x1km threshold intervals today?",
      response: "Based on your 15ms HRV drop and yesterday's 90-min tempo run, your recovery readiness is at 62 (Caution). Pushing threshold intervals today will increase fatigue without proportional adaptation. Let's pivot: swap today to a 45-min Zone 1 flush run (Heart Rate < 135 bpm) or 30-min easy spin, and push your 5x1km threshold session to tomorrow."
    },
    hyrox: {
      question: "I'm 6 weeks out from my Hyrox event. How should I balance heavy sled pushes and wall balls with my 10km running intervals without blowing up my legs?",
      response: "To build peak hybrid capacity without overreaching, we'll implement concurrent training separation. Perform your compromised running sessions (e.g. 1km run into 50m Sled Push simulation) on high-readiness days (Rooka Score > 80). Keep your pure heavy strength work 48 hours separated from threshold intervals, and prioritize posterior-chain recovery with targeted carbohydrate timing."
    },
    taper: {
      question: "I have my target 70.3 Ironman in 10 days. How should my PMC fitness vs fatigue balance look?",
      response: "For optimal race-day execution, we want your Training Stress Balance (TSB Form) between +12 and +20 while retaining 92%+ of your Chronic Training Load (CTL Fitness). Starting today, cut total workout volume by 40% but keep race-pace neuromuscular bursts (e.g. 4x30s at 70.3 race watts). This keeps your engine primed while clearing deep systemic fatigue."
    },
    nutrition: {
      question: "What should my fueling strategy be for tomorrow's 140km weekend ride with 1,800m elevation?",
      response: "Target 75g - 90g of carbohydrates per hour (mix of maltodextrin/fructose in a 1:0.8 ratio) paired with 650ml fluid + 700mg sodium per hour. Start sipping carbs from minute 20, don't wait until you're hungry. Take a gel 10 minutes before the two main climbs to ensure steady blood glucose without GI distress."
    },
    fatigue: {
      question: "My quad fatigue is elevated after yesterday's heavy squat session and hill intervals. Can I still do today's tempo run?",
      response: "Your 7-day muscle workload model flags Quadriceps at 75% acute strain with elevated tissue breakdown risk. Let's protect your joints: pivot today to a low-impact Zone 2 spin on the bike (high cadence 90+ RPM) or an upper-body core session. We'll resume tempo running once quad readiness rebounds to green."
    }
  };

  if (simTabBtns.length > 0 && userQueryEl && coachResponseEl) {
    simTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        simTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabKey = btn.dataset.tab;
        const data = coachSimData[tabKey];
        if (data) {
          userQueryEl.style.opacity = '0';
          coachResponseEl.style.opacity = '0';
          setTimeout(() => {
            userQueryEl.textContent = `"${data.question}"`;
            coachResponseEl.textContent = data.response;
            userQueryEl.style.opacity = '1';
            coachResponseEl.style.opacity = '1';
          }, 180);
        }
      });
    });
  }

  // 3. Interactive App Screenshot Showcase / Tour
  const tourTabs = document.querySelectorAll('.tour-tab-btn');
  const tourImage = document.getElementById('tour-screenshot-img');
  const tourTitle = document.getElementById('tour-feature-title');
  const tourDesc = document.getElementById('tour-feature-desc');
  const tourTags = document.getElementById('tour-feature-tags');

  const tourData = {
    chat: {
      src: 'images/screenshot-chat.png',
      alt: 'Rooka 24/7 AI Coach Chat Interface',
      title: '24/7 Conversational AI Coach',
      desc: 'Real-time workout debriefs, physiological insights, weather-informed pacing adjustments, and race-day tactics tuned to your customized coach persona.',
      tags: ['Google Gemini AI', 'Segment PR Analysis', 'Adaptive Weather Shifts', 'Voice & Text Support']
    },
    planning: {
      src: 'images/screenshot-planning.png',
      alt: 'Rooka Adaptive Planning and Periodization',
      title: 'Smart Phase-Based Periodization',
      desc: 'Dynamic 4-phase periodization (Base, Build, Peak, Taper) that automatically adjusts workout density, structured bike/run intervals, and recovery blocks with a single tap.',
      tags: ['One-Tap Adapt', 'Structured Workouts', 'Countdown Milestones', 'Rest Day Calibration']
    },
    progress: {
      src: 'images/screenshot-progress.png',
      alt: 'Rooka Progress, Archetype Radar and PMC Telemetry',
      title: 'Athlete Archetype & PMC Telemetry',
      desc: 'Scientific 5-axis capability radar tracking Endurance, Strength, Explosiveness, Versatility, and Consistency, combined with pro-grade CTL (Fitness), ATL (Fatigue), and TSB (Form) modeling.',
      tags: ['5-Axis Radar Chart', 'Fitness (CTL)', 'Fatigue (ATL)', 'Readiness Score (TSB)']
    },
    nutrition: {
      src: 'images/screenshot-nutrition.png',
      alt: 'Rooka Targeted Macro Fueling and Nutrient Timing',
      title: 'Targeted Macro Fueling & Timing',
      desc: 'Precision intra-workout and daily nutrition tailored directly to workout intensity. Know exactly when and how many carbs, proteins, and electrolytes to consume for optimal glycogen replenishment.',
      tags: ['Pre/Intra/Post Timing', 'Macro Grams Calculator', 'Threshold Fueling', 'Hydration & Electrolytes']
    },
    fatigue: {
      src: 'images/screenshot-fatigue.png',
      alt: 'Rooka 7-Day Muscle Fatigue Model & Injury Prevention',
      title: '7-Day Muscle Fatigue & Health Model',
      desc: 'Granular biomechanical workload modeling across Quads, Calves & Achilles, Hamstrings, Glutes, Core, and Upper Body to flag asymmetrical stress before overtraining occurs.',
      tags: ['Workload Heatmaps', 'Injury Prevention', 'Active Issues Feed', 'Biomechanical Balance']
    },
    profile: {
      src: 'images/screenshot-profile.png',
      alt: 'Rooka Coach Persona and Multi-Language Settings',
      title: 'Personalized Coach Persona & Languages',
      desc: 'Customize your coach style—choose Empathetic & Demanding, Strict Data Nerd, or Enthusiastic Cheerleader. Fully localized in English, Dutch, German, Spanish, and French.',
      tags: ['3 Coach Personas', 'Multi-Language UI', 'Athlete Context Memory', 'AES-256 Encrypted']
    }
  };

  if (tourTabs.length > 0 && tourImage) {
    tourTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tourTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const key = tab.dataset.tour;
        const item = tourData[key];
        if (item) {
          tourImage.style.opacity = '0';
          tourImage.style.transform = 'scale(0.97)';
          if (tourTitle) tourTitle.style.opacity = '0';
          if (tourDesc) tourDesc.style.opacity = '0';
          if (tourTags) tourTags.style.opacity = '0';

          setTimeout(() => {
            tourImage.src = item.src;
            tourImage.alt = item.alt;
            if (tourTitle) tourTitle.textContent = item.title;
            if (tourDesc) tourDesc.textContent = item.desc;
            if (tourTags) {
              tourTags.innerHTML = item.tags.map(t => `<span class="tour-badge">${t}</span>`).join('');
            }

            tourImage.style.opacity = '1';
            tourImage.style.transform = 'scale(1)';
            if (tourTitle) tourTitle.style.opacity = '1';
            if (tourDesc) tourDesc.style.opacity = '1';
            if (tourTags) tourTags.style.opacity = '1';
          }, 180);
        }
      });
    });
  }

  // 4. Hero Quick Screenshot Switcher
  const heroPills = document.querySelectorAll('.hero-screen-pill');
  const heroPhoneImg = document.getElementById('hero-mockup-img');
  if (heroPills.length > 0 && heroPhoneImg) {
    heroPills.forEach(pill => {
      pill.addEventListener('click', () => {
        heroPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const screenSrc = pill.dataset.screen;
        if (screenSrc) {
          heroPhoneImg.style.opacity = '0';
          setTimeout(() => {
            heroPhoneImg.src = screenSrc;
            heroPhoneImg.style.opacity = '1';
          }, 150);
        }
      });
    });
  }

  // 5. Mobile Menu Toggle
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navMenu = document.querySelector('.nav-menu');
  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      const isVisible = navMenu.style.display === 'flex';
      if (isVisible) {
        navMenu.style.display = 'none';
      } else {
        navMenu.style.display = 'flex';
        navMenu.style.flexDirection = 'column';
        navMenu.style.position = 'absolute';
        navMenu.style.top = '80px';
        navMenu.style.left = '0';
        navMenu.style.width = '100%';
        navMenu.style.background = 'rgba(8, 12, 20, 0.98)';
        navMenu.style.padding = '24px';
        navMenu.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      }
    });
  }

  // 6. Smooth scrolling for internal anchors
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (window.innerWidth <= 768 && navMenu) {
            navMenu.style.display = 'none';
          }
        }
      }
    });
  });

  // 7. Early access / TestFlight form handler with email dispatch to rutgervandenberg@live.nl
  const betaForm = document.getElementById('beta-signup-form');
  const betaSuccessMsg = document.getElementById('beta-success-msg');
  if (betaForm) {
    betaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = betaForm.querySelector('input[type="email"]');
      const submitBtn = betaForm.querySelector('button[type="submit"]');
      
      if (emailInput && emailInput.value) {
        const email = emailInput.value.trim();

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Sending...';
        }

        // 1. Dispatch email notification to rutgervandenberg@live.nl via FormSubmit AJAX API
        const emailPromise = fetch('https://formsubmit.co/ajax/rutgervandenberg@live.nl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            _subject: `New Rooka TestFlight Beta Invite Request: ${email}`,
            _template: 'table',
            _captcha: 'false',
            applicant_email: email,
            source: 'rooka.io landing page',
            submitted_at: new Date().toLocaleString()
          })
        }).catch(err => console.warn('FormSubmit notification error:', err));

        // 2. Also record in local waitlist DB if backend server is online
        const serverPromise = fetch('/api/auth/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, notes: 'Website TestFlight Request' })
        }).catch(err => console.warn('Local waitlist error:', err));

        // Display instant clean confirmation
        Promise.allSettled([emailPromise, serverPromise]).then(() => {
          betaForm.style.display = 'none';
          if (betaSuccessMsg) {
            betaSuccessMsg.innerHTML = `✓ Request received for <strong style="color: white;">${email}</strong>! We've dispatched an email notification to <strong>rutgervandenberg@live.nl</strong> and you'll receive your TestFlight invitation shortly.`;
            betaSuccessMsg.style.display = 'block';
          }
        });
      }
    });
  }
});
