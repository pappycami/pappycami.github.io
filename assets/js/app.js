/* ============================================================
   Aina Pappy — Portfolio one-page
   app.js : composants Alpine.js (thème, parallaxe, machine à
   écrire, compteurs, reveal au scroll, scrollspy)
   ============================================================ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Machine à écrire (clin d'œil à atx-typing-machine) ---------- */
  /* Vérifie qu'Alpine est bien chargé avant d'enregistrer les composants */
  document.addEventListener('alpine:init', () => {
    Alpine.data('typewriter', (words, typeMs = 78, eraseMs = 38, holdMs = 2100) => ({
      display: '',
      index: 0,
      deleting: false,

      init() {
        if (REDUCED || !Array.isArray(words) || !words.length) {
          this.display = Array.isArray(words) ? words[0] : '';
          return;
        }
        this.step();
      },

      step() {
        const word = words[this.index];

        if (!this.deleting) {
          this.display = word.slice(0, this.display.length + 1);
          if (this.display === word) {
            setTimeout(() => { this.deleting = true; this.step(); }, holdMs);
            return;
          }
          setTimeout(() => this.step(), typeMs);
        } else {
          this.display = word.slice(0, this.display.length - 1);
          if (!this.display) {
            this.deleting = false;
            this.index = (this.index + 1) % words.length;
            setTimeout(() => this.step(), 380);
            return;
          }
          setTimeout(() => this.step(), eraseMs);
        }
      },
    }));

    /* ---------- Compteur animé (statistiques) ---------- */
    Alpine.data('counter', (target, suffix = '') => ({
      value: '0' + suffix,

      init() {
        if (REDUCED || !('IntersectionObserver' in window)) {
          this.value = String(target) + suffix;
          return;
        }
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              io.disconnect();
              this.animate();
            }
          });
        }, { threshold: 0.4 });
        io.observe(this.$el);
      },

      animate() {
        const duration = 1500;
        const start = performance.now();
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);

        const frame = (now) => {
          const p = Math.min((now - start) / duration, 1);
          this.value = String(Math.round(easeOut(p) * target)) + suffix;
          if (p < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
    }));

    /* ---------- Composant racine de la page ---------- */
    Alpine.data('portfolio', () => ({
      theme: 'dark',
      mobileOpen: false,
      scrolled: false,
      progress: 0,
      active: 'accueil',

      /* État parallaxe */
      mx: 0,          /* souris : -0.5 → 0.5 */
      my: 0,
      heroY: 0,       /* scroll tant que le hero est visible */
      vh: window.innerHeight,
      ticking: false,
      parallaxEls: [], /* couches [data-parallax] des sections */

      init() {
        this.syncTheme();
        this.initParallax();
        window.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
        window.addEventListener('resize', () => {
          this.vh = window.innerHeight;
          this.measureParallax();
        });
        /* Re-mesure après le chargement complet (polices, images) */
        window.addEventListener('load', () => this.measureParallax());
        setTimeout(() => this.measureParallax(), 1200);
        this.onScroll();
        this.initReveal();
        this.initSpy();
      },

      /* ----- Thème sombre / clair (persisté, comme ainatrix) ----- */
      syncTheme() {
        let saved = null;
        try { saved = localStorage.getItem('ap-theme'); } catch (e) { /* stockage indisponible */ }
        this.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        if (saved && saved !== this.theme) this.applyTheme(saved);
      },

      applyTheme(theme) {
        this.theme = theme;
        document.documentElement.classList.toggle('dark', theme === 'dark');
        try { localStorage.setItem('ap-theme', theme); } catch (e) { /* stockage indisponible */ }
      },

      toggleTheme() {
        this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
      },

      /* ----- Scroll : barre de progression + navbar + parallaxe hero ----- */
      onScroll() {
        if (this.ticking) return;
        this.ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          this.scrolled = y > 24;

          const max = document.documentElement.scrollHeight - window.innerHeight;
          this.progress = max > 0 ? (y / max) * 100 : 0;

          this.heroY = Math.min(y, this.vh * 1.2);
          this.updateParallax();
          this.ticking = false;
        });
      },

      /* ----- Souris : parallaxe des orbes du hero ----- */
      onHeroMouse(event) {
        if (REDUCED) return;
        this.mx = event.clientX / window.innerWidth - 0.5;
        this.my = event.clientY / window.innerHeight - 0.5;
      },

      /* Styles réactifs des 3 couches d'orbes (profondeur différente) */
      orbStyle(depth, scrollFactor) {
        const x = this.mx * depth;
        const y = this.my * depth * 0.7 + this.heroY * scrollFactor;
        return `transform: translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      },

      heroStyle() {
        const shift = this.heroY * 0.28;
        const opacity = Math.max(0, 1 - this.heroY / (this.vh * 0.85));
        return `transform: translate3d(0, ${shift.toFixed(1)}px, 0); opacity: ${opacity.toFixed(3)}`;
      },

      /* ----- Parallaxe des sections : couches [data-parallax] -----
         Chaque couche reçoit un facteur de vitesse ; plus il est élevé,
         plus la couche se déplace (en sens inverse du scroll) par rapport
         au reste de la section. Vitesse négative = même sens. */
      initParallax() {
        if (REDUCED) return;
        this.parallaxEls = Array.from(document.querySelectorAll('[data-parallax]')).map((el) => ({
          el,
          speed: parseFloat(el.dataset.parallax) || 0.2,
          offset: null, /* écart initial au centre de l'ancêtre positionné */
          center: 0,    /* position verticale absolue du centre de la couche */
        }));
        this.measureParallax();
      },

      /* Mesure sans boucle de rétroaction : chaque couche est ancrée à son
         ancêtre positionné (la section, jamais transformée) et non à
         elle-même — sinon son propre transform fausserait la mesure. */
      measureParallax() {
        for (const p of this.parallaxEls) {
          const anchor = p.el.offsetParent || p.el.parentElement;
          if (!anchor) continue;
          const ar = anchor.getBoundingClientRect();
          const er = p.el.getBoundingClientRect();
          if (p.offset === null) {
            p.offset = (er.top + er.height / 2) - (ar.top + ar.height / 2);
          }
          p.center = ar.top + window.scrollY + ar.height / 2 + p.offset;
        }
      },

      updateParallax() {
        if (REDUCED || !this.parallaxEls.length) return;
        const mid = window.scrollY + this.vh / 2;
        for (const p of this.parallaxEls) {
          const progress = (p.center - mid) / this.vh; /* -1 (passé) → 1 (à venir) */
          const shift = -progress * p.speed * 120;     /* décalage en px */
          p.el.style.transform = 'translate3d(0, ' + shift.toFixed(1) + 'px, 0)';
        }
      },

      scrollTop() {
        window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      },

      /* ----- Apparition au scroll (data-reveal + barres de compétences) ----- */
      initReveal() {
        const els = document.querySelectorAll('[data-reveal]');
        if (REDUCED || !('IntersectionObserver' in window)) {
          els.forEach((el) => el.classList.add('revealed'));
          return;
        }
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.15, rootMargin: '0px 0px -48px 0px' });
        els.forEach((el) => io.observe(el));
      },

      /* ----- Scrollspy : lien de navigation actif ----- */
      initSpy() {
        const sections = document.querySelectorAll('main section[id]');
        if (!('IntersectionObserver' in window) || !sections.length) return;
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) this.active = entry.target.id;
          });
        }, { rootMargin: '-45% 0px -50% 0px' });
        sections.forEach((s) => io.observe(s));
      },
    }));
  });
})();
