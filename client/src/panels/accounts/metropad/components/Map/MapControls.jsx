import React, { useCallback } from 'react';
import { useMap } from 'react-leaflet';

const FIT_BOUNDS = [
  [18.89, 72.8],
  [19.31, 72.95],
];

function MapControls({ fullscreen, onToggleFullscreen }) {
  const map = useMap();

  const resetView = useCallback(() => {
    map.fitBounds(FIT_BOUNDS, { padding: [24, 24] });
  }, [map]);

  return (
    <div className="metro-map-controls">
      <button type="button" className="metro-ctrl-btn" title="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" className="metro-ctrl-btn" title="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
      <button type="button" className="metro-ctrl-btn" title="Reset view" onClick={resetView}>
        ⌂
      </button>
      <button
        type="button"
        className="metro-ctrl-btn"
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={onToggleFullscreen}
      >
        {fullscreen ? '✕' : '⛶'}
      </button>
    </div>
  );
}

export default MapControls;