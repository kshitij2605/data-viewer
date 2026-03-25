import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { getDiff, deleteEdit } from '../api/chunks.ts';

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
  },
  dialog: {
    background: 'var(--color-surface)',
    borderRadius: '8px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
    width: '800px',
    maxWidth: '95vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderTop: '3px solid var(--color-primary)',
  },
  header: {
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    flexShrink: 0,
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  revertBtn: {
    padding: '6px 14px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 100ms ease',
  },
  closeBtn: {
    padding: '6px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    fontSize: '12px',
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
} as const;

interface DiffViewProps {
  open: boolean;
  chunkId: number | null;
  onClose: () => void;
  onReverted?: () => void;
}

export default function DiffView({ open, chunkId, onClose, onReverted }: DiffViewProps) {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    if (open && chunkId) {
      setLoading(true);
      setError('');
      getDiff(chunkId)
        .then((data) => {
          setOriginal(data.original);
          setModified(data.modified);
        })
        .catch(() => {
          setError('差分の取得に失敗しました。');
        })
        .finally(() => setLoading(false));
    }
  }, [open, chunkId]);

  const handleRevert = async () => {
    if (!chunkId) return;
    setReverting(true);
    try {
      await deleteEdit(chunkId);
      onReverted?.();
      onClose();
    } catch {
      setError('元に戻す処理に失敗しました。');
    } finally {
      setReverting(false);
    }
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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={css.header}>
              <span style={css.title}>差分ビュー</span>
              <div style={css.actions}>
                <button
                  style={{ ...css.revertBtn, opacity: reverting ? 0.7 : 1 }}
                  onClick={handleRevert}
                  disabled={reverting}
                >
                  {reverting ? '処理中...' : '元に戻す'}
                </button>
                <button style={css.closeBtn} onClick={onClose}>
                  閉じる
                </button>
              </div>
            </div>
            <div style={css.body}>
              {loading ? (
                <div style={css.loading}>読み込み中...</div>
              ) : error ? (
                <div style={css.error}>{error}</div>
              ) : (
                <ReactDiffViewer
                  oldValue={original}
                  newValue={modified}
                  splitView={true}
                  compareMethod={DiffMethod.WORDS}
                  leftTitle="オリジナル"
                  rightTitle="修正後"
                  styles={{
                    variables: {
                      light: {
                        diffViewerBackground: '#fff',
                        addedBackground: '#e6ffec',
                        removedBackground: '#ffebe9',
                        wordAddedBackground: '#abf2bc',
                        wordRemovedBackground: '#ff8182',
                      },
                    },
                  }}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
