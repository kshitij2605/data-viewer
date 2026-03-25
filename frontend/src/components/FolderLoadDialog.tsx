import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as docApi from '../api/documents.ts';
import { useDocumentStore } from '../stores/documentStore.ts';

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    background: 'var(--color-surface)',
    borderRadius: '8px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
    padding: '28px 32px',
    width: '440px',
    maxWidth: '90vw',
    borderTop: '3px solid var(--color-primary)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '20px',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 150ms ease',
    background: 'var(--color-bg)',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '6px',
    display: 'block',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 18px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'var(--color-surface)',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
  },
  loadBtn: {
    padding: '8px 18px',
    border: 'none',
    borderRadius: '6px',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 100ms ease',
  },
  errorBox: {
    marginTop: '12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#dc2626',
  },
} as const;

interface FolderLoadDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function FolderLoadDialog({ open, onClose }: FolderLoadDialogProps) {
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loadDocuments, setDocument } = useDocumentStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) {
      setError('フォルダパスを入力してください。');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const doc = await docApi.loadFolder(folderPath.trim());
      await loadDocuments();
      setDocument(doc);
      setFolderPath('');
      onClose();
    } catch {
      setError('フォルダの読み込みに失敗しました。パスを確認してください。');
    } finally {
      setLoading(false);
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
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            style={css.dialog}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={css.title}>フォルダを読み込む</div>
            <form onSubmit={handleSubmit}>
              <label style={css.label}>フォルダパス</label>
              <input
                style={css.input}
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/document/folder"
                autoFocus
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              />
              {error && (
                <motion.div
                  style={css.errorBox}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  {error}
                </motion.div>
              )}
              <div style={css.actions}>
                <button type="button" style={css.cancelBtn} onClick={onClose}>
                  キャンセル
                </button>
                <button
                  type="submit"
                  style={{ ...css.loadBtn, opacity: loading ? 0.7 : 1 }}
                  disabled={loading}
                >
                  {loading ? '読み込み中...' : '読み込む'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
