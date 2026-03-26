import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getImagesOnly } from '../api/documents.ts';
import type { ImageWithCaption } from '../api/documents.ts';
import { withToken } from '../api/client.ts';

const CATEGORY_LABELS: Record<string, string> = {
  chart: 'チャート',
  figure: 'フィギュア',
  scanned_text: 'スキャンテキスト',
  miscellaneous: 'その他',
};

const CATEGORY_ORDER = ['chart', 'figure', 'scanned_text', 'miscellaneous'];

const css = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-xs)',
  },
  inner: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
    marginTop: '24px',
  },
  groupLabel: {
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
  },
  groupCount: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface-inset)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  groupLine: {
    flex: 1,
    height: '1px',
    background: 'var(--color-border)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'box-shadow var(--transition-normal), transform var(--transition-normal)',
  },
  imageWrap: {
    width: '100%',
    height: '160px',
    background: 'var(--color-surface-raised)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
  },
  caption: {
    padding: '10px 14px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderTop: '1px solid var(--color-border-light)',
    lineHeight: 1.5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  error: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--color-error)',
    fontSize: '13px',
  },
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
} as const;

interface ImagesOnlyViewProps {
  onImageClick?: (src: string, alt: string) => void;
}

export default function ImagesOnlyView({ onImageClick }: ImagesOnlyViewProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [images, setImages] = useState<ImageWithCaption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    getImagesOnly(doc.id)
      .then(setImages)
      .catch(() => setError('画像の取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [doc]);

  // Group images by category if any have image_type set
  const { grouped, hasCategories } = useMemo(() => {
    const hasCats = images.some((img) => img.image_type && img.image_type.length > 0);
    if (!hasCats) return { grouped: null, hasCategories: false };

    const groups: Record<string, ImageWithCaption[]> = {};
    for (const img of images) {
      const cat = img.image_type || 'miscellaneous';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(img);
    }
    return { grouped: groups, hasCategories: true };
  }, [images]);

  if (!doc) {
    return <div style={css.loading}>ドキュメントを選択してください。</div>;
  }

  const renderImageCard = (img: ImageWithCaption, idx: number) => {
    const imgName = img.image_path.replace('images/', '');
    const imgSrc = doc
      ? withToken(`/api/documents/${doc.id}/images/${imgName}`)
      : '';
    return (
      <motion.div
        key={`${img.image_path}-${idx}`}
        style={css.card}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, delay: idx * 0.03 }}
        whileHover={{
          boxShadow: 'var(--shadow-md)',
          transform: 'translateY(-2px)',
        }}
        onClick={() => onImageClick?.(imgSrc, img.caption || img.image_path)}
      >
        <div style={css.imageWrap}>
          <img
            src={imgSrc}
            alt={img.caption || img.image_path}
            style={css.image}
          />
        </div>
        <div style={css.caption}>
          {img.caption || img.image_path}
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      style={css.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {loading ? (
        <div style={css.loading}>読み込み中...</div>
      ) : error ? (
        <div style={css.error}>{error}</div>
      ) : images.length === 0 ? (
        <div style={css.empty}>画像データがありません。</div>
      ) : hasCategories && grouped ? (
        // Grouped by category
        <div style={css.inner}>
          {CATEGORY_ORDER.filter((cat) => grouped[cat] && grouped[cat].length > 0).map((cat) => (
            <div key={cat}>
              <div style={{ ...css.groupHeader, ...(cat === CATEGORY_ORDER.find((c) => grouped[c]?.length) ? { marginTop: 0 } : {}) }}>
                <span style={css.groupLabel}>{CATEGORY_LABELS[cat] || cat}</span>
                <span style={css.groupCount}>{grouped[cat].length}</span>
                <div style={css.groupLine} />
              </div>
              <div className="images-grid" style={css.grid}>
                <AnimatePresence>
                  {grouped[cat].map((img, idx) => renderImageCard(img, idx))}
                </AnimatePresence>
              </div>
            </div>
          ))}
          {/* Show any categories not in the standard order */}
          {Object.keys(grouped).filter((cat) => !CATEGORY_ORDER.includes(cat)).map((cat) => (
            <div key={cat}>
              <div style={css.groupHeader}>
                <span style={css.groupLabel}>{cat}</span>
                <span style={css.groupCount}>{grouped[cat].length}</span>
                <div style={css.groupLine} />
              </div>
              <div className="images-grid" style={css.grid}>
                <AnimatePresence>
                  {grouped[cat].map((img, idx) => renderImageCard(img, idx))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list (no categories)
        <div className="images-grid" style={{ ...css.grid, maxWidth: '1000px', margin: '0 auto' }}>
          <AnimatePresence>
            {images.map((img, idx) => renderImageCard(img, idx))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
