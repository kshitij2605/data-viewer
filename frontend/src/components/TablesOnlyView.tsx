import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getTablesOnly } from '../api/documents.ts';
import type { Table } from '../api/documents.ts';

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
  grid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
    transition: 'box-shadow var(--transition-normal)',
  },
  cardHeader: {
    padding: '10px 16px',
    background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
    borderBottom: '1px solid var(--color-border-light)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.3px',
  },
  cardBody: {
    padding: '14px 16px',
    fontSize: 'var(--text-base)',
    overflow: 'auto',
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

const tableStyles = `
.table-card table { border-collapse: collapse; width: 100%; font-size: 12px; }
.table-card th, .table-card td { border: 1px solid var(--color-border); padding: 7px 12px; text-align: left; }
.table-card th { background: var(--color-surface-raised); font-weight: 600; font-size: 11px; font-family: var(--font-display); }
.table-card tr:hover { background: var(--color-surface-raised); }
`;

export default function TablesOnlyView() {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    getTablesOnly(doc.id)
      .then(setTables)
      .catch(() => setError('テーブルの取得に失敗しました。'))
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
      <style>{tableStyles}</style>
      {loading ? (
        <div style={css.loading}>読み込み中...</div>
      ) : error ? (
        <div style={css.error}>{error}</div>
      ) : tables.length === 0 ? (
        <div style={css.empty}>テーブルデータがありません。</div>
      ) : (
        <div style={css.grid}>
          <AnimatePresence>
            {tables.map((t, idx) => (
              <motion.div
                key={idx}
                style={css.card}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
              >
                <div style={css.cardHeader}>
                  {t.description || `テーブル ${idx + 1}`}
                </div>
                <div className="table-card" style={css.cardBody}>
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {t.content}
                  </Markdown>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
