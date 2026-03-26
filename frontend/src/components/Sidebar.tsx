import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import FolderLoadDialog from './FolderLoadDialog.tsx';

type ViewMode = 'chunks' | 'markdown' | 'text' | 'tables' | 'images';

const VIEW_OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'chunks', label: 'チャンク' },
  { mode: 'markdown', label: 'Markdown' },
  { mode: 'text', label: 'テキスト' },
  { mode: 'tables', label: 'テーブル' },
  { mode: 'images', label: '画像' },
];

const css = {
  sidebar: {
    width: '180px',
    minWidth: '180px',
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  topBar: {
    padding: '8px',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--color-bg)',
    transition: 'border-color 100ms ease',
  },
  addBtn: {
    padding: '4px 8px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 100ms ease',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  fileList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  fileItem: {
    padding: '8px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 100ms ease, color 100ms ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderLeft: '3px solid transparent',
    color: 'var(--color-text)',
    overflow: 'hidden',
  },
  fileItemSelected: {
    background: '#e8f4fd',
    borderLeftColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
    fontWeight: 600,
  },
  fileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  pageCount: {
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  viewSwitcher: {
    borderTop: '1px solid var(--color-border)',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  viewLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '2px 6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  viewBtn: {
    padding: '5px 8px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
    background: 'transparent',
    color: 'var(--color-text)',
  },
  viewBtnActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 600,
  },
  emptyState: {
    padding: '24px 12px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
} as const;

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { documents, selectedDocument, loadDocuments, setDocument, viewMode, setViewMode } =
    useDocumentStore();
  const [search, setSearch] = useState('');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (d) =>
        d.folder_name.toLowerCase().includes(q) ||
        (d.pdf_title && d.pdf_title.toLowerCase().includes(q)),
    );
  }, [documents, search]);

  return (
    <>
      <aside
        className={`app-sidebar${open ? ' open' : ''}`}
        style={css.sidebar}
      >
        <div style={css.topBar}>
          <input
            style={css.searchInput}
            placeholder="検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          />
          <button
            style={css.addBtn}
            onClick={() => setFolderDialogOpen(true)}
            title="フォルダを追加"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'inherit';
            }}
          >
            +
          </button>
        </div>

        <div style={css.fileList}>
          <AnimatePresence>
            {filtered.length === 0 ? (
              <div style={css.emptyState}>
                ドキュメントがありません
              </div>
            ) : (
              filtered.map((doc) => {
                const isSelected = selectedDocument?.id === doc.id;
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      ...css.fileItem,
                      ...(isSelected ? css.fileItemSelected : {}),
                    }}
                    onClick={() => { setDocument(doc); onClose?.(); }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--color-bg)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span style={css.fileName}>
                      {doc.pdf_title || doc.folder_name}
                    </span>
                    <span style={css.pageCount}>{doc.num_pages}p</span>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        <div style={css.viewSwitcher}>
          <div style={css.viewLabel}>表示モード</div>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              style={{
                ...css.viewBtn,
                ...(viewMode === opt.mode ? css.viewBtnActive : {}),
              }}
              onClick={() => setViewMode(opt.mode)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </aside>

      <FolderLoadDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
      />
    </>
  );
}
