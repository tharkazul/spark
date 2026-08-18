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

  // 2. Interactive AI Coach Simulator Tabs
  const simTabBtns = document.querySelectorAll('.sim-tab-btn');
  const userQueryEl = document.getElementById('sim-user-query');
  const coachResponseEl = document.getElementById('sim-coach-response');

  const coachSimData = {
    recovery: {
      question: "My legs feel heavy and my HRV dropped 15ms. Should I still do my 5x1km threshold intervals today?",
      response: "Based on your 15ms HRV drop and yesterday's 90-min tempo run, your recovery readiness is at 62 (Caution). Pushing threshold intervals today will increase fatigue without proportional adaptation. Let's pivot: swap today to a 45-min Zone 1 flush run (Heart Rate < 135 bpm) or 30-min easy spin, and push your 5x1km threshold session to tomorrow."
    },
    taper: {
      question: "I have my target 70.3 Ironman in 10 days. How should my PMC fitness vs fatigue balance look?",
      response: "For optimal race-day execution, we want your Training Stress Balance (TSB Form) between +12 and +20 while retaining 92%+ of your Chronic Training Load (CTL Fitness). Starting today, cut total workout volume by 40% but keep race-pace neuromuscular bursts (e.g. 4x30s at 70.3 race watts). This keeps your engine primed while clearing deep systemic fatigue."
    },
    nutrition: {
      question: "What should my fueling strategy be for tomorrow's 140km weekend ride with 1,800m elevation?",
      response: "Target 75g - 90g of carbohydrates per hour (mix of maltodextrin/fructose in a 1:0.8 ratio) paired with 650ml fluid + 700mg sodium per hour. Start sipping carbs from minute 20, don't wait until you're hungry. Take a gel 10 minutes before the two main climbs to ensure steady blood glucose without GI distress."
    },
    physique: {
      question: "Can you analyze my 4-week physique check-ins? I'm down 1.8kg while maintaining 450 TSS/week.",
      response: "Great trend! Your waist-to-chest delta shows lean abdominal reduction while your 5-min and 20-min power numbers remained constant. This confirms you are dropping visceral and subcutaneous body fat without sacrificing lean muscle or mitochondrial density. Continue holding your current 300 kcal moderate deficit."
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

  // 3. Mobile Menu Toggle
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

  // 4. Smooth scrolling for internal anchors
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

  // 5. Early access / TestFlight form handler
  const betaForm = document.getElementById('beta-signup-form');
  const betaSuccessMsg = document.getElementById('beta-success-msg');
  if (betaForm && betaSuccessMsg) {
    betaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = betaForm.querySelector('input[type="email"]');
      if (emailInput && emailInput.value) {
        betaForm.style.display = 'none';
        betaSuccessMsg.style.display = 'block';
      }
    });
  }
});
