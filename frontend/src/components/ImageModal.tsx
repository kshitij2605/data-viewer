import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(26, 26, 46, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '24px',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    color: '#fff',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background var(--transition-fast)',
    zIndex: 10,
  },
  splitContainer: {
    display: 'flex',
    width: '100%',
    maxWidth: '1200px',
    height: '100%',
    gap: '0',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-xl)',
  },
  imagePane: {
    flex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a14',
    position: 'relative' as const,
    overflow: 'hidden',
    cursor: 'grab',
    minWidth: 0,
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  },
  captionPane: {
    flex: 1,
    minWidth: '240px',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '28px 24px',
    overflowY: 'auto' as const,
    background: 'var(--color-surface)',
    borderLeft: '1px solid var(--color-border)',
  },
  captionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    marginBottom: '12px',
  },
  captionText: {
    fontSize: '14px',
    lineHeight: 1.8,
    color: 'var(--color-text)',
  },
  zoomIndicator: {
    position: 'absolute' as const,
    bottom: '12px',
    left: '12px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
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
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
          >
            &#x2715;
          </button>

          <motion.div
            style={css.splitContainer}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left: Image */}
            <div
              style={{
                ...css.imagePane,
                cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
              }}
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
              {scale !== 1 && (
                <div style={css.zoomIndicator}>{Math.round(scale * 100)}%</div>
              )}
            </div>

            {/* Right: Caption */}
            <div style={css.captionPane}>
              <div style={css.captionLabel}>キャプション</div>
              <div style={css.captionText}>
                {alt || 'キャプションなし'}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
