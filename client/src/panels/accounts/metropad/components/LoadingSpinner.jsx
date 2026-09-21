import React from 'react';

function LoadingSpinner({ message = 'Loading...', fullPage = false }) {
  return (
    <div className={`loading-spinner${fullPage ? ' full-page' : ''}`}>
      <div className="spinner" />
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
