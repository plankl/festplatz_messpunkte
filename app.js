/* ===== Festplatz Messpunkte – Leaflet Map + Auswertung ===== */

(function () {
  "use strict";

  // --- Tile-Layer: maximale Aufloesung ---
  const layers = {
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "&copy; Esri, Maxar, Earthstar Geographics",
        maxZoom: 21,
        maxNativeZoom: 19,
      }
    ),
    satellite_labels: L.layerGroup([
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19 }
      ),
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, opacity: 0.8 }
      ),
    ]),
    street: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 21,
        maxNativeZoom: 20,
      }
    ),
    topo: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 21,
        maxNativeZoom: 20,
      }
    ),
    osm: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 21,
        maxNativeZoom: 19,
      }
    ),
  };

  // --- Map: hoechste Zoomstufe erlauben ---
  const map = L.map("map", {
    center: [49.11016968965268, 11.684055672272553],
    zoom: 18,
    maxZoom: 21,
    layers: [layers.satellite],
    zoomControl: true,
  });

  // --- Layer-Switching ---
  const layerSelect = document.getElementById("layer-select");
  let activeLayer = layers.satellite;

  layerSelect.addEventListener("change", function () {
    if (activeLayer.removeFrom) {
      activeLayer.removeFrom(map);
    } else {
      map.removeLayer(activeLayer);
    }
    activeLayer = layers[this.value];
    activeLayer.addTo(map);
  });

  // --- Custom Marker Icon ---
  const markerIcon = L.divIcon({
    className: "custom-marker",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -12],
  });

  // --- Daten laden ---
  const countEl = document.getElementById("count");

  fetch("data/messpunkte.json?v=" + Date.now())
    .then((res) => {
      if (!res.ok) throw new Error("Daten konnten nicht geladen werden");
      return res.json();
    })
    .then((data) => {
      const punkte = data.messpunkte || [];
      countEl.textContent = punkte.length + " Punkt" + (punkte.length !== 1 ? "e" : "");

      if (punkte.length === 0) return;

      const bounds = [];

      punkte.forEach((p, idx) => {
        const latlng = [p.lat, p.lon];
        bounds.push(latlng);

        let timeStr = "";
        if (p.timestamp) {
          const d = new Date(p.timestamp);
          timeStr = d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        }

        const popup = `
          <div class="popup-id">#${p.id}</div>
          <div class="popup-title">${escapeHtml(p.name)}</div>
          ${p.description ? '<div class="popup-desc">' + escapeHtml(p.description) + "</div>" : ""}
          <div class="popup-coords">${p.lat.toFixed(8)}, ${p.lon.toFixed(8)}</div>
          ${p.altitude != null ? '<div class="popup-alt">Höhe: ' + p.altitude.toFixed(2) + " m ü. NN</div>" : ""}
          ${p.accuracy != null ? '<div class="popup-acc">Genauigkeit: ±' + p.accuracy.toFixed(1) + " m</div>" : ""}
          ${timeStr ? '<div class="popup-time">' + timeStr + "</div>" : ""}
          ${p.user ? '<div class="popup-user">Erfasst von: ' + escapeHtml(p.user) + "</div>" : ""}
        `;

        L.marker(latlng, { icon: markerIcon }).addTo(map).bindPopup(popup);

        // Verbindungslinien zwischen aufeinanderfolgenden Punkten
        if (idx > 0) {
          const prev = punkte[idx - 1];
          // Nur verbinden wenn Punkte nah beieinander (< 500m)
          const dist = haversine(prev.lat, prev.lon, p.lat, p.lon);
          if (dist < 500) {
            L.polyline([[prev.lat, prev.lon], latlng], {
              color: "#ffffff",
              weight: 1.5,
              opacity: 0.4,
              dashArray: "6,4",
            }).addTo(map);
          }
        }
      });

      // Karte auf alle Punkte zoomen
      if (bounds.length === 1) {
        map.setView(bounds[0], 19);
      } else {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
      }

      // Auswertung aufbauen
      buildAuswertung(punkte);
    })
    .catch((err) => {
      console.error("Fehler beim Laden der Messpunkte:", err);
      countEl.textContent = "Fehler beim Laden";
    });

  // --- Auswertung ---
  const panelEl = document.getElementById("auswertung");
  const contentEl = document.getElementById("auswertung-content");

  document.getElementById("btn-auswertung").addEventListener("click", () => {
    panelEl.classList.toggle("hidden");
  });
  document.getElementById("btn-close-panel").addEventListener("click", () => {
    panelEl.classList.add("hidden");
  });

  function buildAuswertung(punkte) {
    if (punkte.length === 0) {
      contentEl.innerHTML = "<p>Keine Messpunkte vorhanden.</p>";
      return;
    }

    // Statistiken
    const latMin = Math.min(...punkte.map((p) => p.lat));
    const latMax = Math.max(...punkte.map((p) => p.lat));
    const lonMin = Math.min(...punkte.map((p) => p.lon));
    const lonMax = Math.max(...punkte.map((p) => p.lon));

    // Gesamtdistanz und paarweise Distanzen
    let totalDist = 0;
    const distances = [];
    for (let i = 1; i < punkte.length; i++) {
      const d = haversine(punkte[i - 1].lat, punkte[i - 1].lon, punkte[i].lat, punkte[i].lon);
      distances.push(d);
      totalDist += d;
    }

    // Maximale Ausdehnung
    const spanNS = haversine(latMin, lonMin, latMax, lonMin);
    const spanEW = haversine(latMin, lonMin, latMin, lonMax);

    // Zeitraum
    const timestamps = punkte.filter((p) => p.timestamp).map((p) => new Date(p.timestamp));
    let zeitraum = "-";
    if (timestamps.length > 1) {
      const earliest = new Date(Math.min(...timestamps));
      const latest = new Date(Math.max(...timestamps));
      zeitraum = earliest.toLocaleDateString("de-DE") + " – " + latest.toLocaleDateString("de-DE");
    } else if (timestamps.length === 1) {
      zeitraum = timestamps[0].toLocaleDateString("de-DE");
    }

    // Infrastruktur-Typen zaehlen
    const infraTypes = {};
    punkte.forEach((p) => {
      const desc = (p.description || "").toLowerCase();
      ["strom", "wasser", "abwasser", "schmutzwasser", "revision"].forEach((t) => {
        if (desc.includes(t)) {
          infraTypes[t] = (infraTypes[t] || 0) + 1;
        }
      });
    });

    let html = `
      <div class="stats-grid">
        <div class="stat"><span class="stat-val">${punkte.length}</span><span class="stat-label">Messpunkte</span></div>
        <div class="stat"><span class="stat-val">${totalDist.toFixed(1)} m</span><span class="stat-label">Gesamtstrecke</span></div>
        <div class="stat"><span class="stat-val">${spanNS.toFixed(1)} m</span><span class="stat-label">Ausdehnung N–S</span></div>
        <div class="stat"><span class="stat-val">${spanEW.toFixed(1)} m</span><span class="stat-label">Ausdehnung O–W</span></div>
        <div class="stat"><span class="stat-val">${zeitraum}</span><span class="stat-label">Zeitraum</span></div>
      </div>
    `;

    // Infrastruktur-Übersicht
    if (Object.keys(infraTypes).length > 0) {
      html += '<h3>Infrastruktur</h3><div class="infra-tags">';
      for (const [type, count] of Object.entries(infraTypes).sort((a, b) => b[1] - a[1])) {
        html += '<span class="infra-tag">' + escapeHtml(type.charAt(0).toUpperCase() + type.slice(1)) + " (" + count + ")</span>";
      }
      html += "</div>";
    }

    // Tabelle
    html += `
      <h3>Alle Messpunkte</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Beschreibung</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Höhe</th>
              <th>±m</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
    `;

    punkte.forEach((p) => {
      const d = p.timestamp ? new Date(p.timestamp) : null;
      const dateStr = d ? d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "-";
      html += `
        <tr>
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.description || "-")}</td>
          <td class="mono">${p.lat.toFixed(8)}</td>
          <td class="mono">${p.lon.toFixed(8)}</td>
          <td class="mono">${p.altitude != null ? p.altitude.toFixed(2) : "-"}</td>
          <td class="mono">${p.accuracy != null ? "±" + p.accuracy.toFixed(1) : "-"}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    });

    html += "</tbody></table></div>";

    // Distanzen zwischen aufeinanderfolgenden Punkten
    if (distances.length > 0) {
      html += "<h3>Abstände (aufeinanderfolgend)</h3><div class='table-wrap'><table><thead><tr><th>Von</th><th>Nach</th><th>Distanz</th></tr></thead><tbody>";
      for (let i = 0; i < distances.length; i++) {
        html += `<tr><td>#${punkte[i].id} ${escapeHtml(punkte[i].name)}</td><td>#${punkte[i + 1].id} ${escapeHtml(punkte[i + 1].name)}</td><td class="mono">${distances[i].toFixed(2)} m</td></tr>`;
      }
      html += "</tbody></table></div>";
    }

    contentEl.innerHTML = html;
  }

  // --- Haversine Distanz in Metern ---
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // --- Drohnenfotos: Image-Overlays + Marker ---
  const FOTOS = [
    { file: "dji_fly_20260321_181834_189_1774021582162_photo.jpg", overlay: "dji_fly_20260321_181834_189_1774021582162_photo_overlay.jpg", lat: 49.11022356, lon: 11.68386842, alt: 73, label: "Foto 1 – Übersicht Ost-West", bounds: [[49.10964245, 11.68298510], [49.11080470, 11.68475177]] },
    { file: "dji_fly_20260321_181842_190_1774021581874_photo.jpg", overlay: "dji_fly_20260321_181842_190_1774021581874_photo_overlay.jpg", lat: 49.11034611, lon: 11.68405944, alt: 68, label: "Foto 2 – Nord-Süd Trasse", bounds: [[49.10980473, 11.68323694], [49.11088751, 11.68488198]] },
    { file: "dji_fly_20260321_181928_191_1774021581565_photo.jpg", overlay: "dji_fly_20260321_181928_191_1774021581565_photo_overlay.jpg", lat: 49.11010933, lon: 11.68432358, alt: 118, label: "Foto 3 – Gesamtübersicht", bounds: [[49.10917295, 11.68289170], [49.11104572, 11.68575546]] },
    { file: "dji_fly_20260321_182012_192_1774021581281_photo.jpg", overlay: "dji_fly_20260321_182012_192_1774021581281_photo_overlay.jpg", lat: 49.11006797, lon: 11.68415356, alt: 98, label: "Foto 4 – Trasse Süd", bounds: [[49.10929357, 11.68296760], [49.11084241, 11.68533956]] },
    { file: "dji_fly_20260321_182020_193_1774021581034_photo.jpg", overlay: "dji_fly_20260321_182020_193_1774021581034_photo_overlay.jpg", lat: 49.11029042, lon: 11.68383275, alt: 98, label: "Foto 5 – Baufeld West", bounds: [[49.10951098, 11.68265326], [49.11106989, 11.68501225]] },
    { file: "dji_fly_20260321_182032_194_1774021580783_photo.jpg", overlay: "dji_fly_20260321_182032_194_1774021580783_photo_overlay.jpg", lat: 49.11029044, lon: 11.68383275, alt: 98, label: "Foto 6 – Baufeld Detail", bounds: [[49.10952059, 11.68263834], [49.11106032, 11.68502717]] },
    { file: "dji_fly_20260321_182038_195_1774021580540_photo.jpg", overlay: "dji_fly_20260321_182038_195_1774021580540_photo_overlay.jpg", lat: 49.11029039, lon: 11.68383442, alt: 86, label: "Foto 7 – Graben komplett", bounds: [[49.10960405, 11.68281644], [49.11097678, 11.68485244]] },
    { file: "dji_fly_20260321_182042_196_1774021580281_photo.jpg", overlay: "dji_fly_20260321_182042_196_1774021580281_photo_overlay.jpg", lat: 49.11029033, lon: 11.68383392, alt: 85, label: "Foto 8 – Anschlussbereich", bounds: [[49.10960929, 11.68279971], [49.11097142, 11.68486814]] },
  ];

  // Image-Overlay Layer (nur das beste Übersichtsfoto als Standard-Overlay)
  const overlayGroup = L.layerGroup();
  let overlayVisible = false;
  let currentOverlayIdx = 2; // Foto 3 = beste Übersicht (höchste Flughöhe)

  function showOverlay(idx) {
    overlayGroup.clearLayers();
    currentOverlayIdx = idx;
    const f = FOTOS[idx];
    const imgOverlay = L.imageOverlay(
      "Fotos/overlay/" + f.overlay,
      f.bounds,
      { opacity: 0.75, interactive: false }
    );
    overlayGroup.addLayer(imgOverlay);
  }

  // Foto-Marker Layer
  const fotoMarkerGroup = L.layerGroup();

  const camIcon = L.divIcon({
    className: "cam-marker",
    html: "📷",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });

  FOTOS.forEach((f, idx) => {
    const m = L.marker([f.lat, f.lon], { icon: camIcon });
    m.bindPopup(
      '<div class="foto-popup">' +
        '<div class="popup-title">' + escapeHtml(f.label) + '</div>' +
        '<img src="Fotos/thumb/' + f.file + '" class="popup-thumb" data-idx="' + idx + '" />' +
        '<div class="popup-coords">' + f.lat.toFixed(8) + ", " + f.lon.toFixed(8) + '</div>' +
        '<div class="popup-alt">Flughöhe: ' + f.alt + ' m AGL</div>' +
        '<button class="overlay-btn" data-idx="' + idx + '">Als Overlay zeigen</button>' +
      '</div>',
      { maxWidth: 300 }
    );
    fotoMarkerGroup.addLayer(m);
  });

  // Button: Fotos ein/aus (zeigt Overlay + Marker)
  document.getElementById("btn-fotos").addEventListener("click", function () {
    overlayVisible = !overlayVisible;
    if (overlayVisible) {
      showOverlay(currentOverlayIdx);
      overlayGroup.addTo(map);
      fotoMarkerGroup.addTo(map);
      this.classList.add("active");
    } else {
      overlayGroup.removeFrom(map);
      fotoMarkerGroup.removeFrom(map);
      this.classList.remove("active");
    }
  });

  // Overlay-Wechsel per Popup-Button
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("overlay-btn")) {
      const idx = parseInt(e.target.dataset.idx, 10);
      showOverlay(idx);
      if (!overlayVisible) {
        overlayVisible = true;
        overlayGroup.addTo(map);
        document.getElementById("btn-fotos").classList.add("active");
      }
    }
  });

  // --- Opacity-Slider ---
  const slider = document.getElementById("overlay-opacity");
  if (slider) {
    slider.addEventListener("input", function () {
      overlayGroup.eachLayer(function (layer) {
        if (layer.setOpacity) layer.setOpacity(parseFloat(slider.value));
      });
    });
  }

  // --- Lightbox ---
  const lbEl = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCaption = document.getElementById("lb-caption");
  let lbIdx = 0;

  function openLightbox(idx) {
    lbIdx = idx;
    lbImg.src = "Fotos/web/" + FOTOS[idx].file;
    lbCaption.textContent = FOTOS[idx].label;
    lbEl.classList.remove("hidden");
  }

  function closeLightbox() {
    lbEl.classList.add("hidden");
    lbImg.src = "";
  }

  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  lbEl.addEventListener("click", function (e) {
    if (e.target === lbEl) closeLightbox();
  });
  document.getElementById("lb-prev").addEventListener("click", function () {
    openLightbox((lbIdx - 1 + FOTOS.length) % FOTOS.length);
  });
  document.getElementById("lb-next").addEventListener("click", function () {
    openLightbox((lbIdx + 1) % FOTOS.length);
  });

  // Klick auf Thumbnail in Popup oeffnet Lightbox
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("popup-thumb")) {
      openLightbox(parseInt(e.target.dataset.idx, 10));
    }
  });

  // Tastatur-Navigation
  document.addEventListener("keydown", function (e) {
    if (lbEl.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") openLightbox((lbIdx - 1 + FOTOS.length) % FOTOS.length);
    if (e.key === "ArrowRight") openLightbox((lbIdx + 1) % FOTOS.length);
  });

  // --- HTML escapen ---
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
})();
