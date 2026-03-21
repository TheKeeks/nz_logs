/* ============================================
   Main.js — Fetches & renders posts on index.html
   ============================================ */

var CONFIG = {
  instagramHandle: "nz_logs",
  postsFile: "posts.json",
};

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    initLightbox();
    loadPosts();
    loadVisitorCount();
  });

  function loadVisitorCount() {
    var totalEl = document.getElementById("visitor-count");
    var myEl = document.getElementById("my-visitor-number");
    if (!totalEl) return;

    fetch("https://api.counterapi.dev/v1/thekeeks-nz-logs/visits/up")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var count = String(data.count);
        totalEl.textContent = count;

        // Store device-specific visitor number on first visit
        if (myEl) {
          var myNumber = localStorage.getItem("nz_logs_my_visitor_number");
          if (!myNumber) {
            myNumber = count;
            localStorage.setItem("nz_logs_my_visitor_number", myNumber);
          }
          myEl.textContent = myNumber;
        }
      })
      .catch(function () {
        if (totalEl) totalEl.textContent = "?";
        if (myEl) {
          var stored = localStorage.getItem("nz_logs_my_visitor_number");
          myEl.textContent = stored || "?";
        }
      });
  }

  function loadPosts() {
    fetch(CONFIG.postsFile + "?t=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load posts: " + res.status);
        return res.json();
      })
      .then(function (data) {
        renderMarquee(data.marquee);
        renderPosts(data.posts || []);
        updateLastUpdated(data.posts || []);
      })
      .catch(function (err) {
        console.error(err);
        var container = document.getElementById("posts-container");
        if (container) {
          container.innerHTML =
            '<p class="no-posts">Could not load posts. Please try again later.</p>';
        }
      });
  }

  function renderMarquee(text) {
    var el = document.getElementById("marquee-text");
    if (el && text) {
      el.textContent = text;
    }
  }

  function updateLastUpdated(posts) {
    var el = document.getElementById("last-updated");
    if (el && posts.length > 0) {
      var latest = posts[0].date;
      var d = new Date(latest + "T00:00:00");
      var options = { year: "numeric", month: "long", day: "numeric" };
      el.textContent = "Last updated: " + d.toLocaleDateString("en-US", options);
    }
  }

  function applyImageEnhancements(container, eagerCount) {
    var imgs = container.querySelectorAll(".post-image img");
    imgs.forEach(function (img, i) {
      var figure = img.closest(".post-image");
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

  function renderPosts(posts) {
    var container = document.getElementById("posts-container");
    if (!container) return;

    if (posts.length === 0) {
      container.innerHTML =
        '<p class="no-posts">No posts yet. Check back soon!</p>';
      return;
    }

    var html = "";
    posts.forEach(function (post, index) {
      if (!post.published) return;

      var dateStr = "";
      if (post.date) {
        var d = new Date(post.date + "T00:00:00");
        var options = { year: "numeric", month: "long", day: "numeric" };
        dateStr = d.toLocaleDateString("en-US", options);
      }

      html += '<div class="post" id="post-' + post.id + '">';
      if (dateStr) {
        html += '<div class="post-date">\ud83d\udcc5 ' + dateStr + "</div>";
      }
      if (post.location) {
        html +=
          '<div class="post-location">\ud83d\udccd ' +
          escapeHtml(post.location) +
          "</div>";
      }
      html += "<h2>" + escapeHtml(post.title) + "</h2>";
      html += '<div class="post-body">' + post.body + "</div>";
      if (index < posts.length - 1) {
        html += "<hr>";
      }
      html += "</div>";
    });

    container.innerHTML = html;

    // Apply lazy loading, shimmer, and error handling to all post images
    applyImageEnhancements(container, 2);

    // Lightbox delegation — bound to container since innerHTML is replaced on each render
    container.addEventListener("click", function (e) {
      var img = e.target.closest(".post-image img");
      if (!img) return;
      openLightbox(img.src, img.getAttribute("alt") || "");
    });

    // Process any Instagram embeds already in the HTML
    Instagram.processEmbeds();

    // Also resolve any remaining {{instagram:}} placeholders (fallback)
    resolveRemainingPlaceholders(container);
  }

  function resolveRemainingPlaceholders(container) {
    var bodyDivs = container.querySelectorAll(".post-body");
    bodyDivs.forEach(function (div) {
      if (div.innerHTML.indexOf("{{instagram:") === -1) return;
      Instagram.resolveEmbeds(div.innerHTML).then(function (resolved) {
        div.innerHTML = resolved;
        Instagram.processEmbeds();
      });
    });
  }

  function initLightbox() {
    if (document.getElementById("lightbox-overlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "lightbox-overlay";
    overlay.innerHTML =
      '<div id="lightbox-dialog">' +
        '<div id="lightbox-titlebar">' +
          '<span id="lightbox-title">Image</span>' +
          '<button id="lightbox-close-btn">X</button>' +
        "</div>" +
        '<div id="lightbox-body"><img id="lightbox-img" src="" alt=""></div>' +
        '<div id="lightbox-caption"></div>' +
      "</div>";
    document.body.appendChild(overlay);
    document
      .getElementById("lightbox-close-btn")
      .addEventListener("click", closeLightbox);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  function openLightbox(src, alt) {
    document.getElementById("lightbox-img").src = src;
    document.getElementById("lightbox-img").alt = alt;
    document.getElementById("lightbox-title").textContent = alt || "Image";
    document.getElementById("lightbox-caption").textContent = alt;
    document.getElementById("lightbox-overlay").classList.add("active");
  }

  function closeLightbox() {
    var overlay = document.getElementById("lightbox-overlay");
    if (overlay) overlay.classList.remove("active");
    var img = document.getElementById("lightbox-img");
    if (img) img.src = "";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
