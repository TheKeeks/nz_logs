/* ============================================
   Main.js — Fetches & renders posts on index.html
   ============================================ */

var CONFIG = {
  instagramHandle: "nz_logs",
  postsFile: "posts.json",
};

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    loadPosts();
  });

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

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
