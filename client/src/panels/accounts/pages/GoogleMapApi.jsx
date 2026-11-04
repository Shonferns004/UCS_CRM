import { useEffect, useRef, useState } from "react";

export default function GoogleMapApi() {
  const mapRef = useRef(null);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setError("Set VITE_GOOGLE_MAPS_API_KEY in client/.env to enable the map.");
      return;
    }
    const init = () => {
      if (!mapRef.current || !window.google?.maps) return;
      new window.google.maps.Map(mapRef.current, {
        center: { lat: 28.6139, lng: 77.209 },
        zoom: 12,
      });
      setLoaded(true);
    };
    if (window.google?.maps) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.onload = init;
    script.onerror = () => setError("Failed to load Google Maps script.");
    document.head.appendChild(script);
  }, []);

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>Google Map API</h2>
      <p style={{ color: "var(--ink-soft)" }}>
        Integration instructions and live map preview.
      </p>
      {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
      <div
        ref={mapRef}
        style={{ width: "100%", height: 400, marginTop: 16, borderRadius: 8, background: "#e5e7eb" }}
      />
      {loaded && <p style={{ marginTop: 8, color: "#065f46" }}>Map loaded successfully.</p>}
      <div style={{ marginTop: 24 }}>
        <h3>API Instructions</h3>
        <ol style={{ lineHeight: 1.8 }}>
          <li>Create a Google Cloud project and enable the Maps JavaScript API.</li>
          <li>Create an API key and restrict it to your domains.</li>
          <li>Add <code>VITE_GOOGLE_MAPS_API_KEY=your_key</code> to <code>client/.env</code>.</li>
          <li>Restart the dev server and open this page.</li>
        </ol>
      </div>
    </div>
  );
}

