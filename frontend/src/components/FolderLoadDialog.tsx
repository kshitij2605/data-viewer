import { useState, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as docApi from '../api/documents.ts';
import type { DirEntry } from '../api/documents.ts';
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
    width: '580px',
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
  pathRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 150ms ease',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  },
  browseBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    transition: 'opacity 100ms ease',
    whiteSpace: 'nowrap' as const,
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
  treeContainer: {
    flex: 1,
    minHeight: '200px',
    maxHeight: '400px',
    overflowY: 'auto' as const,
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)',
    padding: '4px 0',
  },
  emptyTree: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: '13px',
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
  nodeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: '12.5px',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text)',
    transition: 'background 80ms ease',
    borderRadius: '3px',
    margin: '0 4px',
    gap: '2px',
    userSelect: 'none' as const,
  },
  chevron: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    color: 'var(--color-text-muted)',
    transition: 'transform 150ms ease',
    flexShrink: 0,
  },
  icon: {
    fontSize: '13px',
    marginRight: '5px',
    flexShrink: 0,
  },
  nodeName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  docBadge: {
    fontSize: '9px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--color-primary-ghost)',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    flexShrink: 0,
    marginLeft: '4px',
  },
  loadingDot: {
    fontSize: '11px',
    color: 'var(--color-text-faint)',
    padding: '4px 0 4px 38px',
  },
} as const;

interface TreeNode {
  entry: DirEntry;
  children: TreeNode[] | null;
  expanded: boolean;
  loading: boolean;
}

// File icon helper
function getFileIcon(name: string): string {
  if (name.endsWith('.pdf')) return '\uD83D\uDCC4';
  if (name.endsWith('.mmd') || name.endsWith('.md')) return '\uD83D\uDCDD';
  if (name.endsWith('.json')) return '\uD83D\uDCCB';
  return '\uD83D\uDCC3';
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  selected: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

function TreeNodeRow({ node, depth, selected, onToggle, onSelect }: TreeNodeRowProps) {
  const [hovered, setHovered] = useState(false);
  const isDir = node.entry.is_dir;
  const hasChildren = isDir && node.entry.children_count > 0;
  const isDoc = node.entry.has_metadata;
  const isSelected = selected.has(node.entry.path);

  const rowBg = isSelected
    ? 'var(--color-primary-ghost)'
    : hovered
    ? 'var(--color-surface-inset)'
    : 'transparent';

  return (
    <>
      <div
        style={{
          ...css.nodeRow,
          paddingLeft: `${8 + depth * 18}px`,
          background: rowBg,
          color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (isDoc) {
            onSelect(node.entry.path);
          } else if (hasChildren) {
            onToggle(node.entry.path);
          }
        }}
      >
        {/* Chevron for dirs */}
        <span
          style={{
            ...css.chevron,
            transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.entry.path); }}
        >
          &#9654;
        </span>

        {/* Checkbox for document folders */}
        {isDoc && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(node.entry.path)}
            onClick={(e) => e.stopPropagation()}
            style={{ ...css.checkbox, marginRight: '4px' }}
          />
        )}

        {/* Icon */}
        <span style={css.icon}>
          {isDir
            ? isDoc ? '\uD83D\uDCC4' : node.expanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'
            : getFileIcon(node.entry.name)}
        </span>

        {/* Name */}
        <span style={{
          ...css.nodeName,
          color: !isDir ? 'var(--color-text-muted)' : undefined,
          fontStyle: !isDir ? 'italic' : undefined,
        }}>
          {node.entry.name}
        </span>

        {/* Badge */}
        {isDoc && <span style={css.docBadge}>DOC</span>}
      </div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {node.expanded && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            {node.loading && <div style={css.loadingDot}>読み込み中...</div>}
            {node.children.map((child) => (
              <TreeNodeRow
                key={child.entry.path}
                node={child}
                depth={depth + 1}
                selected={selected}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Collect all document folder paths from the tree */
function collectDocPaths(nodes: TreeNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.entry.has_metadata) result.push(node.entry.path);
    if (node.children) result.push(...collectDocPaths(node.children));
  }
  return result;
}

interface FolderLoadDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function FolderLoadDialog({ open, onClose }: FolderLoadDialogProps) {
  const [rootPath, setRootPath] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const { loadDocuments, setDocument } = useDocumentStore();

  const browseRoot = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!rootPath.trim()) {
      setError('パスを入力してください。');
      return;
    }
    setError('');
    setLoading(true);
    setSelected(new Set());
    try {
      const entries = await docApi.browsePath(rootPath.trim());
      setTree(entries.map((entry) => ({
        entry,
        children: null,
        expanded: false,
        loading: false,
      })));
    } catch {
      setError('フォルダの読み込みに失敗しました。パスを確認してください。');
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  const toggleNode = useCallback(async (path: string) => {
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.entry.path === path) return n;
        if (n.children) { const f = findNode(n.children); if (f) return f; }
      }
      return null;
    };

    const node = findNode(tree);
    if (!node) return;

    if (node.expanded) {
      setTree((prev) => updateNodeInTree(prev, path, { expanded: false }));
      return;
    }

    if (node.children !== null) {
      setTree((prev) => updateNodeInTree(prev, path, { expanded: true }));
      return;
    }

    setTree((prev) => updateNodeInTree(prev, path, { expanded: true, loading: true, children: [] }));
    try {
      const entries = await docApi.browsePath(path);
      setTree((prev) => updateNodeInTree(prev, path, {
        loading: false,
        children: entries.map((e) => ({
          entry: e, children: null, expanded: false, loading: false,
        })),
      }));
    } catch {
      setTree((prev) => updateNodeInTree(prev, path, { loading: false, children: [] }));
    }
  }, [tree]);

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // Collect all visible doc paths for select-all
  const allDocPaths = collectDocPaths(tree);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = allDocPaths.every((p) => prev.has(p));
      if (allSelected) return new Set();
      return new Set(allDocPaths);
    });
  }, [allDocPaths]);

  const handleLoadSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setError('');
    setLoadingDocs(true);
    try {
      let lastDoc = null;
      for (const path of selected) {
        try {
          lastDoc = await docApi.loadFolder(path);
        } catch {
          // skip individual failures
        }
      }
      await loadDocuments();
      if (lastDoc) setDocument(lastDoc);
      setRootPath('');
      setTree([]);
      setSelected(new Set());
      onClose();
    } catch {
      setError('ドキュメントの読み込みに失敗しました。');
    } finally {
      setLoadingDocs(false);
    }
  }, [selected, loadDocuments, setDocument, onClose]);

  const allSelected = allDocPaths.length > 0 && allDocPaths.every((p) => selected.has(p));
  const someSelected = allDocPaths.some((p) => selected.has(p));

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
            <div style={css.title}>フォルダを参照</div>

            <form onSubmit={browseRoot} style={css.pathRow}>
              <input
                style={css.input}
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="/path/to/parent/folder"
                autoFocus
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              />
              <button
                type="submit"
                style={{ ...css.browseBtn, opacity: loading ? 0.7 : 1 }}
                disabled={loading}
              >
                {loading ? '...' : '参照'}
              </button>
            </form>

            {error && <div style={css.errorBox}>{error}</div>}

            {/* Select all row */}
            {allDocPaths.length > 0 && (
              <div style={css.selectAllRow}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                  style={css.checkbox}
                />
                <span>すべてのドキュメントフォルダを選択 ({allDocPaths.length}件)</span>
              </div>
            )}

            {/* Tree view */}
            <div style={css.treeContainer}>
              {tree.length === 0 ? (
                <div style={css.emptyTree}>
                  パスを入力して「参照」をクリックしてください
                </div>
              ) : (
                tree.map((node) => (
                  <TreeNodeRow
                    key={node.entry.path}
                    node={node}
                    depth={0}
                    selected={selected}
                    onToggle={toggleNode}
                    onSelect={toggleSelect}
                  />
                ))
              )}
            </div>

            {/* Actions */}
            <div style={css.actions}>
              <span style={css.selectedCount}>
                {selected.size > 0 ? `${selected.size}件選択中` : ''}
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" style={css.cancelBtn} onClick={onClose}>
                  キャンセル
                </button>
                <button
                  style={{
                    ...css.loadBtn,
                    opacity: selected.size === 0 || loadingDocs ? 0.5 : 1,
                  }}
                  onClick={handleLoadSelected}
                  disabled={selected.size === 0 || loadingDocs}
                >
                  {loadingDocs ? '読み込み中...' : `読み込む (${selected.size})`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function updateNodeInTree(
  nodes: TreeNode[],
  path: string,
  updates: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.entry.path === path) return { ...node, ...updates };
    if (node.children) return { ...node, children: updateNodeInTree(node.children, path, updates) };
    return node;
  });
}
