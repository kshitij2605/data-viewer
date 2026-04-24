import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { useChunkStore } from '../stores/chunkStore.ts';
import { withToken } from '../api/client.ts';
import { getPageMarkdown } from '../api/documents.ts';

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
    border: '1px solid var(--color-border-light)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-sm)',
  },
  container: {
    display: 'flex',
    gap: '16px',
    padding: '14px 16px 14px',
    alignItems: 'stretch',
    overflow: 'hidden',
    flex: 1,
    minHeight: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    minHeight: 0,
  },
  sectionLabel: {
    fontSize: 'var(--text-xxs)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.8px',
  },
  pageThumbnail: {
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'box-shadow var(--transition-normal)',
    minHeight: 0,
  },
  placeholder: {
    borderRadius: 'var(--radius-sm)',
    border: '1.5px dashed var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-faint)',
    fontSize: 'var(--text-sm)',
    background: 'var(--color-surface-inset)',
    flex: 1,
    minHeight: 0,
  },
  // Carousel styles
  carouselWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: 0,
  },
  carouselRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: 'fit-content',
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
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    transition: 'all var(--transition-normal)',
    flexShrink: 0,
    padding: 0,
  },
  carouselBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  carouselViewport: {
    overflow: 'hidden',
  },
  carouselTrack: {
    display: 'flex',
    gap: '6px',
  },
  miniThumb: {
    width: '80px',
    height: '60px',
    borderRadius: 'var(--radius-xs)',
    border: '1.5px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    flexShrink: 0,
  },
  miniThumbActive: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px var(--color-primary-ghost), 0 2px 8px rgba(230, 57, 70, 0.1)',
  },
  carouselIndicator: {
    fontSize: 'var(--text-xxs)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-faint)',
    letterSpacing: '0.5px',
    paddingLeft: '30px',
  },
  divider: {
    width: '1px',
    alignSelf: 'stretch',
    background: 'var(--color-border)',
    flexShrink: 0,
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
    gap: '8px',
    flexWrap: 'wrap' as const,
    maxHeight: '140px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  chunkThumb: {
    width: '90px',
    height: '70px',
    borderRadius: 'var(--radius-xs)',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
  },
  searchInput: {
    padding: '5px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'inherit',
    outline: 'none',
    width: '120px',
    transition: 'all var(--transition-normal)',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
  },
  pageIndicator: {
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-faint)',
    textAlign: 'center' as const,
  },
} as const;

interface ThumbnailPanelProps {
  onImageClick?: (src: string, alt: string, pageMarkdown?: string, pageNum?: number, numPages?: number) => void;
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

  // When user manually picks a page from carousel, that takes priority
  const [manualPage, setManualPage] = useState<number | null>(null);
  const pageNum = manualPage ?? selectedChunk?.page_number ?? currentPage;

  // Reset manual page when a new chunk is selected
  useEffect(() => {
    if (selectedChunk) setManualPage(null);
  }, [selectedChunk?.id]);
  const numPages = doc?.num_pages ?? 0;

  // Detect orientation from first page thumbnail
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    if (!doc || numPages === 0) return;
    const img = new Image();
    img.src = withToken(`/api/documents/${doc.id}/page/1/thumbnail`);
    img.onload = () => {
      setIsPortrait(img.naturalHeight > img.naturalWidth);
    };
  }, [doc?.id, numPages]);

  // Scale factor: thumbnails grow proportionally with panel height
  const contentHeight = panelHeight - 32;
  const scaleFactor = Math.max(0.6, contentHeight / (DEFAULT_HEIGHT - 32));
    const miniW = Math.round((isPortrait ? 50 : 80) * scaleFactor);
  const miniH = Math.round((isPortrait ? 70 : 60) * scaleFactor);
  const carouselBtnH = Math.round((isPortrait ? 70 : 60) * scaleFactor);

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

  // Extract caption for a given image ref from chunk markdown content
  const getCaptionForImage = useCallback((ref: string): string => {
    if (!selectedChunk) return '';
    const lines = selectedChunk.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`images/${ref}`) || lines[i].includes(`(${ref})`)) {
        // Look ahead for italic caption (skip blank lines)
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length) {
          const m = lines[j].trim().match(/^\*([^*]+)\*$/);
          if (m) return m[1];
        }
      }
    }
    return '';
  }, [selectedChunk]);

  // Carousel navigation
  const canPrev = carouselStart > 0;
  const canNext = carouselStart + CAROUSEL_PAGE_SIZE < layoutPages.length;
  const carouselItemStride = miniW + 6; // width + gap
  const viewportWidth = CAROUSEL_PAGE_SIZE * miniW + (CAROUSEL_PAGE_SIZE - 1) * 6;

  // Auto-scroll carousel to keep active page visible (only when not manually navigating)
  const manualCarousel = useRef(false);
  useEffect(() => {
    if (manualCarousel.current) {
      manualCarousel.current = false;
      return;
    }
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
        <div className="thumb-section-page" style={{ ...css.section, flexShrink: 0, alignItems: 'center' }}>
          <span style={{ ...css.sectionLabel, alignSelf: 'stretch' }}>ページ {numPages > 0 ? `${pageNum}/${numPages}` : ''}</span>
          <AnimatePresence mode="wait">
            {thumbnailUrl ? (
              <motion.img
                key={`page-${pageNum}`}
                src={thumbnailUrl}
                alt={`Page ${pageNum}`}
                style={{ ...css.pageThumbnail, width: 'auto', maxHeight: '100%' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={async () => {
                  let md: string | undefined;
                  if (doc) {
                    try { md = await getPageMarkdown(doc.id, pageNum); } catch { /* ignore */ }
                  }
                  onImageClick?.(thumbnailUrl, `Page ${pageNum}`, md, pageNum, numPages);
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
              />
            ) : (
              <div className="thumb-placeholder" style={css.placeholder}>ドキュメントなし</div>
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
                onClick={() => { if (canPrev) { manualCarousel.current = true; setCarouselStart(Math.max(0, carouselStart - 1)); } }}
                disabled={!canPrev}
                title="前へ"
              >
                &#x25C0;
              </button>
              <div style={{ ...css.carouselViewport, width: viewportWidth }}>
                <motion.div
                  style={css.carouselTrack}
                  animate={{ x: -(carouselStart * carouselItemStride) }}
                  transition={{ type: 'tween', duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                >
                  {layoutPages.map((p) => {
                    const isActive = p === pageNum;
                    const src = doc ? withToken(`/api/documents/${doc.id}/page/${p}/thumbnail`) : '';
                    return (
                      <img
                        key={p}
                        src={src}
                        alt={`Page ${p}`}
                        style={{
                          ...css.miniThumb,
                          width: miniW,
                          height: miniH,
                          ...(isActive ? css.miniThumbActive : {}),
                        }}
                        onClick={() => { setManualPage(p); setCurrentPage(p); }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--color-text-muted)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border)';
                        }}
                      />
                    );
                  })}
                </motion.div>
              </div>
              <button
                style={{
                  ...css.carouselBtn,
                  height: carouselBtnH,
                  ...(canNext ? {} : css.carouselBtnDisabled),
                }}
                onClick={() => { if (canNext) { manualCarousel.current = true; setCarouselStart(carouselStart + 1); } }}
                disabled={!canNext}
                title="次へ"
              >
                &#x25B6;
              </button>
            </div>
            {layoutPages.length > CAROUSEL_PAGE_SIZE && (
              <span style={css.carouselIndicator}>
                {carouselStart + 1}–{Math.min(carouselStart + CAROUSEL_PAGE_SIZE, layoutPages.length)} / {layoutPages.length} ページ
              </span>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={css.divider} />

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
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', padding: '8px' }}>
                画像なし
              </div>
            ) : (
              chunkImages.map((ref) => {
                const imgSrc = doc ? withToken(`/api/documents/${doc.id}/images/${ref}`) : '';
                const caption = getCaptionForImage(ref);
                const altText = caption ? `${ref}\n${caption}` : ref;
                return (
                  <motion.img
                    key={ref}
                    src={imgSrc}
                    alt={ref}
                    title={caption || ref}
                    style={css.chunkThumb}
                    whileHover={{ scale: 1.04, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    onClick={() => onImageClick?.(imgSrc, altText)}
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
