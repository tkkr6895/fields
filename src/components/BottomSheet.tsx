import React from 'react';

interface BottomSheetProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ title, children, onClose }) => {
  return (
    <div className="bottom-sheet">
      <div className="bottom-sheet-header">
        <h3>{title}</h3>
        <button className="bottom-sheet-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="bottom-sheet-content">
        {children}
      </div>
    </div>
  );
};

export default BottomSheet;
