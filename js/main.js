/* ============================================
   Main.js — Fetches & renders posts on index.html
   ============================================ */

var CONFIG = {
  instagramHandle: "nz_logs",
  postsFile: "posts.json",
};

var JSONBIN_BIN_ID = "69c6330db7ec241ddcaae9f9";
var JSONBIN_KEY = "$2a$10$lzm5XzmGnTkKtV4sx.hEtO3Ir2o87zWSQcpFr9NlfzBTVsa3Q.ijG";
var GUESTBOOK_EXCLUDED = ["keeks", "elsie"];

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    initLightbox();
    loadPosts();
    loadVisitorCount();
    loadGuestbook();
    initGuestbook();
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
        renderEntriesNav(data.posts || []);
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

  function deferImages(bodyHtml) {
    return bodyHtml.replace(/<img\s([^>]*?)src\s*=\s*"([^"]*?)"/gi, '<img $1data-src="$2" src=""');
  }

  function activateImages(postEl) {
    var imgs = postEl.querySelectorAll(".post-image img[data-src]");
    imgs.forEach(function (img) {
      img.setAttribute("src", img.getAttribute("data-src"));
      img.removeAttribute("data-src");
    });
    applyImageEnhancements(postEl, 0);
  }

  function expandPost(postEl) {
    if (!postEl.classList.contains("collapsed")) return;

    // Accordion: collapse all other expanded posts
    var container = document.getElementById("posts-container");
    var allPosts = container.querySelectorAll(".post:not(.collapsed)");
    allPosts.forEach(function (other) {
      if (other !== postEl) collapsePost(other);
    });

    postEl.classList.remove("collapsed");
    var toggle = postEl.querySelector(".post-toggle");
    if (toggle) toggle.textContent = "[-]";

    // Activate deferred images on first expand
    if (postEl.querySelectorAll(".post-image img[data-src]").length > 0) {
      activateImages(postEl);
      // Process Instagram embeds in this post
      var bodyDiv = postEl.querySelector(".post-body");
      if (bodyDiv && bodyDiv.innerHTML.indexOf("{{instagram:") !== -1) {
        Instagram.resolveEmbeds(bodyDiv.innerHTML).then(function (resolved) {
          bodyDiv.innerHTML = resolved;
          Instagram.processEmbeds();
        });
      }
    }
  }

  function collapsePost(postEl) {
    if (postEl.classList.contains("collapsed")) return;
    postEl.classList.add("collapsed");
    var toggle = postEl.querySelector(".post-toggle");
    if (toggle) toggle.textContent = "[+]";
  }

  function togglePost(postEl) {
    if (postEl.classList.contains("collapsed")) {
      expandPost(postEl);
    } else {
      collapsePost(postEl);
    }
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
    var publishedIndex = 0;
    posts.forEach(function (post, index) {
      if (!post.published) return;

      var isNewest = publishedIndex === 0;
      publishedIndex++;

      var dateStr = "";
      if (post.date) {
        var d = new Date(post.date + "T00:00:00");
        var options = { year: "numeric", month: "long", day: "numeric" };
        dateStr = d.toLocaleDateString("en-US", options);
      }

      var collapsed = !isNewest;
      html += '<div class="post' + (collapsed ? " collapsed" : "") + '" id="post-' + post.id + '">';

      // Clickable header with toggle
      html += '<div class="post-header">';
      html += '<button class="post-font-toggle btn" title="Toggle font size" aria-label="Toggle font size">A+</button>';
      html += '<span class="post-toggle">' + (collapsed ? "[+]" : "[-]") + "</span>";
      if (dateStr) {
        html += '<span class="post-date"><img src="https://unpkg.com/pixelarticons/svg/calendar.svg" class="pixel-icon" alt=""> ' + dateStr + "</span> ";
      }
      if (post.location) {
        html += '<span class="post-location"><img src="https://unpkg.com/pixelarticons/svg/map-pin.svg" class="pixel-icon" alt=""> ' + escapeHtml(post.location) + "</span> ";
      }
      html += "<h2>" + escapeHtml(post.title) + "</h2>";
      html += "</div>";

      // Body — defer images for collapsed posts
      var bodyHtml = collapsed ? deferImages(post.body) : post.body;
      html += '<div class="post-body">' + bodyHtml + "</div>";

      if (index < posts.length - 1) {
        html += "<hr>";
      }
      html += "</div>";
    });

    container.innerHTML = html;

    // Apply image enhancements only to the expanded (newest) post
    var newestPost = container.querySelector(".post:not(.collapsed)");
    if (newestPost) {
      applyImageEnhancements(newestPost, 2);
    }

    // Click delegation for post headers
    container.addEventListener("click", function (e) {
      var fontBtn = e.target.closest(".post-font-toggle");
      if (fontBtn) {
        var postEl = fontBtn.closest(".post");
        if (postEl) postEl.classList.toggle("font-large");
        return;
      }

      var header = e.target.closest(".post-header");
      if (header) {
        var postEl = header.closest(".post");
        if (postEl) togglePost(postEl);
        return;
      }

      // Lightbox delegation
      var img = e.target.closest(".post-image img");
      if (!img) return;
      openLightbox(img.src, img.getAttribute("alt") || "");
    });

    // Process any Instagram embeds already in the HTML (newest post)
    Instagram.processEmbeds();

    // Also resolve any remaining {{instagram:}} placeholders (fallback) for newest post
    if (newestPost) {
      var bodyDiv = newestPost.querySelector(".post-body");
      if (bodyDiv && bodyDiv.innerHTML.indexOf("{{instagram:") !== -1) {
        Instagram.resolveEmbeds(bodyDiv.innerHTML).then(function (resolved) {
          bodyDiv.innerHTML = resolved;
          Instagram.processEmbeds();
        });
      }
    }
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

  function renderEntriesNav(posts) {
    var list = document.getElementById("entries-list");
    if (!list) return;

    var published = posts.filter(function (p) { return p.published; });
    if (published.length === 0) {
      list.innerHTML = "<li><i>No entries yet</i></li>";
      return;
    }

    var html = "";
    published.forEach(function (post) {
      var label = "";
      if (post.date) {
        var d = new Date(post.date + "T00:00:00");
        var month = d.toLocaleDateString("en-US", { month: "short" });
        var day = d.getDate();
        label = month + " " + day + " - ";
      }
      label += post.title;
      html += '<li><a href="#post-' + post.id + '" data-post-id="' + post.id + '">' + escapeHtml(label) + "</a></li>";
    });
    list.innerHTML = html;

    initSmoothScroll(list);
    initScrollSpy(published);
  }

  function initSmoothScroll(list) {
    list.addEventListener("click", function (e) {
      var link = e.target.closest("a");
      if (!link) return;
      var target = document.getElementById("post-" + link.getAttribute("data-post-id"));
      if (target) {
        e.preventDefault();
        expandPost(target);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function initScrollSpy(posts) {
    var links = document.querySelectorAll("#entries-list a");
    if (!links.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id.replace("post-", "");
        var link = document.querySelector('#entries-list a[data-post-id="' + id + '"]');
        if (!link) return;
        if (entry.isIntersecting) {
          // Remove active from all links
          links.forEach(function (l) { l.classList.remove("active"); });
          link.classList.add("active");
        }
      });
    }, { rootMargin: "-10% 0px -80% 0px" });

    posts.forEach(function (post) {
      var el = document.getElementById("post-" + post.id);
      if (el) observer.observe(el);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Guestbook ──────────────────────────────────────────────────────────────

  function loadGuestbook() {
    fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN_ID + "/latest")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderGuestData((data.record && data.record.guests) || []);
      })
      .catch(function () {
        setGuestLoadError();
      });
  }

  function renderGuestData(guests) {
    // Sidebar guest list
    var sidebarList = document.getElementById("guests-list");
    // Main guestbook name list
    var mainList = document.getElementById("guests-list-main");
    // Notes panel
    var notesPanel = document.getElementById("guestbook-notes");

    if (!guests.length) {
      var emptyNames = "<li><i>No visitors yet!</i></li>";
      if (sidebarList) sidebarList.innerHTML = emptyNames;
      if (mainList) mainList.innerHTML = emptyNames;
      if (notesPanel) notesPanel.innerHTML = "<p><i>No notes yet — be the first!</i></p>";
      return;
    }

    var namesHtml = "";
    var notesHtml = "";
    var hasNotes = false;

    guests.forEach(function (guest) {
      namesHtml += "<li>" + escapeHtml(guest.name) + "</li>";
      if (guest.note && guest.note.trim()) {
        hasNotes = true;
        notesHtml += '<div class="guest-note"><strong>' + escapeHtml(guest.name) + "</strong><p>" + escapeHtml(guest.note.trim()) + "</p></div>";
      }
    });

    if (sidebarList) sidebarList.innerHTML = namesHtml;
    if (mainList) mainList.innerHTML = namesHtml;
    if (notesPanel) notesPanel.innerHTML = hasNotes ? notesHtml : "<p><i>No notes yet — be the first!</i></p>";
  }

  function setGuestLoadError() {
    var msg = "<li><i>Unavailable</i></li>";
    var sidebarList = document.getElementById("guests-list");
    var mainList = document.getElementById("guests-list-main");
    var notesPanel = document.getElementById("guestbook-notes");
    if (sidebarList) sidebarList.innerHTML = msg;
    if (mainList) mainList.innerHTML = msg;
    if (notesPanel) notesPanel.innerHTML = "<p><i>Could not load notes.</i></p>";
  }

  function showGuestStatus(msg, type) {
    var el = document.getElementById("guestbook-status");
    if (el) el.innerHTML = '<div class="status-msg ' + type + '">' + escapeHtml(msg) + "</div>";
  }

  function initGuestbook() {
    var nameInput = document.getElementById("guest-name-input");
    var submitBtn = document.getElementById("guest-submit-btn");
    if (!nameInput || !submitBtn) return;

    function handleSubmit() {
      var name = nameInput.value.trim();
      if (!name) {
        showGuestStatus("Please enter your name.", "error");
        return;
      }
      if (GUESTBOOK_EXCLUDED.indexOf(name.toLowerCase()) !== -1) {
        showGuestStatus("Welcome home! \u2665", "info");
        return;
      }

      submitBtn.disabled = true;
      showGuestStatus("Signing in\u2026", "info");

      fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN_ID + "/latest")
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var guests = (data.record && data.record.guests) || [];
          var duplicate = guests.some(function (g) {
            return g.name.toLowerCase() === name.toLowerCase();
          });

          if (duplicate) {
            showGuestStatus("Already in the log! Come back anytime :)", "info");
            submitBtn.disabled = false;
            return;
          }

          var note = (document.getElementById("guest-note-input") || {}).value || "";
          note = note.trim();
          guests.push({ name: name, note: note });

          return fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN_ID, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Master-Key": JSONBIN_KEY,
            },
            body: JSON.stringify({ guests: guests }),
          }).then(function () {
            nameInput.value = "";
            var noteInput = document.getElementById("guest-note-input");
            if (noteInput) noteInput.value = "";
            showGuestStatus("You're in the log!", "success");
            renderGuestData(guests);
          });
        })
        .catch(function () {
          showGuestStatus("Something went wrong. Try again!", "error");
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    }

    submitBtn.addEventListener("click", handleSubmit);
    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSubmit();
    });
  }
})();
