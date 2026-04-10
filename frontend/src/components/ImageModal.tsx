import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  navBtn: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '40px',
    height: '64px',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    color: '#fff',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    transition: 'background var(--transition-fast)',
    backdropFilter: 'blur(4px)',
  },
  pageIndicator: {
    position: 'absolute' as const,
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '4px 14px',
    borderRadius: '12px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    zIndex: 10,
    whiteSpace: 'nowrap' as const,
  },
} as const;

const mdStyles = `
.modal-md h1 { font-size: 1.3em; font-weight: 700; font-family: var(--font-display); margin: 0.8em 0 0.4em; color: var(--color-text); border-bottom: 1px solid var(--color-border-light); padding-bottom: 0.3em; }
.modal-md h2 { font-size: 1.15em; font-weight: 700; font-family: var(--font-display); margin: 0.6em 0 0.3em; color: var(--color-text); }
.modal-md h3 { font-size: 1em; font-weight: 600; font-family: var(--font-display); margin: 0.4em 0 0.2em; }
.modal-md p { margin: 0.4em 0; line-height: 1.7; }
.modal-md ul, .modal-md ol { margin: 0.3em 0; padding-left: 1.3em; }
.modal-md li { margin: 0.15em 0; }
.modal-md table { border-collapse: collapse; margin: 0.6em 0; width: 100%; font-size: 12px; }
.modal-md th, .modal-md td { border: 1px solid var(--color-border); padding: 6px 10px; text-align: left; }
.modal-md th { background: var(--color-surface-raised); font-weight: 600; font-family: var(--font-display); font-size: 11px; }
.modal-md code { background: var(--color-surface-inset); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; font-family: var(--font-mono); }
.modal-md blockquote { border-left: 3px solid var(--color-primary); padding-left: 12px; margin: 0.4em 0; color: var(--color-text-secondary); }
.modal-md img { max-width: 100%; border-radius: 4px; margin: 0.3em 0; }
`;

interface ImageModalProps {
  open: boolean;
  src: string;
  alt?: string;
  pageMarkdown?: string;
  pageNum?: number;
  numPages?: number;
  onPageChange?: (page: number) => void;
  onClose: () => void;
}

export default function ImageModal({ open, src, alt, pageMarkdown, pageNum, numPages, onPageChange, onClose }: ImageModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const slideDirRef = useRef(0);
  const [slideDir, setSlideDir] = useState(0);

  const goToPage = useCallback((page: number) => {
    if (!onPageChange || !pageNum) return;
    const dir = page > pageNum ? 1 : -1;
    slideDirRef.current = dir;
    setSlideDir(dir);
    onPageChange(page);
  }, [onPageChange, pageNum]);

  useEffect(() => {
    if (open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open, src]);

  const isPageMode = !!(pageNum && numPages && onPageChange);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (isPageMode) {
        if (e.key === 'ArrowLeft' && pageNum! > 1) goToPage(pageNum! - 1);
        if (e.key === 'ArrowRight' && pageNum! < numPages!) goToPage(pageNum! + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isPageMode, pageNum, numPages, onPageChange]);

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
            {/* Left: Image with slide animation */}
            <div
              style={{
                ...css.imagePane,
                cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
            >
              <AnimatePresence mode="wait" initial={false} custom={slideDirRef.current}>
                <motion.img
                  key={src}
                  custom={slideDirRef.current}
                  src={src}
                  alt={alt || ''}
                  style={css.image}
                  initial={(dir: number) => isPageMode ? { x: dir * 300, opacity: 0 } : false}
                  animate={{ x: 0, opacity: 1, scale, translateX: position.x / scale, translateY: position.y / scale }}
                  exit={(dir: number) => isPageMode ? { x: dir * -300, opacity: 0 } : { opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  draggable={false}
                />
              </AnimatePresence>
              {scale !== 1 && (
                <div style={css.zoomIndicator}>{Math.round(scale * 100)}%</div>
              )}
              {isPageMode && (
                <>
                  <button
                    style={{
                      ...css.navBtn,
                      left: '12px',
                      opacity: pageNum! > 1 ? 1 : 0.3,
                      cursor: pageNum! > 1 ? 'pointer' : 'default',
                    }}
                    onClick={() => { if (pageNum! > 1) goToPage(pageNum! - 1); }}
                    title="前のページ"
                  >
                    &#x25C0;
                  </button>
                  <button
                    style={{
                      ...css.navBtn,
                      right: '12px',
                      opacity: pageNum! < numPages! ? 1 : 0.3,
                      cursor: pageNum! < numPages! ? 'pointer' : 'default',
                    }}
                    onClick={() => { if (pageNum! < numPages!) goToPage(pageNum! + 1); }}
                    title="次のページ"
                  >
                    &#x25B6;
                  </button>
                  <div style={css.pageIndicator}>
                    {pageNum} / {numPages} ページ
                  </div>
                </>
              )}
            </div>

            {/* Right: Caption / Page content with slide animation */}
            <div style={css.captionPane}>
              <style>{mdStyles}</style>
              <AnimatePresence mode="wait" initial={false} custom={slideDirRef.current}>
                <motion.div
                  key={`caption-${pageNum || alt}`}
                  custom={slideDirRef.current}
                  initial={(dir: number) => isPageMode ? { y: dir * 40, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  exit={(dir: number) => isPageMode ? { y: dir * -40, opacity: 0 } : { opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  {pageMarkdown ? (
                    <>
                      <div style={css.captionLabel}>
                        {pageMarkdown.trimStart().startsWith('<table') ? '抽出テーブル' : 'ページ内容'}
                      </div>
                      <div className="modal-md" style={{ ...css.captionText, fontSize: '13px' }}>
                        {pageMarkdown.trimStart().startsWith('<table') ? (
                          <div dangerouslySetInnerHTML={{ __html: pageMarkdown }} />
                        ) : (
                          <Markdown remarkPlugins={[remarkGfm]}>{pageMarkdown}</Markdown>
                        )}
                      </div>
                    </>
                  ) : (
                    (() => {
                    const parts = (alt || '').split('\n');
                    const imageName = parts[0] || '';
                    const caption = parts.slice(1).join('\n').trim();
                    return (
                      <>
                        {imageName && (
                          <>
                            <div style={css.captionLabel}>画像名</div>
                            <div style={{ ...css.captionText, fontSize: '13px', fontFamily: 'var(--font-mono)', marginBottom: '16px', wordBreak: 'break-all' as const }}>
                              {imageName}
                            </div>
                          </>
                        )}
                        <div style={css.captionLabel}>キャプション</div>
                        <div style={css.captionText}>
                          {caption || 'キャプションなし'}
                        </div>
                      </>
                    );
                  })()
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
