/* ==========================================================
   Auto-fit for the permit.
   - data-fit="line"   (Name, Address): one line; shrinks down to
                        data-min-size, then wraps to two lines and
                        grows upward so the caption stays put.
   - data-fit="lines"  (Authorized Route): wraps; shrinks until it
                        fits data-max-lines, down to data-min-size.
   Call window.fitPermits() again after changing any text.
   ========================================================== */
(function () {
  "use strict";

  function fitLine(el) {
    var field = el.closest(".permit__field");
    if (!field.dataset.baseTop) field.dataset.baseTop = parseFloat(getComputedStyle(field).top);
    if (!el.dataset.maxSize)    el.dataset.maxSize    = parseFloat(getComputedStyle(el).fontSize);

    var max  = parseFloat(el.dataset.maxSize);
    var min  = parseFloat(el.dataset.minSize) || max * 0.6;
    var size = max;

    // reset to the designed look
    el.style.whiteSpace = "";
    el.style.lineHeight = "";
    el.style.fontSize = size + "px";
    field.style.top = field.dataset.baseTop + "px";

    // 1) shrink until it fits on one line
    while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
      size = Math.max(min, size - 0.5);
      el.style.fontSize = size + "px";
    }

    // 2) still too long: wrap to two lines and grow upward
    if (el.scrollWidth > el.clientWidth + 0.5) {
      el.style.whiteSpace = "normal";
      el.style.lineHeight = "1.08";
      var extra = el.offsetHeight - size;
      field.style.top = (field.dataset.baseTop - extra) + "px";
    }
  }

  function fitLines(el) {
    if (!el.dataset.maxSize) el.dataset.maxSize = parseFloat(getComputedStyle(el).fontSize);

    var max      = parseFloat(el.dataset.maxSize);
    var min      = parseFloat(el.dataset.minSize) || max * 0.6;
    var maxLines = parseInt(el.dataset.maxLines, 10) || 2;
    var lh       = parseFloat(getComputedStyle(el).lineHeight);
    var size     = max;

    el.style.fontSize = size + "px";

    while (Math.round(el.offsetHeight / lh) > maxLines && size > min) {
      size = Math.max(min, size - 0.3);
      el.style.fontSize = size + "px";
    }
  }

  function fitPermits(root) {
    (root || document).querySelectorAll("[data-fit]").forEach(function (el) {
      if (el.dataset.fit === "line")  fitLine(el);
      if (el.dataset.fit === "lines") fitLines(el);
    });
  }

  window.fitPermits = fitPermits;

  // Wait for the web fonts so measurements use the real glyph widths.
  var run = function () { fitPermits(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  else window.addEventListener("load", run);
})();
