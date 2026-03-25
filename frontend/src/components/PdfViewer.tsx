import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  dialog: {
    background: 'var(--color-surface)',
    borderRadius: '8px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
    width: '900px',
    maxWidth: '95vw',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderTop: '3px solid var(--color-primary)',
  },
  toolbar: {
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    flexShrink: 0,
  },
  toolbarGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toolBtn: {
    padding: '4px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-surface)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
    display: 'flex',
    alignItems: 'center',
  },
  pageInput: {
    width: '50px',
    padding: '4px 6px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '12px',
    textAlign: 'center' as const,
    fontFamily: 'inherit',
    outline: 'none',
  },
  pageLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  zoomLabel: {
    fontSize: '12px',
    color: 'var(--color-text)',
    minWidth: '40px',
    textAlign: 'center' as const,
  },
  closeBtn: {
    padding: '4px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '16px',
    background: '#e5e5e5',
  },
  canvas: {
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    background: '#fff',
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
} as const;

interface PdfViewerProps {
  open: boolean;
  documentId: number | null;
  onClose: () => void;
}

export default function PdfViewer({ open, documentId, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [pageInputVal, setPageInputVal] = useState('1');
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);

  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    // Cancel any ongoing render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
    }

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch {
      // render cancelled or error
    }
  }, [zoom]);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    setCurrentPage(1);
    setPageInputVal('1');
    setZoom(1.0);

    const url = `/api/documents/${documentId}/layout-pdf`;
    const loadingTask = pdfjsLib.getDocument(url);

    loadingTask.promise
      .then((doc) => {
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
        renderPage(1);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      loadingTask.destroy();
      pdfDocRef.current = null;
    };
  }, [open, documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pdfDocRef.current && !loading) {
      renderPage(currentPage);
    }
  }, [currentPage, zoom, loading, renderPage]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(numPages, p));
    setCurrentPage(clamped);
    setPageInputVal(String(clamped));
  };

  const handlePageInput = () => {
    const n = parseInt(pageInputVal, 10);
    if (!isNaN(n)) goToPage(n);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={css.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            style={css.dialog}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={css.toolbar}>
              <div style={css.toolbarGroup}>
                <button
                  style={css.toolBtn}
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  &#9664;
                </button>
                <input
                  style={css.pageInput}
                  value={pageInputVal}
                  onChange={(e) => setPageInputVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageInput(); }}
                  onBlur={handlePageInput}
                />
                <span style={css.pageLabel}>/ {numPages}</span>
                <button
                  style={css.toolBtn}
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                >
                  &#9654;
                </button>
              </div>

              <div style={css.toolbarGroup}>
                <button
                  style={css.toolBtn}
                  onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                >
                  &minus;
                </button>
                <span style={css.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button
                  style={css.toolBtn}
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                >
                  +
                </button>
                <button
                  style={css.toolBtn}
                  onClick={() => setZoom(1.0)}
                  title="フィット"
                >
                  Fit
                </button>
              </div>

              <button style={css.closeBtn} onClick={onClose}>
                閉じる
              </button>
            </div>

            <div style={css.canvasContainer}>
              {loading ? (
                <div style={css.loading}>PDF読み込み中...</div>
              ) : (
                <canvas ref={canvasRef} style={css.canvas} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
