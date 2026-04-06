import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getTablesOnly } from '../api/documents.ts';
import { withToken } from '../api/client.ts';
import type { TableImage } from '../api/documents.ts';

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
  sectionLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border-light)',
    marginBottom: '4px',
  },
  imgCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
  },
  imgBody: {
    padding: '8px',
    display: 'flex',
    justifyContent: 'center',
    background: 'var(--color-surface-inset)',
  },
  tableImg: {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: 'var(--radius-sm)',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageBadge: {
    fontSize: 'var(--text-xxs)',
    fontFamily: 'var(--font-mono)',
    background: 'var(--color-surface-inset)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    color: 'var(--color-text-muted)',
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

interface TablesOnlyViewProps {
  onImageClick?: (src: string, alt: string, pageMarkdown?: string) => void;
}

export default function TablesOnlyView({ onImageClick }: TablesOnlyViewProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [tableImages, setTableImages] = useState<TableImage[]>([]);
  const [tableHtmlMap, setTableHtmlMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    getTablesOnly(doc.id)
      .then((data) => {
        setTableImages(data.table_images);
        setTableHtmlMap(data.table_html_map || {});
      })
      .catch(() => setError('テーブルの取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [doc]);

  if (!doc) {
    return <div style={css.loading}>ドキュメントを選択してください。</div>;
  }

  const handleTableImageClick = (img: TableImage) => {
    if (!doc || !onImageClick) return;
    const src = withToken(`/api/documents/${doc.id}/tables/${img.filename}`);
    const html = tableHtmlMap[img.filename];
    onImageClick(src, img.filename, html || undefined);
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
      ) : tableImages.length === 0 ? (
        <div style={css.empty}>テーブルデータがありません。</div>
      ) : (
        <div style={css.grid}>
          <div style={css.sectionLabel}>テーブル画像 ({tableImages.length})</div>
          <AnimatePresence>
            {tableImages.map((img, idx) => (
              <motion.div
                key={`img-${img.filename}`}
                style={css.imgCard}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                onClick={() => handleTableImageClick(img)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; }}
              >
                <div style={css.cardHeader}>
                  <span>{img.filename}</span>
                  {img.page_number != null && (
                    <span style={css.pageBadge}>p.{img.page_number}</span>
                  )}
                </div>
                <div style={css.imgBody}>
                  <img
                    src={withToken(`/api/documents/${doc.id}/tables/${img.filename}`)}
                    alt={img.filename}
                    style={css.tableImg}
                    loading="lazy"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
