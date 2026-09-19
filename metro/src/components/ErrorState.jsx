import React from 'react';

function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="error-state">
      <div className="error-state-icon">❌</div>
      <p className="error-state-message">{message}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorState;
