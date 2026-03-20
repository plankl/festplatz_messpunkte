/* ===== Festplatz Messpunkte – Leaflet Map ===== */

(function () {
  "use strict";

  // --- Tile-Layer Definitionen ---
  const layers = {
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }
    ),
    street: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 20,
      }
    ),
    topo: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 20,
      }
    ),
  };

  // --- Map initialisieren ---
  const map = L.map("map", {
    center: [49.11016968965268, 11.684055672272553],
    zoom: 16,
    layers: [layers.satellite],
    zoomControl: true,
  });

  // --- Layer-Switching ---
  const layerSelect = document.getElementById("layer-select");
  let activeLayer = layers.satellite;

  layerSelect.addEventListener("change", function () {
    map.removeLayer(activeLayer);
    activeLayer = layers[this.value];
    map.addLayer(activeLayer);
  });

  // --- Custom Marker Icon ---
  const markerIcon = L.divIcon({
    className: "custom-marker",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });

  // --- Daten laden & Marker setzen ---
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

      punkte.forEach((p) => {
        const latlng = [p.lat, p.lon];
        bounds.push(latlng);

        // Zeitstempel formatieren
        let timeStr = "";
        if (p.timestamp) {
          const d = new Date(p.timestamp);
          timeStr = d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        }

        const popup = `
          <div class="popup-title">${escapeHtml(p.name)}</div>
          ${p.description ? '<div class="popup-desc">' + escapeHtml(p.description) + "</div>" : ""}
          <div class="popup-coords">${p.lat.toFixed(8)}, ${p.lon.toFixed(8)}</div>
          ${p.altitude != null ? '<div class="popup-alt">Höhe: ' + p.altitude.toFixed(1) + " m</div>" : ""}
          ${p.accuracy != null ? '<div class="popup-acc">Genauigkeit: ±' + p.accuracy.toFixed(1) + " m</div>" : ""}
          ${timeStr ? '<div class="popup-time">' + timeStr + "</div>" : ""}
        `;

        L.marker(latlng, { icon: markerIcon }).addTo(map).bindPopup(popup);
      });

      // Karte auf alle Punkte zoomen
      if (bounds.length === 1) {
        map.setView(bounds[0], 17);
      } else {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    })
    .catch((err) => {
      console.error("Fehler beim Laden der Messpunkte:", err);
      countEl.textContent = "Fehler beim Laden";
    });

  // --- HTML escapen ---
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
})();
