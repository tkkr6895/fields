import React from 'react';

interface CaptureButtonProps {
  onClick: () => void;
}

const CaptureButton: React.FC<CaptureButtonProps> = ({ onClick }) => {
  return (
    <button
      className="capture-button"
      onClick={onClick}
      aria-label="Capture observation"
      title="Capture Observation"
    >
      📷
    </button>
  );
};

export default CaptureButton;
