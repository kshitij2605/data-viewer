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
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    minHeight: 0,
    boxShadow: 'var(--shadow-xs)',
  },
  toolbar: {
    padding: '9px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface-raised)',
    flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
  },
  select: {
    padding: '5px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontFamily: 'inherit',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    outline: 'none',
    color: 'var(--color-text)',
  },
  chunkBtn: {
    padding: '6px 14px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
    letterSpacing: '0.3px',
  },
  searchInput: {
    marginLeft: 'auto',
    padding: '5px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '160px',
    transition: 'border-color var(--transition-fast)',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
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
    background: 'var(--color-surface-raised)',
    borderBottom: '2px solid var(--color-border)',
    padding: '9px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    fontSize: '10px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    zIndex: 1,
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid var(--color-border-light)',
    verticalAlign: 'top' as const,
    color: 'var(--color-text)',
  },
  row: {
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
  },
  rowSelected: {
    background: 'var(--color-primary-ghost)',
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
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    display: 'inline-block',
    boxShadow: '0 0 4px var(--color-primary-glow)',
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
    background: 'var(--color-surface-raised)',
    flexShrink: 0,
  },
  pageBtn: {
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    transition: 'all var(--transition-fast)',
    minWidth: '28px',
    textAlign: 'center' as const,
    color: 'var(--color-text)',
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
    background: 'linear-gradient(90deg, var(--color-surface-inset) 25%, var(--color-border-light) 50%, var(--color-surface-inset) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: 'var(--radius-sm)',
    height: '14px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  confirmOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(26, 26, 46, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  confirmDialog: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    padding: '28px 32px',
    width: '380px',
    maxWidth: '90vw',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  confirmAccent: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'var(--color-primary)',
  },
  confirmTitle: {
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    marginBottom: '12px',
    color: 'var(--color-text)',
  },
  confirmText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '24px',
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
  const [chunkSize, setChunkSize] = useState(2000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  // Which strategies support chunk_size/overlap params
  const showSizeParams = ['character', 'recursive', 'markdown', 'semantic'].includes(strategy);

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
      await triggerChunking(docId, strategy, {
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      });
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
        {showSizeParams && (
          <>
            <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
              サイズ
            </label>
            <input
              type="number"
              value={chunkSize}
              onChange={(e) => setChunkSize(Math.max(100, parseInt(e.target.value) || 100))}
              style={{ ...css.searchInput, width: '70px', marginLeft: 0, fontFamily: 'var(--font-mono)', textAlign: 'right' as const }}
              min={100}
              step={100}
            />
            <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
              重複
            </label>
            <input
              type="number"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ ...css.searchInput, width: '60px', marginLeft: 0, fontFamily: 'var(--font-mono)', textAlign: 'right' as const }}
              min={0}
              step={50}
            />
          </>
        )}
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
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.12, delay: idx * 0.02 }}
                      style={{
                        ...css.row,
                        ...(isSelected ? css.rowSelected : {}),
                      }}
                      onClick={() => handleRowClick(chunk)}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-raised)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }
                      }}
                    >
                      <td style={css.td}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {chunk.chunk_index + 1}
                        </span>
                      </td>
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
              <span key={`e${i}`} style={{ padding: '0 4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>...</span>
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
              <div style={css.confirmAccent} />
              <div style={css.confirmTitle}>チャンク処理の確認</div>
              <div style={css.confirmText}>
                ストラテジー「{STRATEGIES.find((s) => s.value === strategy)?.label}」でチャンク処理を実行します。
                {showSizeParams && (
                  <><br />サイズ: {chunkSize} / 重複: {chunkOverlap}</>
                )}
                <br />既存のチャンクは上書きされます。よろしいですか？
              </div>
              <div style={css.confirmActions}>
                <button
                  style={{
                    padding: '8px 18px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--color-text-secondary)',
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
