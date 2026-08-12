/* ============================================
   Post.js — Renders a single post on post.html
   ============================================ */

var CONFIG = {
  postsFile: "posts.json",
};

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    initLightbox();
    initWindowClose();

    if (!isSigned()) {
      showGate();
      return;
    }

    var id = getPostId();
    if (!id) {
      showError("No post specified.");
      return;
    }
    loadPost(id);
  });

  function getPostId() {
    var m = window.location.search.match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ── Sign-in gate (same localStorage flag as index.html) ──────────────────────

  function isSigned() {
    return !!localStorage.getItem("nz_logs_signed");
  }

  function showGate() {
    var container = document.getElementById("post-container");
    if (!container) return;
    container.innerHTML =
      '<div class="gate-overlay">' +
        '<div class="gate-dialog">' +
          '<div class="gate-titlebar">' +
            '<img src="https://unpkg.com/pixelarticons/svg/lock.svg" class="pixel-icon pixel-icon-white" alt=""> ' +
            'Sign In Required' +
          '</div>' +
          '<div class="gate-body">' +
            '<p>Sign the guestbook in the Info tab to access the travel log.</p>' +
            '<button type="button" class="btn" id="gate-go-info">Go to Info</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var btn = document.getElementById("gate-go-info");
    if (btn) {
      btn.addEventListener("click", function () {
        try { localStorage.setItem("nz_logs_active_tab", "info"); } catch (_) {}
        window.location.href = "index.html";
      });
    }
  }

  // ── Window chrome ─────────────────────────────────────────────────────────────

  function initWindowClose() {
    var btn = document.getElementById("window-close-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.location.href = "index.html";
    });
  }

  // ── Post loading + rendering ──────────────────────────────────────────────────

  function loadPost(id) {
    fetch(CONFIG.postsFile + "?t=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load posts: " + res.status);
        return res.json();
      })
      .then(function (data) {
        var posts = (data.posts || []).filter(function (p) { return p.published; });
        var post = null;
        for (var i = 0; i < posts.length; i++) {
          if (posts[i].id === id) { post = posts[i]; break; }
        }
        if (!post) {
          showError("Post not found.");
          return;
        }
        renderPost(post);
      })
      .catch(function (err) {
        console.error(err);
        showError("Could not load this post. Please try again later.");
      });
  }

  function showError(msg) {
    var container = document.getElementById("post-container");
    if (container) {
      container.innerHTML = '<p class="no-posts">' + escapeHtml(msg) + "</p>";
    }
  }

  function renderPost(post) {
    var container = document.getElementById("post-container");
    if (!container) return;

    var titleText = post.title || "Post";
    document.title = titleText + " — NZ Logs";
    var winTitle = document.getElementById("window-title");
    if (winTitle) winTitle.textContent = titleText;

    var dateStr = "";
    if (post.date) {
      var d = new Date(post.date + "T00:00:00");
      dateStr = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }

    container.innerHTML =
      '<div class="post-content">' +
        '<div class="post-meta">' +
          (dateStr
            ? '<span class="post-date"><img src="https://unpkg.com/pixelarticons/svg/calendar.svg" class="pixel-icon pixel-icon-gray" alt=""> ' + escapeHtml(dateStr) + '</span>'
            : '') +
          (post.location
            ? '<span class="post-location"><img src="https://unpkg.com/pixelarticons/svg/map-pin.svg" class="pixel-icon pixel-icon-green" alt=""> ' + escapeHtml(post.location) + '</span>'
            : '') +
        '</div>' +
        '<h2 class="post-heading">' + escapeHtml(titleText) + '</h2>' +
        '<div class="post-body">' + (post.body || "") + '</div>' +
      '</div>';

    routeImagesThroughCdn(container);
    applyImageEnhancements(container, 2);

    // Click any post image to maximize it in the lightbox
    container.addEventListener("click", function (e) {
      var img = e.target.closest(".post-image img");
      if (img) {
        openLightbox(
          img.getAttribute("data-fit") || img.src,
          img.getAttribute("alt") || "",
          img.getAttribute("data-full") || img.src
        );
      }
    });

    // Instagram embeds
    if ((post.body || "").indexOf("{{instagram:") !== -1 && window.Instagram) {
      var inner = container.querySelector(".post-body");
      if (inner) {
        Instagram.resolveEmbeds(inner.innerHTML).then(function (resolved) {
          inner.innerHTML = resolved;
          routeImagesThroughCdn(container);
          applyImageEnhancements(container, 2);
          Instagram.processEmbeds();
        });
      }
    } else if (window.Instagram) {
      Instagram.processEmbeds();
    }
  }

  // ── CDN routing ──────────────────────────────────────────────────────────────

  // Swap repo-hosted originals (often several MB each) for ~1000px WebP CDN
  // copies. The original URL is kept in data-full for the lightbox's
  // "Full Size" view, and as the fallback if the CDN fails.
  function routeImagesThroughCdn(container) {
    var imgs = container.querySelectorAll(".post-image img");
    imgs.forEach(function (img) {
      var src = img.getAttribute("src");
      var small = NZImg.cdn(src, 1000);
      if (small === src || img.getAttribute("data-full")) return;
      var full;
      try { full = new URL(src, window.location.href).href; } catch (_) { return; }
      img.setAttribute("data-full", full);
      img.setAttribute("data-fit", NZImg.cdn(src, 1600));
      img.addEventListener("error", function () {
        var figure = img.closest(".post-image");
        img.addEventListener("load", function () {
          if (figure) figure.classList.remove("img-error");
        }, { once: true });
        img.removeAttribute("data-fit");
        img.src = full;
      }, { once: true });
      img.src = small;
    });
  }

  // ── Image enhancements (loading/error states) ────────────────────────────────

  function applyImageEnhancements(container, eagerCount) {
    var imgs = container.querySelectorAll(".post-image img");
    imgs.forEach(function (img, i) {
      var figure = img.closest(".post-image");
      if (!figure) return;
      img.setAttribute("loading", i < eagerCount ? "eager" : "lazy");
      if (!img.complete) {
        figure.classList.add("img-loading");
        img.addEventListener("load", function () {
          figure.classList.remove("img-loading");
        }, { once: true });
        img.addEventListener("error", function () {
          figure.classList.remove("img-loading");
          figure.classList.add("img-error");
        }, { once: true });
      }
    });
  }

  // ── Lightbox with full-resolution zoom toggle ────────────────────────────────

  function initLightbox() {
    if (document.getElementById("lightbox-overlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "lightbox-overlay";
    overlay.innerHTML =
      '<div id="lightbox-dialog">' +
        '<div id="lightbox-titlebar">' +
          '<span id="lightbox-title">Image</span>' +
          '<span class="lightbox-btns">' +
            '<button id="lightbox-zoom-btn" title="Toggle full resolution">Full Size</button>' +
            '<button id="lightbox-close-btn" aria-label="Close">X</button>' +
          "</span>" +
        "</div>" +
        '<div id="lightbox-body"><img id="lightbox-img" src="" alt=""></div>' +
        '<div id="lightbox-caption"></div>' +
      "</div>";
    document.body.appendChild(overlay);
    document
      .getElementById("lightbox-close-btn")
      .addEventListener("click", closeLightbox);
    document
      .getElementById("lightbox-zoom-btn")
      .addEventListener("click", toggleLightboxZoom);
    // Clicking the photo itself also toggles fit <-> full resolution
    document
      .getElementById("lightbox-img")
      .addEventListener("click", toggleLightboxZoom);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  function openLightbox(src, alt, fullSrc) {
    var img = document.getElementById("lightbox-img");
    img.src = src;
    img.alt = alt;
    img.setAttribute("data-full", fullSrc || src);
    document.getElementById("lightbox-title").textContent = alt || "Image";
    document.getElementById("lightbox-caption").textContent = alt;
    setLightboxZoom(false);
    document.getElementById("lightbox-overlay").classList.add("active");
  }

  function toggleLightboxZoom() {
    var body = document.getElementById("lightbox-body");
    setLightboxZoom(!body.classList.contains("zoomed"));
  }

  function setLightboxZoom(zoomed) {
    var body = document.getElementById("lightbox-body");
    var btn = document.getElementById("lightbox-zoom-btn");
    body.classList.toggle("zoomed", zoomed);
    // Full-resolution original is only fetched on demand
    var img = document.getElementById("lightbox-img");
    var full = img && img.getAttribute("data-full");
    if (zoomed && full && img.src !== full) img.src = full;
    if (btn) btn.textContent = zoomed ? "Fit" : "Full Size";
  }

  function closeLightbox() {
    var overlay = document.getElementById("lightbox-overlay");
    if (overlay) overlay.classList.remove("active");
    var img = document.getElementById("lightbox-img");
    if (img) img.src = "";
    setLightboxZoom(false);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str == null ? "" : String(str)));
    return div.innerHTML;
  }
})();
