/* ============================================
   ImgCdn.js — Serves repo-hosted images through
   the free wsrv.nl image CDN (resize + WebP)
   ============================================ */

var NZImg = (function () {
  function isLocal() {
    var h = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      h === "localhost" ||
      h === "127.0.0.1"
    );
  }

  // Returns a resized, WebP, CDN-cached URL for images stored in this repo's
  // images/ folder. External URLs (Instagram etc.) are returned untouched.
  // wsrv.nl can only fetch public URLs, so local dev keeps the original path.
  function cdn(src, width) {
    if (!src || isLocal()) return src;
    if (!/^(\.\/)?images\//i.test(src)) return src;
    var abs;
    try {
      abs = new URL(src, window.location.href).href;
    } catch (_) {
      return src;
    }
    return (
      "https://wsrv.nl/?url=" +
      encodeURIComponent(abs) +
      "&w=" + width +
      "&we&output=webp&q=78"
    );
  }

  return { cdn: cdn };
})();
