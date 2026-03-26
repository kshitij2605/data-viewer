import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChunkStore } from '../stores/chunkStore.ts';
import { useDocumentStore } from '../stores/documentStore.ts';
import type { Chunk } from '../api/chunks.ts';

const STRATEGIES = [
  { value: 'character', label: 'Character' },
  { value: 'recursive', label: 'Recursive' },
  { value: 'semantic', label: 'Semantic' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'page', label: 'Page-wise' },
];

const css = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    minHeight: 0,
  },
  toolbar: {
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
  },
  select: {
    padding: '5px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    outline: 'none',
  },
  chunkBtn: {
    padding: '5px 14px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 100ms ease',
    fontFamily: 'inherit',
  },
  searchInput: {
    marginLeft: 'auto',
    padding: '5px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '160px',
    transition: 'border-color 100ms ease',
  },
  tableWrap: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'auto' as const,
    minHeight: 0,
  },
  table: {
    width: '100%',
    minWidth: '500px',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  th: {
    position: 'sticky' as const,
    top: 0,
    background: 'var(--color-bg)',
    borderBottom: '2px solid var(--color-border)',
    padding: '8px 10px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap' as const,
    zIndex: 1,
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--color-border)',
    verticalAlign: 'top' as const,
    color: 'var(--color-text)',
  },
  row: {
    cursor: 'pointer',
    transition: 'background 150ms ease, box-shadow 150ms ease',
  },
  rowSelected: {
    background: '#e8f4fd',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  chunkText: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    lineHeight: '1.5',
    maxWidth: '400px',
  },
  modifiedDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    display: 'inline-block',
  },
  feedbackEmoji: {
    fontSize: '16px',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  commentCell: {
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 12px',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    flexShrink: 0,
  },
  pageBtn: {
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
    minWidth: '28px',
    textAlign: 'center' as const,
  },
  pageBtnActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
    fontWeight: 600,
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  skeleton: {
    background: 'linear-gradient(90deg, var(--color-bg) 25%, #e9ecef 50%, var(--color-bg) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '4px',
    height: '14px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
  confirmOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  confirmDialog: {
    background: 'var(--color-surface)',
    borderRadius: '8px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
    padding: '24px 28px',
    width: '360px',
    maxWidth: '90vw',
    borderTop: '3px solid var(--color-primary)',
  },
  confirmTitle: {
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '12px',
    color: 'var(--color-text)',
  },
  confirmText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '20px',
    lineHeight: 1.6,
  },
  confirmActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
} as const;

interface ChunkTableProps {
  onChunkSelect?: (chunk: Chunk) => void;
  onFeedbackClick?: (chunk: Chunk) => void;
}

function buildPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          <td style={css.td}><div style={{ ...css.skeleton, width: '30px' }} /></td>
          <td style={css.td}><div style={{ ...css.skeleton, width: '100%' }} /><div style={{ ...css.skeleton, width: '70%', marginTop: '4px' }} /></td>
          <td style={css.td}><div style={{ ...css.skeleton, width: '20px' }} /></td>
          <td style={css.td}><div style={{ ...css.skeleton, width: '24px' }} /></td>
          <td style={css.td}><div style={{ ...css.skeleton, width: '60px' }} /></td>
        </tr>
      ))}
    </>
  );
}

export default function ChunkTable({ onChunkSelect, onFeedbackClick }: ChunkTableProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const {
    chunks, selectedChunk, page, totalPages, isChunking,
    setChunk, setPage, fetchChunks, setSearch, searchQuery, triggerChunking,
  } = useChunkStore();

  const [strategy, setStrategy] = useState('recursive');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  const docId = doc?.id;

  useEffect(() => {
    if (docId) {
      fetchChunks(docId);
    }
  }, [docId, page, searchQuery, fetchChunks]);

  const handleSearchSubmit = useCallback(() => {
    setSearch(localSearch);
  }, [localSearch, setSearch]);

  const handleChunk = () => {
    setConfirmOpen(true);
  };

  const confirmChunk = async () => {
    setConfirmOpen(false);
    if (!docId) return;
    try {
      await triggerChunking(docId, strategy);
    } catch {
      // error handled by store
    }
  };

  const handleRowClick = (chunk: Chunk) => {
    setChunk(chunk);
    onChunkSelect?.(chunk);
  };

  return (
    <div style={css.container}>
      {/* Shimmer keyframes */}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      <div className="chunk-toolbar" style={css.toolbar}>
        <span style={css.toolbarLabel}>チャンク</span>
        <select
          style={css.select}
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          style={{ ...css.chunkBtn, opacity: !docId || isChunking ? 0.6 : 1 }}
          onClick={handleChunk}
          disabled={!docId || isChunking}
        >
          {isChunking ? '処理中...' : 'チャンク実行'}
        </button>
        <input
          className="chunk-search-input"
          style={css.searchInput}
          placeholder="チャンク検索..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
        />
      </div>

      <div className="chunk-table-wrap" style={css.tableWrap}>
        <table style={css.table}>
          <thead>
            <tr>
              <th style={{ ...css.th, width: '60px' }}>No</th>
              <th style={css.th}>チャンクテキスト</th>
              <th style={{ ...css.th, width: '50px' }}>修正</th>
              <th style={{ ...css.th, width: '50px' }}>FB</th>
              <th style={{ ...css.th, width: '120px' }}>FBコメント</th>
            </tr>
          </thead>
          <tbody>
            {isChunking ? (
              <SkeletonRows />
            ) : chunks.length === 0 ? (
              <tr>
                <td colSpan={5} style={css.emptyState}>
                  {docId ? 'チャンクデータがありません。チャンク実行を行ってください。' : 'ドキュメントを選択してください。'}
                </td>
              </tr>
            ) : (
              <AnimatePresence>
                {chunks.map((chunk, idx) => {
                  const isSelected = selectedChunk?.id === chunk.id;
                  return (
                    <motion.tr
                      key={chunk.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      style={{
                        ...css.row,
                        ...(isSelected ? css.rowSelected : {}),
                      }}
                      onClick={() => handleRowClick(chunk)}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.background = '#f8f9fa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }
                      }}
                    >
                      <td style={css.td}>{chunk.chunk_index + 1}</td>
                      <td style={css.td}>
                        <div className="chunk-text-cell" style={css.chunkText}>{chunk.content}</div>
                      </td>
                      <td style={{ ...css.td, textAlign: 'center' }}>
                        {chunk.is_modified && <span style={css.modifiedDot} />}
                      </td>
                      <td style={{ ...css.td, textAlign: 'center' }}>
                        <span
                          style={css.feedbackEmoji}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFeedbackClick?.(chunk);
                          }}
                        >
                          {chunk.feedback_emoji || '\u2014'}
                        </span>
                      </td>
                      <td style={css.td}>
                        <div className="comment-cell" style={css.commentCell}>
                          {chunk.feedback_comment || '\u2014'}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={css.pagination}>
          <button
            style={{
              ...css.pageBtn,
              ...(page <= 1 ? css.pageBtnDisabled : {}),
            }}
            onClick={() => page > 1 && setPage(page - 1)}
            disabled={page <= 1}
          >
            &laquo;
          </button>
          {buildPageNumbers(page, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`e${i}`} style={{ padding: '0 4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>...</span>
            ) : (
              <button
                key={p}
                style={{
                  ...css.pageBtn,
                  ...(page === p ? css.pageBtnActive : {}),
                }}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            style={{
              ...css.pageBtn,
              ...(page >= totalPages ? css.pageBtnDisabled : {}),
            }}
            onClick={() => page < totalPages && setPage(page + 1)}
            disabled={page >= totalPages}
          >
            &raquo;
          </button>
        </div>
      )}

      {/* Confirm chunking dialog */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            style={css.confirmOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              style={css.confirmDialog}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={css.confirmTitle}>チャンク処理の確認</div>
              <div style={css.confirmText}>
                ストラテジー「{STRATEGIES.find((s) => s.value === strategy)?.label}」でチャンク処理を実行します。
                既存のチャンクは上書きされます。よろしいですか？
              </div>
              <div style={css.confirmActions}>
                <button
                  style={{
                    padding: '8px 18px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onClick={() => setConfirmOpen(false)}
                >
                  キャンセル
                </button>
                <button
                  style={css.chunkBtn}
                  onClick={confirmChunk}
                >
                  実行する
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
