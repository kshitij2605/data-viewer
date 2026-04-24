import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as docApi from '../api/documents.ts';
import type { ESIndex, ESDocument } from '../api/documents.ts';
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
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    padding: '24px 28px',
    width: '640px',
    maxWidth: '92vw',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column' as const,
    borderTop: '3px solid var(--color-primary)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    marginBottom: '16px',
    letterSpacing: '0.5px',
  },
  indexRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    alignItems: 'center',
  },
  label: {
    fontSize: '12px',
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  // Custom dropdown styles
  dropdownWrapper: {
    position: 'relative' as const,
    flex: 1,
    minWidth: 0,
  },
  dropdownButton: {
    width: '100%',
    padding: '8px 32px 8px 10px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dropdownChevron: {
    position: 'absolute' as const,
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none' as const,
    color: 'var(--color-text-muted)',
    fontSize: '10px',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--color-surface)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 2000,
    maxHeight: '220px',
    overflowY: 'auto' as const,
  },
  dropdownItem: {
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text)',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    transition: 'background 80ms ease',
  },
  dropdownItemCount: {
    color: 'var(--color-text-muted)',
    fontSize: '10px',
    marginLeft: '6px',
    flexShrink: 0,
  },
  selectAllRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    marginBottom: '4px',
    fontSize: '11px',
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--color-border-light)',
  },
  checkbox: {
    width: '14px',
    height: '14px',
    accentColor: 'var(--color-primary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  listContainer: {
    flex: 1,
    minHeight: '200px',
    maxHeight: '400px',
    overflowY: 'auto' as const,
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)',
    padding: '4px 0',
  },
  emptyList: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: '13px',
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12.5px',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text)',
    transition: 'background 80ms ease',
    borderRadius: '3px',
    margin: '0 4px',
    gap: '8px',
    userSelect: 'none' as const,
  },
  docName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
  },
  importedBadge: {
    background: 'var(--color-success-ghost, #dcfce7)',
    color: 'var(--color-success, #16a34a)',
  },
  chunkBadge: {
    background: 'var(--color-primary-ghost)',
    color: 'var(--color-primary)',
  },
  pageBadge: {
    background: 'var(--color-surface-inset)',
    color: 'var(--color-text-muted)',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
  },
  selectedCount: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-muted)',
  },
  cancelBtn: {
    padding: '8px 18px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-display)',
    transition: 'all 100ms ease',
  },
  loadBtn: {
    padding: '8px 18px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    transition: 'background 100ms ease',
  },
  errorBox: {
    marginTop: '8px',
    marginBottom: '4px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 10px',
    fontSize: '11px',
    color: '#dc2626',
  },
  progressBar: {
    marginTop: '8px',
    height: '3px',
    borderRadius: '2px',
    background: 'var(--color-border-light)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
    background: 'var(--color-primary)',
    transition: 'width 200ms ease',
  },
} as const;

interface ESImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ESImportDialog({ open, onClose }: ESImportDialogProps) {
  const [indices, setIndices] = useState<ESIndex[]>([]);
  const [selectedIndex, setSelectedIndex] = useState('');
  const [esDocs, setEsDocs] = useState<ESDocument[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loadingIndices, setLoadingIndices] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { loadDocuments, setDocument } = useDocumentStore();

  // Load indices when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingIndices(true);
    setError('');
    setDropdownOpen(false);
    docApi.listESIndices()
      .then((data) => {
        setIndices(data);
        if (data.length > 0 && !selectedIndex) {
          setSelectedIndex(data[0].index_name);
        }
      })
      .catch(() => setError('Elasticsearchインデックスの取得に失敗しました'))
      .finally(() => setLoadingIndices(false));
  }, [open]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Load documents when index changes
  useEffect(() => {
    if (!selectedIndex) {
      setEsDocs([]);
      return;
    }
    setLoadingDocs(true);
    setError('');
    setSelected(new Set());
    docApi.listESDocuments(selectedIndex)
      .then(setEsDocs)
      .catch(() => setError('ドキュメント一覧の取得に失敗しました'))
      .finally(() => setLoadingDocs(false));
  }, [selectedIndex]);

  const toggleSelect = useCallback((docId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  }, []);

  const importableDocs = esDocs.filter((d) => !d.already_imported);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const allIds = importableDocs.map((d) => d.parent_doc_id);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [importableDocs]);

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;
    setError('');
    setImporting(true);
    setImportProgress({ done: 0, total: selected.size });

    try {
      let lastResult: docApi.ImportResult | null = null;
      let done = 0;
      for (const docId of selected) {
        try {
          lastResult = await docApi.importESDocument(docId, selectedIndex);
        } catch {
          // skip individual failures
        }
        done++;
        setImportProgress({ done, total: selected.size });
      }
      await loadDocuments();
      if (lastResult) {
        // Re-fetch to get the full Document shape
        const docs = await docApi.listDocuments();
        const imported = docs.find((d) => d.id === lastResult!.id);
        if (imported) setDocument(imported);
      }
      setSelected(new Set());
      onClose();
    } catch {
      setError('インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  }, [selected, selectedIndex, loadDocuments, setDocument, onClose]);

  const allImportableSelected = importableDocs.length > 0 && importableDocs.every((d) => selected.has(d.parent_doc_id));
  const someSelected = importableDocs.some((d) => selected.has(d.parent_doc_id));

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
            <div style={css.title}>Elasticsearchからインポート</div>

            {/* Index selector */}
            <div style={css.indexRow}>
              <span style={css.label}>インデックス:</span>
              <div style={css.dropdownWrapper} ref={dropdownRef}>
                <button
                  type="button"
                  style={css.dropdownButton}
                  onClick={() => !loadingIndices && setDropdownOpen((v) => !v)}
                  disabled={loadingIndices}
                  title={selectedIndex}
                >
                  {loadingIndices
                    ? '読み込み中...'
                    : (indices.find((i) => i.index_name === selectedIndex)?.index_name || '選択...')}
                </button>
                <span style={css.dropdownChevron}>{dropdownOpen ? '▲' : '▼'}</span>
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      style={css.dropdownMenu}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                    >
                      {indices.map((idx) => (
                        <div
                          key={idx.index_name}
                          style={{
                            ...css.dropdownItem,
                            background: idx.index_name === selectedIndex ? 'var(--color-primary-ghost)' : 'transparent',
                          }}
                          onClick={() => {
                            setSelectedIndex(idx.index_name);
                            setDropdownOpen(false);
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-raised)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = idx.index_name === selectedIndex ? 'var(--color-primary-ghost)' : 'transparent'; }}
                          title={idx.index_name}
                        >
                          {idx.index_name}
                          <span style={css.dropdownItemCount}>({idx.doc_count.toLocaleString()})</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {error && <div style={css.errorBox}>{error}</div>}

            {/* Select all row */}
            {importableDocs.length > 0 && (
              <div style={css.selectAllRow}>
                <input
                  type="checkbox"
                  checked={allImportableSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allImportableSelected; }}
                  onChange={toggleSelectAll}
                  style={css.checkbox}
                />
                <span>未インポートのドキュメントをすべて選択 ({importableDocs.length}件)</span>
              </div>
            )}

            {/* Document list */}
            <div style={css.listContainer}>
              {loadingDocs ? (
                <div style={css.emptyList}>ドキュメント一覧を取得中...</div>
              ) : esDocs.length === 0 ? (
                <div style={css.emptyList}>
                  {selectedIndex ? 'ドキュメントが見つかりません' : 'インデックスを選択してください'}
                </div>
              ) : (
                esDocs.map((doc) => {
                  const isImported = doc.already_imported;
                  const isSelected = selected.has(doc.parent_doc_id);
                  return (
                    <div
                      key={doc.parent_doc_id}
                      style={{
                        ...css.docRow,
                        background: isSelected ? 'var(--color-primary-ghost)' : 'transparent',
                        opacity: isImported ? 0.55 : 1,
                      }}
                      onClick={() => !isImported && toggleSelect(doc.parent_doc_id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isImported}
                        onChange={() => toggleSelect(doc.parent_doc_id)}
                        onClick={(e) => e.stopPropagation()}
                        style={css.checkbox}
                      />
                      <span style={css.docName} title={doc.filename}>
                        {doc.filename}
                      </span>
                      {isImported && (
                        <span style={{ ...css.badge, ...css.importedBadge }}>済</span>
                      )}
                      <span style={{ ...css.badge, ...css.chunkBadge }}>
                        {doc.chunk_count} chunks
                      </span>
                      <span style={{ ...css.badge, ...css.pageBadge }}>
                        {doc.num_pages}p
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Import progress bar */}
            {importing && importProgress.total > 0 && (
              <div style={css.progressBar}>
                <div
                  style={{
                    ...css.progressFill,
                    width: `${(importProgress.done / importProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}

            {/* Actions */}
            <div style={css.actions}>
              <span style={css.selectedCount}>
                {importing
                  ? `${importProgress.done}/${importProgress.total} インポート中...`
                  : selected.size > 0
                    ? `${selected.size}件選択中`
                    : ''}
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" style={css.cancelBtn} onClick={onClose} disabled={importing}>
                  キャンセル
                </button>
                <button
                  style={{
                    ...css.loadBtn,
                    opacity: selected.size === 0 || importing ? 0.5 : 1,
                  }}
                  onClick={handleImport}
                  disabled={selected.size === 0 || importing}
                >
                  {importing ? 'インポート中...' : `インポート (${selected.size})`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
