import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    cursor: 'zoom-out',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 100ms ease',
    zIndex: 10,
  },
  imageContainer: {
    position: 'relative' as const,
    maxWidth: '90vw',
    maxHeight: '85vh',
    cursor: 'grab',
    overflow: 'hidden',
  },
  image: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain' as const,
    borderRadius: '4px',
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  },
  info: {
    position: 'absolute' as const,
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
    zIndex: 10,
  },
  zoomIndicator: {
    position: 'absolute' as const,
    top: '16px',
    left: '16px',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    zIndex: 10,
  },
} as const;

interface ImageModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageModal({ open, src, alt, onClose }: ImageModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open, src]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setScale((s) => {
      const next = s + (e.deltaY < 0 ? 0.2 : -0.2);
      return Math.max(0.5, Math.min(5, next));
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({
      x: posStart.current.x + dx,
      y: posStart.current.y + dy,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={css.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <button
            style={css.closeBtn}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          >
            &#x2715;
          </button>

          {scale !== 1 && (
            <div style={css.zoomIndicator}>{Math.round(scale * 100)}%</div>
          )}

          <motion.div
            style={{
              ...css.imageContainer,
              cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'zoom-out',
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
          >
            <img
              src={src}
              alt={alt || ''}
              style={{
                ...css.image,
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: isDragging.current ? 'none' : 'transform 100ms ease',
              }}
              draggable={false}
            />
          </motion.div>

          {alt && <div style={css.info}>{alt}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
