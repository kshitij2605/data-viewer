import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getTextOnly } from '../api/documents.ts';

const css = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    boxShadow: 'var(--shadow-sm)',
  },
  content: {
    maxWidth: '700px',
    margin: '0 auto',
  },
  paragraph: {
    fontSize: 'var(--text-base)',
    lineHeight: 1.9,
    color: 'var(--color-text)',
    marginBottom: '16px',
    padding: '10px 0',
    borderBottom: '1px solid var(--color-border-light)',
    letterSpacing: '0.01em',
  },
  loading: {
    padding: '48px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: 'var(--text-base)',
  },
  error: {
    padding: '24px',
    textAlign: 'center' as const,
    color: 'var(--color-error)',
    fontSize: 'var(--text-base)',
  },
  empty: {
    padding: '48px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: 'var(--text-base)',
    letterSpacing: '0.02em',
  },
} as const;

export default function TextOnlyView() {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    getTextOnly(doc.id)
      .then(setParagraphs)
      .catch(() => setError('テキストの取得に失敗しました。'))
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
      ) : paragraphs.length === 0 ? (
        <div style={css.empty}>テキストデータがありません。</div>
      ) : (
        <div style={css.content}>
          <AnimatePresence>
            {paragraphs.map((p, idx) => (
              <motion.p
                key={idx}
                style={css.paragraph}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(idx * 0.03, 0.5) }}
              >
                {p}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
