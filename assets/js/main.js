/* ==========================================================================
   Site behaviour: mobile menu, header border, current-section highlight,
   the cycling greeting, the sliding elephant, BibTeX copy buttons, London
   time and the footer year. The site works without it.
   ========================================================================== */
(function () {
  'use strict';

  // Footer year
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Greeting: "Hi," / "Ciao," / "Hola," each in its own colour.
  // The hero mesh (mesh.js) glows in the colour currently shown.
  const GREETINGS = [
    { word: 'Hi,',   color: '#7a96ff' },
    { word: 'Ciao,', color: '#5fd39a' },
    { word: 'Hola,', color: '#f2c46b' },
  ];
  const greet = document.querySelector('.greet');
  const greetWord = greet && greet.querySelector('.greet-word');
  if (greetWord && !reduceMotion) {
    let i = 0;
    const show = (g) => {
      greetWord.textContent = g.word;
      greet.style.width = greetWord.getBoundingClientRect().width + 'px';
      document.documentElement.style.setProperty('--greet', g.color);
      window.dispatchEvent(new CustomEvent('greetcolor', { detail: g.color }));
    };
    greet.style.width = greetWord.getBoundingClientRect().width + 'px';
    setInterval(() => {
      i = (i + 1) % GREETINGS.length;
      greetWord.classList.add('is-out');
      setTimeout(() => { show(GREETINGS[i]); greetWord.classList.remove('is-out'); }, 300);
    }, 2800);
    // Keep the width right if the window is resized
    window.addEventListener('resize', () => { greet.style.width = greetWord.getBoundingClientRect().width + 'px'; });
  }

  // The elephant on a frictionless incline (Contact section).
  // On the slope it accelerates at a constant rate; on the flat ground nothing
  // slows it down, so it keeps its speed and slides out of the picture.
  const slider = document.getElementById('slider');
  const replay = document.querySelector('.slide-replay');
  if (slider && !reduceMotion && 'IntersectionObserver' in window) {
    const TOP = [16, 50], BOTTOM = [250, 190];          // ends of the slope (SVG units)
    const dx = BOTTOM[0] - TOP[0], dy = BOTTOM[1] - TOP[1];
    const L = Math.hypot(dx, dy), THETA = Math.atan2(dy, dx);
    const S0 = 26, LIFT = 20;                           // start position, half-height of the elephant
    const T_SLOPE = 1.1;                                // seconds to reach the bottom
    const A = (2 * (L - S0)) / (T_SLOPE * T_SLOPE);    // a = g sin θ, scaled to the drawing
    const V = A * T_SLOPE;                              // speed at the bottom of the slope
    const EXIT = 360 + 60 - BOTTOM[0];                  // distance to slide off the right edge
    const BLEND = 18;                                   // ground distance over which it levels out

    const place = (cx, cy, angle) => {
      // Centre = contact point + LIFT along the surface normal for the current tilt
      const x = cx + LIFT * Math.sin(angle), y = cy - LIFT * Math.cos(angle);
      slider.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(angle * 180 / Math.PI).toFixed(2)})`);
    };

    const run = () => {
      if (replay) replay.hidden = true;
      const start = performance.now();
      const step = (now) => {
        const t = (now - start) / 1000;
        if (t < T_SLOPE) {
          const s = S0 + 0.5 * A * t * t;
          place(TOP[0] + (s / L) * dx, TOP[1] + (s / L) * dy, THETA);
        } else {
          const u = V * (t - T_SLOPE);
          if (u > EXIT) { if (replay) replay.hidden = false; return; }
          place(BOTTOM[0] + u, BOTTOM[1], THETA * Math.max(0, 1 - u / BLEND));
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(run, 400); }
    }, { threshold: 0.6 });
    io.observe(slider.ownerSVGElement);
    if (replay) replay.addEventListener('click', run);
  }

  // Live local time in London (Contact section)
  const londonTime = document.getElementById('london-time');
  if (londonTime) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const tick = () => {
      const now = new Date();
      londonTime.textContent = fmt.format(now);
      londonTime.dateTime = now.toISOString();
    };
    tick();
    setInterval(tick, 15000);
    londonTime.closest('.local-time').hidden = false;
  }

  // Mobile menu
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('site-menu');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 640px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  // Hairline under the header once the page is scrolled
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Highlight the nav link of the section in the middle of the screen
  const links = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  if (links.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => {
          if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => observer.observe(s));
  }

  // "Copy" buttons inside BibTeX boxes
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.parentElement.querySelector('pre');
      if (!code) return;
      const text = code.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        // Fallback for pages opened from file:// or older browsers
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
      }
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  });
})();
