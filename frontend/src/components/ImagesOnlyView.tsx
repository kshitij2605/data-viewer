import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getImagesOnly } from '../api/documents.ts';
import type { ImageWithCaption } from '../api/documents.ts';

const css = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'box-shadow 150ms ease, transform 150ms ease',
  },
  imageWrap: {
    width: '100%',
    height: '160px',
    background: '#fafafa',
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
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderTop: '1px solid var(--color-border)',
    lineHeight: 1.5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
  error: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#dc2626',
    fontSize: '13px',
  },
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
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

  if (!doc) {
    return <div style={css.loading}>ドキュメントを選択してください。</div>;
  }

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
      ) : (
        <div style={css.grid}>
          <AnimatePresence>
            {images.map((img, idx) => {
              const imgName = img.image_path.replace('images/', '');
              const imgSrc = doc
                ? `/api/documents/${doc.id}/images/${imgName}`
                : '';
              return (
                <motion.div
                  key={idx}
                  style={css.card}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  whileHover={{
                    boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
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
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
