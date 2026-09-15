/* ==========================================================================
   MINING @ Future Talent Arabia — site behaviour
   No dependencies. Every block guards its own elements, so the same file is
   safe to load on pages that only use some of them.
   ========================================================================== */
(function () {
  'use strict';

  var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
     Header state — transparent over the hero, landed on the page ground
     once the hero has scrolled past.
     ---------------------------------------------------------------------- */
  (function header() {
    var hdr = document.getElementById('hdr');
    if (!hdr) return;

    var threshold = 80;
    var queued = false;

    function apply() {
      queued = false;
      var y = window.scrollY || window.pageYOffset || 0;
      hdr.classList.toggle('is-stuck', y > threshold);
    }

    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(apply);
    }, { passive: true });

    apply();
  })();

  /* ----------------------------------------------------------------------
     Mobile navigation drawer.
     The drawer is a sibling of the header rather than a child so it can
     cover the viewport without inheriting the header's stacking context.
     ---------------------------------------------------------------------- */
  (function drawer() {
    var burger = document.getElementById('burger');
    var panel = document.getElementById('drawer');
    if (!burger || !panel) return;

    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('nav-open', open);
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });

    /* Any link closes it — in-page anchors would otherwise scroll behind
       an open panel. */
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });

    /* Resizing up to desktop leaves a hidden panel holding the body scroll
       lock, so release it when the drawer's own media query stops applying. */
    var wide = window.matchMedia('(min-width: 72.0625rem)');
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    else wide.addListener(onChange);

    setOpen(false);
  })();

  /* ----------------------------------------------------------------------
     Current page / section marker in the desktop nav.
     ---------------------------------------------------------------------- */
  (function currentLink() {
    var links = document.querySelectorAll('.hdr__nav a');
    if (!links.length) return;

    var here = location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';

    Array.prototype.forEach.call(links, function (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') return;
      var path = a.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
      if (path === here) a.classList.add('is-current');
    });
  })();

  /* ----------------------------------------------------------------------
     Scroll reveal. Elements start hidden only under the motion-safe media
     query in CSS, so if IntersectionObserver is missing or motion is
     reduced, content is simply visible.
     ---------------------------------------------------------------------- */
  (function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!motionOK || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(items, function (el, i) {
      /* Stagger within a row without needing per-element markup. */
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
      io.observe(el);
    });
  })();

  /* ----------------------------------------------------------------------
     Count-up figures. Opt in with data-count="1200" on the element; the
     element's existing text is kept as the final rendering, so the suffix
     and formatting in the HTML stay authoritative.
     ---------------------------------------------------------------------- */
  (function counters() {
    var figs = document.querySelectorAll('[data-count]');
    if (!figs.length) return;

    if (!motionOK || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (isNaN(target)) return;

      var finalText = el.textContent;
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      var started = null;
      var dur = 1100;

      function frame(now) {
        if (started === null) started = now;
        var p = Math.min((now - started) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var value = Math.round(target * eased);
        el.textContent = prefix + value.toLocaleString('en-US') + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else el.textContent = finalText;
      }

      requestAnimationFrame(frame);
    }

    Array.prototype.forEach.call(figs, function (el) { io.observe(el); });
  })();

  /* ----------------------------------------------------------------------
     Enquiry forms.

     Every form on this site delivers to the address in data-mailto — the
     mining desk inbox. The submission is POSTed to the relay in
     data-endpoint, which forwards it there as an email.

     If that request fails for any reason — the relay is down, the visitor is
     offline, an extension blocked it — we open a pre-filled mail draft to the
     same address instead. An enquiry is never silently lost.
     ---------------------------------------------------------------------- */
  (function enquiry() {
    var forms = document.querySelectorAll('form[data-enquiry]');
    if (!forms.length) return;

    var DESK = 'recruitment@futuretalentarabia.com';

    Array.prototype.forEach.call(forms, function (form) {
      var status = form.querySelector('.form__status');
      var submit = form.querySelector('button[type="submit"]');
      var submitLabel = submit ? submit.textContent : '';
      var to = form.getAttribute('data-mailto') || DESK;

      function say(msg, kind) {
        if (!status) return;
        status.textContent = msg;
        status.className = 'form__status form__status--' + kind;
        status.hidden = false;
      }

      /* Field names starting with "_" are instructions to the relay, not
         answers from the visitor — keep them out of the readable draft. */
      function asText(data) {
        var lines = [];
        data.forEach(function (value, key) {
          if (key.charAt(0) === '_' || !String(value).trim()) return;
          lines.push(key.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + value);
        });
        return lines.join('\n');
      }

      function mailFallback(data, subject) {
        window.location.href = 'mailto:' + to +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(asText(data));
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        /* Honeypot: a real person never sees this field, so anything in it
           came from a bot. Fail silently — do not teach it what went wrong. */
        var hp = form.querySelector('input[name="_honey"]');
        if (hp && hp.value) return;

        var firstBad = null;
        Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (el) {
          var bad = !el.checkValidity();
          el.setAttribute('aria-invalid', String(bad));
          if (bad && !firstBad) firstBad = el;
        });

        if (firstBad) {
          say('Please complete the highlighted fields so we can route your enquiry to the right consultant.', 'err');
          firstBad.focus();
          return;
        }

        var data = new FormData(form);
        var subject = form.getAttribute('data-subject') || 'Mining enquiry';
        var who = data.get('company') || data.get('first_name');
        if (who) subject += ' — ' + who;
        data.set('_subject', subject);

        var endpoint = form.getAttribute('data-endpoint');

        if (!endpoint) {
          mailFallback(data, subject);
          say('Opening your email client with the enquiry pre-filled and addressed to ' + to + '.', 'ok');
          return;
        }

        if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

        fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
          .then(function (res) {
            if (!res.ok) throw new Error('Relay returned ' + res.status);
            form.reset();
            say('Thank you — your enquiry is with our mining desk. We treat every brief as confidential and respond within one business day.', 'ok');
          })
          .catch(function () {
            mailFallback(data, subject);
            say('We could not send that from the page, so we have opened an email to ' + to + ' with your details filled in. Please press send — or write to us at that address directly.', 'err');
          })
          .then(function () {
            if (submit) { submit.disabled = false; submit.textContent = submitLabel; }
          });
      });

      /* Clear the invalid marker as soon as the visitor starts fixing it. */
      form.addEventListener('input', function (e) {
        if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) {
          e.target.setAttribute('aria-invalid', 'false');
        }
      });
    });
  })();

  /* ----------------------------------------------------------------------
     FAQ — one open at a time within a list.
     ---------------------------------------------------------------------- */
  (function faq() {
    var lists = document.querySelectorAll('[data-accordion]');
    Array.prototype.forEach.call(lists, function (list) {
      var items = list.querySelectorAll('details');
      Array.prototype.forEach.call(items, function (item) {
        item.addEventListener('toggle', function () {
          if (!item.open) return;
          Array.prototype.forEach.call(items, function (other) {
            if (other !== item) other.open = false;
          });
        });
      });
    });
  })();

  /* ----------------------------------------------------------------------
     Footer year.
     ---------------------------------------------------------------------- */
  (function year() {
    var slots = document.querySelectorAll('[data-year]');
    var y = String(new Date().getFullYear());
    Array.prototype.forEach.call(slots, function (el) { el.textContent = y; });
  })();
})();
