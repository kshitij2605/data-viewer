import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { useAuthStore } from '../stores/authStore.ts';

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
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    padding: '24px 28px',
    width: '420px',
    maxWidth: '92vw',
    display: 'flex',
    flexDirection: 'column' as const,
    borderTop: '3px solid var(--color-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-muted)',
    transition: 'all var(--transition-normal)',
  },
  section: {
    marginBottom: '16px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
  },
  docCount: {
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface-inset)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border-light)',
  },
  dangerZone: {
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border-light)',
  },
  dangerTitle: {
    fontSize: '11px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    color: 'var(--color-error)',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  deleteBtn: {
    width: '100%',
    padding: '10px 16px',
    border: '1.5px solid var(--color-error)',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-error)',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
  logoutBtn: {
    width: '100%',
    marginTop: '10px',
    padding: '10px 16px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
  confirmOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(2px)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  confirmDialog: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    padding: '16px 20px',
    width: '95%',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--color-border)',
  },
  confirmText: {
    fontSize: '12px',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text)',
    marginBottom: '12px',
    lineHeight: 1.4,
    wordBreak: 'break-all',
    overflowWrap: 'break-word',
  },
  confirmActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-display)',
    transition: 'all 100ms ease',
  },
  confirmBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-error)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    transition: 'background 100ms ease',
  },
  errorBox: {
    marginTop: '10px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#dc2626',
  },
} as const;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const documents = useDocumentStore((s) => s.documents);
  const deleteAllDocuments = useDocumentStore((s) => s.deleteAllDocuments);
  const logout = useAuthStore((s) => s.logout);

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDeleteClick = useCallback(() => {
    setShowConfirm(true);
    setError('');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setDeleting(true);
    setError('');
    try {
      await deleteAllDocuments();
      setShowConfirm(false);
      onClose();
    } catch {
      setError('削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  }, [deleteAllDocuments, onClose]);

  const handleCancelDelete = useCallback(() => {
    setShowConfirm(false);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    if (deleting) return;
    setShowConfirm(false);
    setError('');
    onClose();
  }, [deleting, onClose]);

  const handleLogout = useCallback(() => {
    logout();
    window.location.href = '/login';
  }, [logout]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={css.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
        >
          <motion.div
            style={css.dialog}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={css.header}>
              <span style={css.title}>設定</span>
              <button
                type="button"
                style={css.closeBtn}
                onClick={handleClose}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-inset)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                x
              </button>
            </div>

            {/* Document count section */}
            <div style={css.section}>
              <div style={css.sectionLabel}>ドキュメント</div>
              <div style={css.docCount}>
                {documents.length}件
              </div>
            </div>

            {/* Error message */}
            {error && <div style={css.errorBox}>{error}</div>}

            {/* Danger zone */}
            <div style={css.dangerZone}>
              <div style={css.dangerTitle}>Danger Zone</div>
              <button
                type="button"
                style={{
                  ...css.deleteBtn,
                  opacity: documents.length === 0 ? 0.5 : 1,
                  cursor: documents.length === 0 ? 'not-allowed' : 'pointer',
                }}
                onClick={handleDeleteClick}
                disabled={documents.length === 0 || deleting}
                onMouseEnter={(e) => {
                  if (documents.length > 0 && !deleting) {
                    e.currentTarget.style.background = 'var(--color-error)';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-error)';
                }}
              >
                {deleting ? '削除中...' : 'すべて削除'}
              </button>
              <button
                type="button"
                style={css.logoutBtn}
                onClick={handleLogout}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-text-muted)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                ログアウト
              </button>
            </div>

            {/* Confirmation overlay */}
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  style={css.confirmOverlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.div
                    style={css.confirmDialog}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div style={css.confirmText}>
                      本当に{documents.length}件のドキュメントをすべて削除しますか？<br />
                      <strong>この操作は取り消せません。</strong>
                    </div>
                    <div style={css.confirmActions}>
                      <button
                        type="button"
                        style={css.cancelBtn}
                        onClick={handleCancelDelete}
                        disabled={deleting}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        style={{
                          ...css.confirmBtn,
                          opacity: deleting ? 0.7 : 1,
                        }}
                        onClick={handleConfirmDelete}
                        disabled={deleting}
                      >
                        {deleting ? '削除中...' : '削除する'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}