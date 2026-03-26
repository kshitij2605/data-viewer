import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { useChunkStore } from '../stores/chunkStore.ts';
import { withToken } from '../api/client.ts';

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 500;
const DEFAULT_HEIGHT = 180;
const CAROUSEL_PAGE_SIZE = 3;

const css = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-xs)',
  },
  container: {
    display: 'flex',
    gap: '14px',
    padding: '12px 14px',
    alignItems: 'flex-start',
    overflow: 'hidden',
    flex: 1,
    minHeight: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  sectionLabel: {
    fontSize: '9px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  pageThumbnail: {
    width: '200px',
    height: '140px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'box-shadow var(--transition-fast)',
  },
  placeholder: {
    width: '200px',
    height: '140px',
    borderRadius: 'var(--radius-sm)',
    border: '1.5px dashed var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
    background: 'var(--color-surface-inset)',
  },
  // Carousel styles
  carouselWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flex: 1,
    minWidth: 0,
  },
  carouselRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  carouselBtn: {
    width: '24px',
    height: '60px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
    padding: 0,
  },
  carouselBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  carouselTrack: {
    display: 'flex',
    gap: '6px',
    flex: 1,
    overflow: 'hidden',
  },
  miniThumb: {
    width: '80px',
    height: '60px',
    borderRadius: '3px',
    border: '1.5px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
  },
  miniThumbActive: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px var(--color-primary-ghost)',
  },
  // Chunk images section
  rightSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    minWidth: 0,
  },
  chunkGrid: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
    maxHeight: '140px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  chunkThumb: {
    width: '90px',
    height: '70px',
    borderRadius: '3px',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  searchInput: {
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '120px',
    transition: 'border-color var(--transition-fast)',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
  },
  pageIndicator: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
  },
} as const;

interface ThumbnailPanelProps {
  onImageClick?: (src: string, alt: string) => void;
}

export default function ThumbnailPanel({ onImageClick }: ThumbnailPanelProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const selectedChunk = useChunkStore((s) => s.selectedChunk);
  const [currentPage, setCurrentPage] = useState(1);
  const [chunkSearch, setChunkSearch] = useState('');
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [carouselStart, setCarouselStart] = useState(0);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const pageNum = selectedChunk?.page_number ?? currentPage;
  const numPages = doc?.num_pages ?? 0;

  // Scale factor: thumbnails grow proportionally with panel height
  // At DEFAULT_HEIGHT (180), scale=1. At MAX_HEIGHT (500), scale ~2.5
  const contentHeight = panelHeight - 32; // subtract padding + resize handle
  const scaleFactor = Math.max(0.6, contentHeight / (DEFAULT_HEIGHT - 32));
  const mainThumbW = Math.round(200 * scaleFactor);
  const mainThumbH = Math.round(140 * scaleFactor);
  const miniW = Math.round(80 * scaleFactor);
  const miniH = Math.round(60 * scaleFactor);
  const carouselBtnH = Math.round(60 * scaleFactor);

  const thumbnailUrl = doc
    ? withToken(`/api/documents/${doc.id}/page/${pageNum}/thumbnail`)
    : null;

  const layoutPages = useMemo(() => {
    if (!doc) return [];
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [doc, numPages]);

  const chunkImages = useMemo(() => {
    if (!selectedChunk || !doc) return [];
    return (selectedChunk.image_refs || []).filter((ref) =>
      chunkSearch ? ref.toLowerCase().includes(chunkSearch.toLowerCase()) : true,
    );
  }, [selectedChunk, doc, chunkSearch]);

  // Carousel navigation
  const canPrev = carouselStart > 0;
  const canNext = carouselStart + CAROUSEL_PAGE_SIZE < layoutPages.length;
  const visiblePages = layoutPages.slice(carouselStart, carouselStart + CAROUSEL_PAGE_SIZE);

  // Auto-scroll carousel to keep active page visible
  useEffect(() => {
    const activeIdx = layoutPages.indexOf(pageNum);
    if (activeIdx >= 0) {
      if (activeIdx < carouselStart) {
        setCarouselStart(activeIdx);
      } else if (activeIdx >= carouselStart + CAROUSEL_PAGE_SIZE) {
        setCarouselStart(Math.max(0, activeIdx - CAROUSEL_PAGE_SIZE + 1));
      }
    }
  }, [pageNum, layoutPages, carouselStart]);

  // Drag resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
  }, [panelHeight]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - dragStartY.current;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  return (
    <motion.div
      className="thumbnail-panel"
      style={{ ...css.wrapper, height: panelHeight }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div style={css.container}>
        {/* Left: Large page thumbnail */}
        <div className="thumb-section-page" style={css.section}>
          <span style={css.sectionLabel}>ページ {numPages > 0 ? `${pageNum}/${numPages}` : ''}</span>
          <AnimatePresence mode="wait">
            {thumbnailUrl ? (
              <motion.img
                key={`page-${pageNum}`}
                src={thumbnailUrl}
                alt={`Page ${pageNum}`}
                style={{ ...css.pageThumbnail, width: mainThumbW, height: mainThumbH }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => onImageClick?.(thumbnailUrl, `Page ${pageNum}`)}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
              />
            ) : (
              <div className="thumb-placeholder" style={{ ...css.placeholder, width: mainThumbW, height: mainThumbH }}>ドキュメントなし</div>
            )}
          </AnimatePresence>
        </div>

        {/* Center: Page carousel (prev/next 3 pages at a time) */}
        {layoutPages.length > 0 && (
          <div className="thumb-mini-grid" style={css.carouselWrap}>
            <div style={css.carouselRow}>
              <button
                style={{
                  ...css.carouselBtn,
                  height: carouselBtnH,
                  ...(canPrev ? {} : css.carouselBtnDisabled),
                }}
                onClick={() => canPrev && setCarouselStart(Math.max(0, carouselStart - CAROUSEL_PAGE_SIZE))}
                disabled={!canPrev}
                title="前へ"
              >
                &#x25C0;
              </button>
              <div style={css.carouselTrack}>
                <AnimatePresence mode="popLayout">
                  {visiblePages.map((p) => {
                    const isActive = p === pageNum;
                    const src = doc ? withToken(`/api/documents/${doc.id}/page/${p}/thumbnail`) : '';
                    return (
                      <motion.img
                        key={p}
                        src={src}
                        alt={`Page ${p}`}
                        style={{
                          ...css.miniThumb,
                          width: miniW,
                          height: miniH,
                          ...(isActive ? css.miniThumbActive : {}),
                        }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setCurrentPage(p)}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--color-text-muted)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border)';
                        }}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
              <button
                style={{
                  ...css.carouselBtn,
                  height: carouselBtnH,
                  ...(canNext ? {} : css.carouselBtnDisabled),
                }}
                onClick={() => canNext && setCarouselStart(carouselStart + CAROUSEL_PAGE_SIZE)}
                disabled={!canNext}
                title="次へ"
              >
                &#x25B6;
              </button>
            </div>
          </div>
        )}

        {/* Right: Chunk image thumbnails */}
        <div style={css.rightSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={css.sectionLabel}>チャンク画像</span>
            <input
              style={css.searchInput}
              placeholder="検索..."
              value={chunkSearch}
              onChange={(e) => setChunkSearch(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>
          <div style={css.chunkGrid}>
            {chunkImages.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '8px' }}>
                画像なし
              </div>
            ) : (
              chunkImages.map((ref) => {
                const imgSrc = doc ? withToken(`/api/documents/${doc.id}/images/${ref}`) : '';
                return (
                  <motion.img
                    key={ref}
                    src={imgSrc}
                    alt={ref}
                    style={css.chunkThumb}
                    whileHover={{ scale: 1.04, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    onClick={() => onImageClick?.(imgSrc, ref)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Draggable resize handle */}
      <div
        className={`resize-handle${isDragging ? ' active' : ''}`}
        onMouseDown={handleMouseDown}
      />
    </motion.div>
  );
}
