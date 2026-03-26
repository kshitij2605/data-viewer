import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import FolderLoadDialog from './FolderLoadDialog.tsx';

type ViewMode = 'chunks' | 'markdown' | 'text' | 'tables' | 'images';

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: string }[] = [
  { mode: 'chunks', label: 'チャンク', icon: '&#x2630;' },
  { mode: 'markdown', label: 'Markdown', icon: '&#x23CE;' },
  { mode: 'text', label: 'テキスト', icon: '&#x1D5AB;' },
  { mode: 'tables', label: 'テーブル', icon: '&#x25A6;' },
  { mode: 'images', label: '画像', icon: '&#x25A3;' },
];

const css = {
  sidebar: {
    background: 'var(--color-sidebar-bg)',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
    transition: 'width 200ms ease, min-width 200ms ease',
  },
  topBar: {
    padding: '10px 10px',
    borderBottom: '1px solid var(--color-sidebar-border)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid var(--color-sidebar-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--color-sidebar-surface)',
    color: 'var(--color-sidebar-text)',
    transition: 'border-color var(--transition-fast)',
    minWidth: 0,
  },
  iconBtn: {
    padding: '5px 8px',
    background: 'var(--color-sidebar-surface)',
    border: '1px solid var(--color-sidebar-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-sidebar-text)',
  },
  collapseBtn: {
    padding: '6px 8px',
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    color: 'var(--color-sidebar-text)',
    transition: 'color var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '6px 0',
  },
  fileItem: {
    padding: '9px 14px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderLeft: '3px solid transparent',
    color: 'var(--color-sidebar-text)',
    overflow: 'hidden',
  },
  fileItemSelected: {
    background: 'var(--color-sidebar-surface)',
    borderLeftColor: 'var(--color-primary)',
    color: 'var(--color-sidebar-text-active)',
    fontWeight: 600,
  },
  fileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    lineHeight: 1.4,
  },
  pageCount: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    fontFamily: 'var(--font-mono)',
    background: 'var(--color-sidebar-surface)',
    padding: '1px 5px',
    borderRadius: '8px',
  },
  viewSwitcher: {
    borderTop: '1px solid var(--color-sidebar-border)',
    padding: '8px 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  viewLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    padding: '2px 6px 4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    fontFamily: 'var(--font-display)',
  },
  viewBtn: {
    padding: '6px 10px',
    fontSize: '12px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    transition: 'all var(--transition-fast)',
    background: 'transparent',
    color: 'var(--color-sidebar-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  viewBtnActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 600,
  },
  emptyState: {
    padding: '28px 14px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
} as const;

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
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

  const sidebarWidth = collapsed ? '48px' : '200px';

  return (
    <>
      <aside
        className={`app-sidebar${open ? ' open' : ''}`}
        style={{ ...css.sidebar, width: sidebarWidth, minWidth: sidebarWidth }}
      >
        {/* Collapse toggle (visible on desktop only) */}
        <div style={{ ...css.topBar, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          {!collapsed && (
            <>
              <input
                style={css.searchInput}
                placeholder="検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-sidebar-border)'; }}
              />
              <button
                style={css.iconBtn}
                onClick={() => setFolderDialogOpen(true)}
                title="フォルダを追加"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-sidebar-border)';
                  e.currentTarget.style.color = 'var(--color-sidebar-text)';
                }}
              >
                +
              </button>
            </>
          )}
          <button
            className="sidebar-collapse-btn"
            style={css.collapseBtn}
            onClick={onToggleCollapse}
            title={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-sidebar-text)'; }}
          >
            {collapsed ? '\u25B6' : '\u25C0'}
          </button>
        </div>

        {!collapsed && (
          <>
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
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.12 }}
                        style={{
                          ...css.fileItem,
                          ...(isSelected ? css.fileItemSelected : {}),
                        }}
                        onClick={() => { setDocument(doc); onClose?.(); }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'var(--color-sidebar-surface)';
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
                  <span dangerouslySetInnerHTML={{ __html: opt.icon }} style={{ fontSize: '13px', width: '16px', textAlign: 'center' }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Collapsed: show view mode icons only */}
        {collapsed && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: '4px' }}>
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                style={{
                  ...css.viewBtn,
                  justifyContent: 'center',
                  padding: '8px',
                  width: '36px',
                  ...(viewMode === opt.mode ? css.viewBtnActive : {}),
                }}
                onClick={() => setViewMode(opt.mode)}
                title={opt.label}
              >
                <span dangerouslySetInnerHTML={{ __html: opt.icon }} style={{ fontSize: '14px' }} />
              </button>
            ))}
          </div>
        )}
      </aside>

      <FolderLoadDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
      />
    </>
  );
}
