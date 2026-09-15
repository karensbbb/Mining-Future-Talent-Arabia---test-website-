/* Mining @ Future Talent Arabia — header state.
   The header starts transparent over the hero and lands on the page
   ground once the hero has scrolled past. */
(function () {
  var hdr = document.getElementById('hdr');
  if (!hdr) return;

  var threshold = 80;
  var queued = false;

  function apply() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;
    hdr.classList.toggle('is-stuck', y > threshold);
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  apply();
})();
