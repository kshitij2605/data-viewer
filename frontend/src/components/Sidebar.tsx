import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import FolderLoadDialog from './FolderLoadDialog.tsx';

type ViewMode = 'chunks' | 'markdown' | 'text' | 'tables' | 'images';

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: string }[] = [
  { mode: 'chunks', label: 'チャンク', icon: '&#x29C9;' },
  { mode: 'markdown', label: 'Markdown', icon: '&#x23CE;' },
  { mode: 'text', label: 'テキスト', icon: '&#x1D5AB;' },
  { mode: 'tables', label: 'テーブル', icon: '&#x25A6;' },
  { mode: 'images', label: '画像', icon: '&#x1F5FB;' },
];

const css = {
  sidebar: {
    background: 'var(--color-sidebar-bg)',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
    transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1), min-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  topBar: {
    padding: '12px 10px',
    borderBottom: '1px solid var(--color-sidebar-border)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--color-sidebar-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--color-sidebar-surface)',
    color: 'var(--color-sidebar-text)',
    transition: 'all var(--transition-normal)',
    minWidth: 0,
  },
  iconBtn: {
    padding: '6px 8px',
    background: 'var(--color-sidebar-surface)',
    border: '1px solid var(--color-sidebar-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
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
    transition: 'all var(--transition-normal)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  fileItem: {
    padding: '10px 14px',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderLeft: '2.5px solid transparent',
    color: 'var(--color-sidebar-text)',
    overflow: 'hidden',
    letterSpacing: '0.02em',
  },
  fileItemSelected: {
    background: 'rgba(230, 57, 70, 0.08)',
    borderLeftColor: 'var(--color-primary)',
    color: 'var(--color-sidebar-text-active)',
    fontWeight: 600,
  },
  fileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    lineHeight: 1.5,
  },
  pageCount: {
    fontSize: 'var(--text-xxs)',
    color: 'var(--color-sidebar-text)',
    flexShrink: 0,
    fontFamily: 'var(--font-mono)',
    background: 'var(--color-sidebar-surface)',
    padding: '2px 7px',
    borderRadius: 'var(--radius-full)',
    opacity: 0.6,
  },
  viewSwitcher: {
    borderTop: '1px solid var(--color-sidebar-border)',
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  viewLabel: {
    fontSize: 'var(--text-xxs)',
    fontWeight: 600,
    color: 'var(--color-sidebar-text)',
    padding: '2px 6px 6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    fontFamily: 'var(--font-display)',
    opacity: 0.4,
  },
  viewBtn: {
    padding: '7px 10px',
    fontSize: 'var(--text-sm)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    transition: 'all var(--transition-normal)',
    background: 'transparent',
    color: 'var(--color-sidebar-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    letterSpacing: '0.02em',
  },
  viewBtnActive: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    fontWeight: 600,
    boxShadow: '0 2px 8px rgba(230, 57, 70, 0.25)',
  },
  emptyState: {
    padding: '32px 14px',
    textAlign: 'center' as const,
    fontSize: 'var(--text-sm)',
    color: 'var(--color-sidebar-text)',
    opacity: 0.5,
  },
} as const;

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse, width, onWidthChange }: SidebarProps) {
  const { documents, selectedDocument, loadDocuments, deleteDocument, setDocument, viewMode, setViewMode } =
    useDocumentStore();
  const [search, setSearch] = useState('');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

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

  const sidebarWidth = collapsed ? '48px' : `${width ?? 200}px`;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width ?? 200;

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(140, Math.min(500, startWidth + (ev.clientX - startX)));
      onWidthChange?.(newWidth);
    };

    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, [width, onWidthChange]);

  return (
    <>
      <aside
        className={`app-sidebar${open ? ' open' : ''}`}
        style={{ ...css.sidebar, width: sidebarWidth, minWidth: sidebarWidth, position: 'relative', transition: isResizing ? 'none' : css.sidebar.transition }}
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
            {'\u2630'}
          </button>
        </div>

        {/* Expanded content — fades out when collapsing */}
        <div style={{
          flex: collapsed ? 0 : 1,
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
          opacity: collapsed ? 0 : 1,
          pointerEvents: collapsed ? 'none' as const : 'auto' as const,
          transition: 'opacity 200ms ease, flex 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
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
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-sidebar-text)',
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: '12px',
                            opacity: 0.4,
                            flexShrink: 0,
                            lineHeight: 1,
                            transition: 'all var(--transition-fast)',
                          }}
                          title="削除"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`「${doc.pdf_title || doc.folder_name}」を削除しますか？`)) {
                              deleteDocument(doc.id);
                            }
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-error)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--color-sidebar-text)'; }}
                        >
                          &#x2715;
                        </button>
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
        </div>

        {/* Collapsed: view mode icons — fades in when collapsing */}
        <div style={{
          flex: collapsed ? 1 : 0,
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          padding: collapsed ? '8px 0' : '0',
          gap: '4px',
          overflow: 'hidden',
          opacity: collapsed ? 1 : 0,
          pointerEvents: collapsed ? 'auto' as const : 'none' as const,
          transition: 'opacity 200ms ease 80ms, flex 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
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
        {/* Drag resize handle on right edge */}
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '4px',
              cursor: 'ew-resize',
              background: isResizing ? 'var(--color-primary)' : 'transparent',
              transition: 'background var(--transition-fast)',
              zIndex: 10,
            }}
            onMouseDown={handleResizeStart}
            onMouseEnter={(e) => { if (!isResizing) e.currentTarget.style.background = 'var(--color-border)'; }}
            onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = 'transparent'; }}
          />
        )}
      </aside>

      <FolderLoadDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
      />
    </>
  );
}
