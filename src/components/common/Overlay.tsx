import type { CSSProperties, ReactNode } from 'react';

interface OverlayProps {
  show: boolean;
  onClose: () => void;
  children: ReactNode;
  modalStyle?: CSSProperties;
  closeButton?: boolean;
}

export function Overlay({ show, onClose, children, modalStyle, closeButton = true }: OverlayProps) {
  return (
    <div className={`overlay${show ? ' show' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={modalStyle}>
        {closeButton && (
          <button className="modal-close" onClick={onClose} aria-label="Close">{'\u2715'}</button>
        )}
        {children}
      </div>
    </div>
  );
}
