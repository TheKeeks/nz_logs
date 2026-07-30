/* ============================================
   Admin.js — Post editor + GitHub API commits
   ============================================ */

var CONFIG = {
  repo: "TheKeeks/nz_logs",
  branch: "Main",
  postsFile: "posts.json",
  passwordHash:
    "1a5afeda973d776e31d1d7266f184468f84d99bed311d88d3dcb67015934f9f9",
};

function getToken() {
  return localStorage.getItem("gh_pat");
}

function authHeaders(extra) {
  var headers = { Accept: "application/vnd.github.v3+json" };
  var token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  if (extra) {
    for (var k in extra) headers[k] = extra[k];
  }
  return headers;
}

function promptForToken() {
  if (getToken()) return;
  var token = prompt("First-time setup: paste your GitHub Personal Access Token.\nThis is saved locally and never leaves your browser.");
  if (token) localStorage.setItem("gh_pat", token);
}

function clearToken() {
  localStorage.removeItem("gh_pat");
  promptForToken();
}

(function () {
  var authenticated = false;
  var editingPostId = null;
  var badTokenPrompted = false;

  // GitHub returns 401 when the stored PAT has expired or been revoked
  // (fine-grained tokens expire — this is the usual "admin stopped working" cause).
  function handleBadToken() {
    showStatus('GitHub token expired or invalid — click "Update GitHub Token" and paste a fresh one.', "error");
    if (badTokenPrompted) return;
    badTokenPrompted = true;
    var msg = getToken()
      ? "GitHub rejected your saved token — it has likely expired or been revoked.\n\nCreate a new fine-grained Personal Access Token (GitHub > Settings > Developer settings > Fine-grained tokens, Contents: Read and write on this repo) and paste it here:"
      : "No GitHub token found.\n\nPaste your GitHub Personal Access Token:";
    var token = prompt(msg);
    if (token && token.trim()) {
      localStorage.setItem("gh_pat", token.trim());
      badTokenPrompted = false;
      showStatus("Token updated — reloading posts...", "success");
      loadCurrentMarquee();
      loadPostsList();
    }
  }

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
    // Prompt for GitHub token on first-time setup
    promptForToken();

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
    document
      .getElementById("btn-update-token")
      .addEventListener("click", function () {
        clearToken();
        if (getToken()) {
          badTokenPrompted = false;
          showStatus("Token updated — reloading posts...", "success");
          loadCurrentMarquee();
          loadPostsList();
        }
      });
    document
      .getElementById("btn-insert-image")
      .addEventListener("click", function () {
        document.getElementById("image-file-input").click();
      });
    document
      .getElementById("image-file-input")
      .addEventListener("change", handleImageFileSelected);

    // Paste text+images from notes apps, screenshots, etc.
    document.getElementById("post-body").addEventListener("paste", function (e) {
      var imageFiles = [];

      // Collect ALL image files from clipboard items
      var items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.startsWith("image/")) {
            var f = items[i].getAsFile();
            if (f && f.size > 0) imageFiles.push(f);
          }
        }
      }

      // Fallback to clipboardData.files (some Android browsers)
      if (imageFiles.length === 0) {
        var files = e.clipboardData && e.clipboardData.files;
        if (files) {
          for (var j = 0; j < files.length; j++) {
            if (files[j].type.startsWith("image/") && files[j].size > 0) {
              imageFiles.push(files[j]);
            }
          }
        }
      }

      // Second fallback: extract data URI images from text/html (iOS Notes embeds images this way)
      if (imageFiles.length === 0) {
        var pastedHtml = e.clipboardData && e.clipboardData.getData("text/html");
        if (pastedHtml) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(pastedHtml, "text/html");
          var imgs = doc.querySelectorAll("img[src^='data:image/']");
          imgs.forEach(function (img) {
            var mimeMatch = img.src.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (!mimeMatch) return;
            var mime = mimeMatch[1];
            var binary = atob(mimeMatch[2]);
            var bytes = new Uint8Array(binary.length);
            for (var k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
            var blob = new Blob([bytes], { type: mime });
            if (blob.size > 0) imageFiles.push(new File([blob], "image.png", { type: mime }));
          });
        }
      }

      // No images — let the browser handle the plain text paste normally
      if (imageFiles.length === 0) return;

      e.preventDefault();

      // Grab any text that was pasted alongside the images
      var pastedText = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";

      var textarea = document.getElementById("post-body");
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var before = textarea.value.substring(0, start);
      var after = textarea.value.substring(end);

      // Insert the pasted text first, then images will be appended after it
      if (pastedText) {
        textarea.value = before + pastedText + after;
        textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
      }

      // Upload images sequentially to avoid GitHub API secondary rate limits
      var imageCount = imageFiles.length;
      var uploadedCount = 0;
      var failedCount = 0;

      var chain = Promise.resolve();
      imageFiles.forEach(function (file, idx) {
        chain = chain.then(function () {
          showStatus("Uploading image " + (idx + 1) + " of " + imageCount + "...", "info");
          return uploadImageToGitHub(file)
            .then(function (imagePath) {
              insertImageHtmlAtCursor(imagePath, "");
              uploadedCount++;
            })
            .catch(function (err) {
              failedCount++;
              console.warn("Image upload failed:", err.message);
            });
        });
      });
      chain.then(function () {
        var msg = uploadedCount + " image(s) uploaded";
        if (failedCount > 0) msg += ", " + failedCount + " failed";
        showStatus(msg, failedCount > 0 ? "error" : "success");
      });
    });

    // Load current marquee text and posts list
    loadCurrentMarquee();
    loadPostsList();
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

  function loadPostsList() {
    var container = document.getElementById("posts-list");
    if (!container) return;

    fetchPostsJson().then(function (result) {
      var posts = (result.data && result.data.posts) || [];
      if (posts.length === 0) {
        container.innerHTML = '<p style="color:#888; font-style:italic;">No posts yet.</p>';
        return;
      }

      var html = "";
      posts.forEach(function (post) {
        html += '<div style="border-bottom:1px solid #c0c0c0; padding:4px 0; display:flex; justify-content:space-between; align-items:center;">';
        html += '<div><strong>' + escapeHtml(post.title) + '</strong>';
        html += ' <span style="color:#666; font-size:11px;">(' + escapeHtml(post.date) + ')</span>';
        if (post.location) html += ' <span style="color:#336633; font-size:11px;">' + escapeHtml(post.location) + '</span>';
        html += '</div>';
        html += '<div>';
        html += '<button class="btn" onclick="window._editPost(\'' + escapeHtml(post.id) + '\')">Edit</button> ';
        html += '<button class="btn" onclick="window._deletePost(\'' + escapeHtml(post.id) + '\')">Delete</button>';
        html += '</div></div>';
      });
      container.innerHTML = html;
    }).catch(function (err) {
      container.innerHTML = '<p style="color:#cc0000;">Failed to load posts: ' + escapeHtml(err.message) + '</p>';
    });
  }

  window._editPost = function (postId) {
    fetchPostsJson().then(function (result) {
      var posts = (result.data && result.data.posts) || [];
      var post = null;
      for (var i = 0; i < posts.length; i++) {
        if (posts[i].id === postId) { post = posts[i]; break; }
      }
      if (!post) {
        showStatus("Post not found.", "error");
        return;
      }

      document.getElementById("post-title").value = post.title || "";
      document.getElementById("post-location").value = post.location || "";
      document.getElementById("post-date").value = post.date || "";
      document.getElementById("post-body").value = (post.body || "").replace(/<br>/g, "\n");

      editingPostId = postId;
      document.getElementById("btn-publish").textContent = "Update Post";
      document.getElementById("btn-cancel-edit").style.display = "inline-block";

      showStatus("Editing: " + post.title + ". Make changes and click Update Post.", "info");
      window.scrollTo(0, 0);
    });
  };

  window._cancelEdit = function () {
    editingPostId = null;
    document.getElementById("post-title").value = "";
    document.getElementById("post-location").value = "";
    document.getElementById("post-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("post-body").value = "";
    document.getElementById("btn-publish").textContent = "Publish Post";
    document.getElementById("btn-cancel-edit").style.display = "none";
    document.getElementById("preview-area").style.display = "none";
    showStatus("Edit cancelled.", "info");
  };

  window._deletePost = function (postId) {
    if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) return;

    showStatus("Deleting post...", "info");

    fetchPostsJson().then(function (result) {
      var data = result.data;
      var sha = result.sha;
      var posts = data.posts || [];
      var title = "";

      data.posts = posts.filter(function (p) {
        if (p.id === postId) { title = p.title; return false; }
        return true;
      });

      return commitPostsJson(data, sha, "Delete post: " + title);
    }).then(function () {
      showStatus("Post deleted. Site will update in ~30 seconds.", "success");
      if (editingPostId === postId) window._cancelEdit();
      loadPostsList();
    }).catch(function (err) {
      showStatus("Error deleting: " + err.message, "error");
    });
  };

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

  function handleImageFileSelected(event) {
    var file = event.target.files[0];
    event.target.value = ""; // reset so same file can be re-selected
    if (!file || !file.type.startsWith("image/")) {
      showStatus("Please select an image file.", "error");
      return;
    }
    var caption = prompt("Enter a caption for this image (or leave blank):") || "";
    showStatus("Uploading image...", "info");
    uploadImageToGitHub(file)
      .then(function (imagePath) {
        insertImageHtmlAtCursor(imagePath, caption);
        showStatus("Image uploaded and inserted!", "success");
      })
      .catch(function (err) {
        showStatus("Image upload failed: " + err.message, "error");
      });
  }

  function uploadImageToGitHub(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result.split(",")[1]; // strip data URI prefix
        var timestamp = Date.now();
        var rawName = (file.name && file.name !== "undefined") ? file.name : "image.png";
        var safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
        var filename = timestamp + "_" + safeName;
        var url =
          "https://api.github.com/repos/" +
          CONFIG.repo +
          "/contents/images/" +
          filename;
        fetch(url, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: "Add image: " + filename,
            content: base64,
            branch: CONFIG.branch,
          }),
        })
          .then(function (res) {
            if (res.status === 401) {
              handleBadToken();
              throw new Error("GitHub token expired or invalid (401).");
            }
            if (!res.ok) {
              return res.json().then(function (err) {
                throw new Error(err.message || "Upload failed: " + res.status);
              });
            }
            return res.json();
          })
          .then(function () {
            resolve("images/" + filename);
          })
          .catch(reject);
      };
      reader.onerror = function () {
        reject(new Error("Failed to read file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function insertImageHtmlAtCursor(imagePath, caption) {
    var textarea = document.getElementById("post-body");
    var altText = caption || "Image";
    // Single line — avoids extra <br> tags when publishPost runs replace(/\n/g, "<br>")
    var figureHtml =
      '<figure class="post-image"><img src="' +
      imagePath +
      '" alt="' +
      altText +
      '"><figcaption><strong>' +
      caption +
      "</strong></figcaption></figure>";
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var text = textarea.value;
    textarea.value =
      text.substring(0, start) + "\n" + figureHtml + "\n" + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd =
      start + figureHtml.length + 2;
    textarea.focus();
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

    body = body.replace(/\n/g, "<br>");

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

    body = body.replace(/\n/g, "<br>");

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

          if (editingPostId) {
            // Update existing post
            for (var i = 0; i < data.posts.length; i++) {
              if (data.posts[i].id === editingPostId) {
                data.posts[i] = newPost;
                data.posts[i].id = editingPostId;
                break;
              }
            }
            return commitPostsJson(data, sha, "Edit post: " + title);
          } else {
            data.posts.unshift(newPost);
            return commitPostsJson(data, sha, "Add post: " + title);
          }
        });
      })
      .then(function () {
        var msg = editingPostId ? "Post updated" : "Post published";
        showStatus(msg + " successfully! Site will update in ~30 seconds.", "success");
        // Clear form and reset editing state
        editingPostId = null;
        document.getElementById("post-title").value = "";
        document.getElementById("post-body").value = "";
        document.getElementById("post-location").value = "";
        document.getElementById("post-date").value = new Date()
          .toISOString()
          .split("T")[0];
        document.getElementById("preview-area").style.display = "none";
        document.getElementById("btn-publish").textContent = "Publish Post";
        document.getElementById("btn-cancel-edit").style.display = "none";
        loadPostsList();
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

    return fetch(url, { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) {
          handleBadToken();
          throw new Error("GitHub token expired or invalid (401).");
        }
        if (!res.ok) throw new Error("GitHub API GET failed: " + res.status);
        return res.json();
      })
      .then(function (file) {
        var content = decodeURIComponent(escape(atob(file.content)));
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
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: message,
        content: content,
        sha: sha,
        branch: CONFIG.branch,
      }),
    }).then(function (res) {
      if (res.status === 401) {
        handleBadToken();
        throw new Error("GitHub token expired or invalid (401).");
      }
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
