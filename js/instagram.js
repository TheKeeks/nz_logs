/* ============================================
   Instagram oEmbed Helper
   ============================================ */

var Instagram = (function () {
  var OEMBED_BASE = "https://api.instagram.com/oembed?omitscript=true&url=";

  /**
   * Fetch oEmbed HTML for a given Instagram post URL.
   * Returns a Promise that resolves with the HTML string.
   */
  function fetchOEmbed(postUrl) {
    var url = OEMBED_BASE + encodeURIComponent(postUrl);
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Instagram oEmbed failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        return data.html || "";
      });
  }

  /**
   * Replace all {{instagram:URL}} placeholders in a body string
   * with the fetched oEmbed HTML.
   * Returns a Promise that resolves with the processed HTML string.
   */
  function resolveEmbeds(bodyHtml) {
    var regex = /\{\{instagram:(https?:\/\/[^\}]+)\}\}/g;
    var matches = [];
    var match;

    while ((match = regex.exec(bodyHtml)) !== null) {
      matches.push({ placeholder: match[0], url: match[1] });
    }

    if (matches.length === 0) {
      return Promise.resolve(bodyHtml);
    }

    var promises = matches.map(function (m) {
      return fetchOEmbed(m.url)
        .then(function (html) {
          return { placeholder: m.placeholder, html: html };
        })
        .catch(function () {
          return {
            placeholder: m.placeholder,
            html:
              '<p><a href="' +
              m.url +
              '">[View on Instagram]</a></p>',
          };
        });
    });

    return Promise.all(promises).then(function (results) {
      var output = bodyHtml;
      results.forEach(function (r) {
        output = output.split(r.placeholder).join(
          '<div class="instagram-embed">' + r.html + "</div>"
        );
      });
      return output;
    });
  }

  /**
   * Process Instagram embed.js to render any blockquotes on the page.
   */
  function processEmbeds() {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
    }
  }

  return {
    fetchOEmbed: fetchOEmbed,
    resolveEmbeds: resolveEmbeds,
    processEmbeds: processEmbeds,
  };
})();
