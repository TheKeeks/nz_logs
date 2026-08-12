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
  var publishedPosts = [];

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initCardKeyboard();
    if (isSigned()) {
      loadPosts();
    } else {
      showGate();
    }
    loadGuestbook();
    initGuestbook();
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────────

  function initTabs() {
    var tabBar = document.querySelector(".tab-bar");
    if (!tabBar) return;
    tabBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".tab-btn");
      if (!btn) return;
      switchTab(btn.getAttribute("data-tab"));
    });

    var saved = null;
    try { saved = localStorage.getItem("nz_logs_active_tab"); } catch (_) {}
    if (saved) switchTab(saved);
  }

  function switchTab(tab) {
    var buttons = document.querySelectorAll(".tab-btn");
    var panels = document.querySelectorAll(".tab-panel");
    buttons.forEach(function (b) {
      var active = b.getAttribute("data-tab") === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach(function (p) {
      var show = p.id === "tab-" + tab;
      if (show) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
    try { localStorage.setItem("nz_logs_active_tab", tab); } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("nz:tabchange", { detail: { tab: tab } }));
    } catch (_) {}
    // Scroll to top of new tab for better UX
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  window.switchTab = switchTab;

  // ── Visitor counter (derived from guestbook) ─────────────────────────────────

  function updateVisitorCounter(totalCount) {
    var totalEl = document.getElementById("visitor-count");
    var myEl = document.getElementById("my-visitor-number");
    if (totalEl) totalEl.textContent = String(totalCount);
    if (myEl) {
      var stored = localStorage.getItem("nz_logs_my_visitor_number");
      if (!stored) {
        stored = String(totalCount + 1);
        try { localStorage.setItem("nz_logs_my_visitor_number", stored); } catch (_) {}
      }
      myEl.textContent = stored;
    }
  }

  function setVisitorCounterError() {
    var totalEl = document.getElementById("visitor-count");
    var myEl = document.getElementById("my-visitor-number");
    if (totalEl) totalEl.textContent = "?";
    if (myEl) {
      var stored = localStorage.getItem("nz_logs_my_visitor_number");
      myEl.textContent = stored || "?";
    }
  }

  // ── Sign-in gate ──────────────────────────────────────────────────────────────

  function isSigned() {
    return !!localStorage.getItem("nz_logs_signed");
  }

  function markSigned() {
    localStorage.setItem("nz_logs_signed", "1");
    if (document.querySelector(".gate-overlay")) {
      loadPosts();
    }
  }

  function showGate() {
    var container = document.getElementById("posts-container");
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
        switchTab("info");
        var gb = document.getElementById("guestbook");
        if (gb) gb.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  // ── Posts ─────────────────────────────────────────────────────────────────────

  function loadPosts() {
    fetch(CONFIG.postsFile + "?t=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load posts: " + res.status);
        return res.json();
      })
      .then(function (data) {
        renderMarquee(data.marquee);
        publishedPosts = (data.posts || []).filter(function (p) { return p.published; });
        renderCards(publishedPosts);
        updateLastUpdated(publishedPosts);
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

  // ── Card feed ─────────────────────────────────────────────────────────────────

  function renderCards(posts) {
    var container = document.getElementById("posts-container");
    if (!container) return;

    if (!posts.length) {
      container.innerHTML = '<p class="no-posts">No posts yet. Check back soon!</p>';
      return;
    }

    var html = '<div class="card-feed">';
    posts.forEach(function (post) {
      html += buildCardHtml(post);
    });
    html += '</div>';
    container.innerHTML = html;

    container.addEventListener("click", onCardClick);
  }

  function buildCardHtml(post) {
    var thumb = firstImageSrc(post.body);
    var badge = dateBadge(post.date);
    var teaser = makeTeaser(post.body, 160);
    var loc = post.location ? escapeHtml(post.location) : "";

    // Cards render at 110px square — request a small CDN copy instead of the
    // multi-MB original, falling back to the original if the CDN is down.
    var thumbSmall = thumb ? NZImg.cdn(thumb, 240) : "";
    var thumbImg = "";
    if (thumb) {
      thumbImg = '<img loading="lazy" decoding="async" src="' + escapeAttr(thumbSmall) + '"';
      if (thumbSmall !== thumb) {
        thumbImg += ' data-full="' + escapeAttr(thumb) + '" onerror="this.onerror=null;this.src=this.getAttribute(\'data-full\');"';
      }
      thumbImg += ' alt="">';
    }

    return (
      '<article class="post-card" data-post-id="' + escapeAttr(post.id) + '" tabindex="0" role="button" aria-label="Open post: ' + escapeAttr(post.title) + '">' +
        '<div class="card-thumb">' +
          (thumb
            ? thumbImg
            : '<div class="card-thumb-empty"></div>') +
          (badge
            ? '<span class="card-date-badge"><span class="dm">' + badge.month + '</span><span class="dd">' + badge.day + '</span></span>'
            : '') +
        '</div>' +
        '<div class="card-body">' +
          (loc
            ? '<div class="card-location"><img src="https://unpkg.com/pixelarticons/svg/map-pin.svg" class="pixel-icon pixel-icon-green" alt=""> ' + loc + '</div>'
            : '') +
          '<h3 class="card-title">' + escapeHtml(post.title) + '</h3>' +
          '<p class="card-teaser">' + escapeHtml(teaser) + '</p>' +
        '</div>' +
      '</article>'
    );
  }

  function firstImageSrc(bodyHtml) {
    if (!bodyHtml) return "";
    var m = bodyHtml.match(/<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
    return m ? m[1] : "";
  }

  function makeTeaser(bodyHtml, len) {
    if (!bodyHtml) return "";
    var tmp = document.createElement("div");
    tmp.innerHTML = bodyHtml;
    // Drop figures so image captions don't leak in and they're already represented by the thumbnail.
    tmp.querySelectorAll("figure").forEach(function (f) { f.remove(); });
    var text = (tmp.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length <= len) return text;
    return text.slice(0, len).replace(/[\s,.;:!?-]+$/, "") + "…";
  }

  function dateBadge(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: String(d.getDate()),
    };
  }

  function onCardClick(e) {
    var card = e.target.closest(".post-card");
    if (!card) return;
    var id = card.getAttribute("data-post-id");
    var post = publishedPosts.find(function (p) { return p.id === id; });
    if (post) openPostPage(post.id);
  }

  // ── Post pages ────────────────────────────────────────────────────────────────

  function openPostPage(id) {
    window.location.href = "post.html?id=" + encodeURIComponent(id);
  }

  function initCardKeyboard() {
    // Open on Enter/Space when focused on a card
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest(".post-card")
        : null;
      if (!card) return;
      e.preventDefault();
      var id = card.getAttribute("data-post-id");
      var post = publishedPosts.find(function (p) { return p.id === id; });
      if (post) openPostPage(post.id);
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str == null ? "" : String(str)));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  // ── Guestbook ─────────────────────────────────────────────────────────────────

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
    var mainList = document.getElementById("guests-list-main");
    var notesPanel = document.getElementById("guestbook-notes");

    updateVisitorCounter(guests.length);

    if (!guests.length) {
      var emptyNames = "<li><i>No visitors yet!</i></li>";
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

    if (mainList) mainList.innerHTML = namesHtml;
    if (notesPanel) notesPanel.innerHTML = hasNotes ? notesHtml : "<p><i>No notes yet — be the first!</i></p>";
  }

  function setGuestLoadError() {
    var msg = "<li><i>Unavailable</i></li>";
    var mainList = document.getElementById("guests-list-main");
    var notesPanel = document.getElementById("guestbook-notes");
    if (mainList) mainList.innerHTML = msg;
    if (notesPanel) notesPanel.innerHTML = "<p><i>Could not load notes.</i></p>";
    setVisitorCounterError();
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
        markSigned();
        showGuestStatus("Welcome home!", "info");
        return;
      }

      submitBtn.disabled = true;
      showGuestStatus("Signing in…", "info");

      fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN_ID + "/latest")
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var guests = (data.record && data.record.guests) || [];
          var duplicate = guests.some(function (g) {
            return g.name.toLowerCase() === name.toLowerCase();
          });

          if (duplicate) {
            markSigned();
            showGuestStatus("Already in the log! Welcome back :)", "info");
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
            markSigned();
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
