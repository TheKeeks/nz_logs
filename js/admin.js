/* ============================================
   Admin.js — Post editor + GitHub API commits
   ============================================ */

var CONFIG = {
  githubToken: "YOUR_PAT_HERE", // Fine-grained PAT, contents:write only
  repo: "thekeeks/nz_logs",
  branch: "main",
  postsFile: "posts.json",
  passwordHash:
    "3da5f8dd20938668226c6921b5e47758a2bdfb7f16c5de5690bff6c6f969a629",
};

(function () {
  var authenticated = false;

  document.addEventListener("DOMContentLoaded", function () {
    checkPassword();
  });

  function checkPassword() {
    var pw = prompt("Enter admin password:");
    if (!pw) {
      document.body.innerHTML =
        "<p>Access denied. <a href='index.html'>Go back</a></p>";
      return;
    }
    hashString(pw).then(function (hash) {
      if (hash === CONFIG.passwordHash) {
        authenticated = true;
        initAdmin();
      } else {
        document.body.innerHTML =
          "<p>Incorrect password. <a href='index.html'>Go back</a></p>";
      }
    });
  }

  function hashString(str) {
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var hex = "";
      bytes.forEach(function (b) {
        hex += b.toString(16).padStart(2, "0");
      });
      return hex;
    });
  }

  function initAdmin() {
    // Auto-fill date
    var dateInput = document.getElementById("post-date");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }

    // Bind buttons
    document
      .getElementById("btn-embed-instagram")
      .addEventListener("click", embedInstagram);
    document
      .getElementById("btn-preview")
      .addEventListener("click", togglePreview);
    document
      .getElementById("btn-publish")
      .addEventListener("click", publishPost);
    document
      .getElementById("btn-save-marquee")
      .addEventListener("click", saveMarquee);

    // Load current marquee text
    loadCurrentMarquee();
  }

  function loadCurrentMarquee() {
    fetchPostsJson().then(function (result) {
      if (result && result.data && result.data.marquee) {
        var marqueeInput = document.getElementById("marquee-text-input");
        if (marqueeInput) {
          marqueeInput.value = result.data.marquee;
        }
      }
    });
  }

  function embedInstagram() {
    var url = prompt("Paste Instagram post URL:");
    if (!url) return;

    // Clean the URL
    url = url.trim();
    if (url.indexOf("instagram.com") === -1) {
      showStatus("Invalid Instagram URL.", "error");
      return;
    }

    var textarea = document.getElementById("post-body");
    var placeholder = "{{instagram:" + url + "}}";

    // Insert at cursor position
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var text = textarea.value;
    textarea.value =
      text.substring(0, start) + "\n" + placeholder + "\n" + text.substring(end);
    textarea.focus();

    showStatus("Instagram embed placeholder inserted.", "info");
  }

  function togglePreview() {
    var previewArea = document.getElementById("preview-area");
    if (previewArea.style.display === "block") {
      previewArea.style.display = "none";
      return;
    }

    var title = document.getElementById("post-title").value;
    var body = document.getElementById("post-body").value;
    var location = document.getElementById("post-location").value;
    var date = document.getElementById("post-date").value;

    var html = "";
    if (date) html += '<div class="post-date">\ud83d\udcc5 ' + date + "</div>";
    if (location)
      html += '<div class="post-location">\ud83d\udccd ' + location + "</div>";
    html += "<h2>" + escapeHtml(title) + "</h2>";
    html += '<div class="post-body">' + body + "</div>";

    previewArea.innerHTML = "<h3>Preview:</h3>" + html;
    previewArea.style.display = "block";
  }

  function publishPost() {
    if (!authenticated) return;

    var title = document.getElementById("post-title").value.trim();
    var body = document.getElementById("post-body").value.trim();
    var location = document.getElementById("post-location").value.trim();
    var date = document.getElementById("post-date").value.trim();

    if (!title || !body) {
      showStatus("Title and body are required.", "error");
      return;
    }

    if (!date) {
      date = new Date().toISOString().split("T")[0];
    }

    var id =
      date + "-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);

    showStatus("Publishing...", "info");

    // Resolve Instagram placeholders before saving
    resolveInstagramPlaceholders(body)
      .then(function (resolvedBody) {
        var newPost = {
          id: id,
          date: date,
          title: title,
          location: location,
          body: resolvedBody,
          published: true,
        };

        return fetchPostsJson().then(function (result) {
          var data = result.data;
          var sha = result.sha;

          if (!data.posts) data.posts = [];
          data.posts.unshift(newPost);

          return commitPostsJson(data, sha, "Add post: " + title);
        });
      })
      .then(function () {
        showStatus("Post published successfully! Site will update in ~30 seconds.", "success");
        // Clear form
        document.getElementById("post-title").value = "";
        document.getElementById("post-body").value = "";
        document.getElementById("post-location").value = "";
        document.getElementById("post-date").value = new Date()
          .toISOString()
          .split("T")[0];
        document.getElementById("preview-area").style.display = "none";
      })
      .catch(function (err) {
        showStatus("Error publishing: " + err.message, "error");
        console.error(err);
      });
  }

  function resolveInstagramPlaceholders(body) {
    var regex = /\{\{instagram:(https?:\/\/[^\}]+)\}\}/g;
    var matches = [];
    var match;

    while ((match = regex.exec(body)) !== null) {
      matches.push({ placeholder: match[0], url: match[1] });
    }

    if (matches.length === 0) return Promise.resolve(body);

    var promises = matches.map(function (m) {
      return Instagram.fetchOEmbed(m.url)
        .then(function (html) {
          return { placeholder: m.placeholder, html: html };
        })
        .catch(function () {
          // Keep placeholder if oEmbed fails — main.js will try again at render time
          return { placeholder: m.placeholder, html: m.placeholder };
        });
    });

    return Promise.all(promises).then(function (results) {
      var output = body;
      results.forEach(function (r) {
        output = output.split(r.placeholder).join(r.html);
      });
      return output;
    });
  }

  function saveMarquee() {
    if (!authenticated) return;

    var text = document.getElementById("marquee-text-input").value.trim();
    if (!text) {
      showStatus("Marquee text cannot be empty.", "error");
      return;
    }

    showStatus("Saving marquee...", "info");

    fetchPostsJson()
      .then(function (result) {
        var data = result.data;
        var sha = result.sha;
        data.marquee = text;
        return commitPostsJson(data, sha, "Update marquee text");
      })
      .then(function () {
        showStatus("Marquee updated! Site will update in ~30 seconds.", "success");
      })
      .catch(function (err) {
        showStatus("Error saving marquee: " + err.message, "error");
        console.error(err);
      });
  }

  /* ---- GitHub API helpers ---- */

  function fetchPostsJson() {
    var url =
      "https://api.github.com/repos/" +
      CONFIG.repo +
      "/contents/" +
      CONFIG.postsFile +
      "?ref=" +
      CONFIG.branch;

    return fetch(url, {
      headers: {
        Authorization: "Bearer " + CONFIG.githubToken,
        Accept: "application/vnd.github.v3+json",
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API GET failed: " + res.status);
        return res.json();
      })
      .then(function (file) {
        var content = atob(file.content);
        var data = JSON.parse(content);
        return { data: data, sha: file.sha };
      });
  }

  function commitPostsJson(data, sha, message) {
    var url =
      "https://api.github.com/repos/" +
      CONFIG.repo +
      "/contents/" +
      CONFIG.postsFile;

    var content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + "\n")));

    return fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + CONFIG.githubToken,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        content: content,
        sha: sha,
        branch: CONFIG.branch,
      }),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.message || "GitHub API PUT failed");
        });
      }
      return res.json();
    });
  }

  /* ---- Utilities ---- */

  function showStatus(msg, type) {
    var el = document.getElementById("status-msg");
    if (!el) return;
    el.textContent = msg;
    el.className = "status-msg " + type;
    el.style.display = "block";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
