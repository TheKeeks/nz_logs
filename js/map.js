/* ============================================
   Map.js — Visit map powered by Leaflet + Nominatim
   Drops a star pin for every published post with a location.
   Popups link back to the post entry on the page.
   ============================================ */

(function () {
  var CACHE_PREFIX = "geocache_";
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  var GEOCODE_DELAY_MS = 1200; // Nominatim: max 1 req/sec

  /* ---- Icon factories ---- */

  function makeSpecialIcon() {
    // Star pin — used for locations that have a published blog post
    return L.divIcon({
      className: "map-pin-special",
      html: "&#9733;",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -13],
    });
  }

  function makePlainIcon() {
    // Dot pin — for visited places with no post (future use)
    return L.divIcon({
      className: "map-pin-plain",
      html: "&#9679;",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -9],
    });
  }

  /* ---- Geocoding with localStorage cache ---- */

  function getCached(location) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + location);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
      return [entry.lat, entry.lng];
    } catch (e) {
      return null;
    }
  }

  function setCached(location, lat, lng) {
    try {
      localStorage.setItem(
        CACHE_PREFIX + location,
        JSON.stringify({ lat: lat, lng: lng, ts: Date.now() })
      );
    } catch (e) {}
  }

  function geocode(location, callback) {
    var cached = getCached(location);
    if (cached) {
      callback(cached);
      return;
    }

    var url =
      "https://nominatim.openstreetmap.org/search?q=" +
      encodeURIComponent(location) +
      "&format=json&limit=1";

    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.length === 0) {
          callback(null);
          return;
        }
        var lat = parseFloat(data[0].lat);
        var lng = parseFloat(data[0].lon);
        setCached(location, lat, lng);
        callback([lat, lng]);
      })
      .catch(function () {
        callback(null);
      });
  }

  /* ---- Popup HTML ---- */

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str || ""));
    return div.innerHTML;
  }

  function buildPopup(posts) {
    var html = '<div class="map-popup">';
    posts.forEach(function (p) {
      html +=
        '<a href="#post-' +
        p.id +
        '">' +
        escapeHtml(p.title) +
        "</a><br>";
    });
    html += "</div>";
    return html;
  }

  /* ---- NZ geographic filter ----
     Pins outside this bounding box are skipped so the map stays
     focused on New Zealand and doesn't zoom out to show far-away
     departure cities (e.g. New York). */
  var NZ_BOUNDS = {
    latMin: -47.5,
    latMax: -34.0,
    lngMin: 166.0,
    lngMax: 178.6,
  };

  function inNZ(latlng) {
    return (
      latlng[0] >= NZ_BOUNDS.latMin &&
      latlng[0] <= NZ_BOUNDS.latMax &&
      latlng[1] >= NZ_BOUNDS.lngMin &&
      latlng[1] <= NZ_BOUNDS.lngMax
    );
  }

  /* ---- Map initialisation ---- */

  function initMap(posts) {
    var mapEl = document.getElementById("visit-map");
    if (!mapEl) return;

    var map = L.map("visit-map", { scrollWheelZoom: false });

    // CartoDB Positron tiles — clean, muted palette that suits a retro site
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
          ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 18,
      }
    ).addTo(map);

    // Default view: New Zealand, while pins load
    map.setView([-41.3, 172.5], 5);

    // Group published posts with locations by their location string
    var locationGroups = {};
    posts.forEach(function (post) {
      if (!post.published || !post.location) return;
      var loc = post.location;
      if (!locationGroups[loc]) locationGroups[loc] = [];
      locationGroups[loc].push(post);
    });

    var locKeys = Object.keys(locationGroups);
    if (locKeys.length === 0) return;

    // Fit bounds once all geocoding attempts complete
    var total = locKeys.length;
    var done = 0;
    var bounds = L.latLngBounds();

    locKeys.forEach(function (loc, i) {
      setTimeout(function () {
        geocode(loc, function (latlng) {
          done++;
          if (latlng && inNZ(latlng)) {
            bounds.extend(latlng);
            var posts = locationGroups[loc];

            // Every published post gets the special (star) icon.
            // Plain icon is available for future location-only entries.
            var hasBlogPost = posts.some(function (p) {
              return p.title;
            });
            var icon = hasBlogPost ? makeSpecialIcon() : makePlainIcon();

            var marker = L.marker(latlng, { icon: icon }).addTo(map);
            marker.bindPopup(buildPopup(posts));
          }

          if (done === total && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
          }
        });
      }, i * GEOCODE_DELAY_MS);
    });
  }

  /* ---- Bootstrap ---- */

  function bootstrap() {
    fetch("posts.json?t=" + Date.now())
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        initMap(data.posts || []);
      })
      .catch(function (err) {
        console.error("Map: could not load posts", err);
      });
  }

  // Support both synchronous and deferred (dynamic) script loading
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
