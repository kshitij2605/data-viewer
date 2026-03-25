import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { useChunkStore } from '../stores/chunkStore.ts';
import { withToken } from '../api/client.ts';

const css = {
  container: {
    display: 'flex',
    gap: '12px',
    padding: '10px 12px',
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    alignItems: 'flex-start',
    flexShrink: 0,
    minHeight: '160px',
    overflow: 'hidden',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  pageThumbnail: {
    width: '200px',
    height: '140px',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: '#fafafa',
    cursor: 'pointer',
    transition: 'box-shadow 100ms ease',
  },
  miniGrid: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
    maxHeight: '140px',
    overflowY: 'auto' as const,
  },
  miniThumb: {
    width: '80px',
    height: '60px',
    borderRadius: '3px',
    border: '1px solid var(--color-border)',
    objectFit: 'contain' as const,
    background: '#fafafa',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
  miniThumbActive: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px rgba(230,57,70,0.2)',
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
    background: '#fafafa',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
  rightSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  searchInput: {
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '120px',
    transition: 'border-color 100ms ease',
  },
  placeholder: {
    width: '200px',
    height: '140px',
    borderRadius: '4px',
    border: '1px dashed var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    background: 'var(--color-bg)',
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

  const pageNum = selectedChunk?.page_number ?? currentPage;
  const numPages = doc?.num_pages ?? 0;

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

  return (
    <motion.div
      style={css.container}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Left: Large page thumbnail */}
      <div style={css.section}>
        <span style={css.sectionLabel}>ページ</span>
        <AnimatePresence mode="wait">
          {thumbnailUrl ? (
            <motion.img
              key={`page-${pageNum}`}
              src={thumbnailUrl}
              alt={`Page ${pageNum}`}
              style={css.pageThumbnail}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => onImageClick?.(thumbnailUrl, `Page ${pageNum}`)}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
            />
          ) : (
            <div style={css.placeholder}>ドキュメントなし</div>
          )}
        </AnimatePresence>
      </div>

      {/* Center: Layout mini-thumbnails */}
      <div style={css.section}>
        <span style={css.sectionLabel}>レイアウト</span>
        <div style={css.miniGrid}>
          {layoutPages.slice(0, 20).map((p) => {
            const isActive = p === pageNum;
            const src = doc ? withToken(`/api/documents/${doc.id}/page/${p}/thumbnail`) : '';
            return (
              <img
                key={p}
                src={src}
                alt={`Layout page ${p}`}
                style={{
                  ...css.miniThumb,
                  ...(isActive ? css.miniThumbActive : {}),
                }}
                onClick={() => setCurrentPage(p)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = '#aaa';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Right: Chunk image thumbnails */}
      <div style={css.rightSection}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={css.sectionLabel}>チャンク画像</span>
          <div style={css.searchBar}>
            <input
              style={css.searchInput}
              placeholder="&#x1F50D; 検索"
              value={chunkSearch}
              onChange={(e) => setChunkSearch(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>
        </div>
        <div style={css.chunkGrid}>
          {chunkImages.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', padding: '8px' }}>
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
                  whileHover={{ scale: 1.05, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                  onClick={() => onImageClick?.(imgSrc, ref)}
                />
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
