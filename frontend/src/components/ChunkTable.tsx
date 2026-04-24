import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChunkStore } from '../stores/chunkStore.ts';
import { useDocumentStore } from '../stores/documentStore.ts';
import { setFeedback } from '../api/feedback.ts';
import { deleteEdit, subscribeEvaluation } from '../api/chunks.ts';
import type { Chunk, EvalResult } from '../api/chunks.ts';

const FEEDBACK_OPTIONS = [
  { type: 'correct', emoji: '\u2705', label: '正確' },
  { type: 'incorrect', emoji: '\u274C', label: '不正確' },
  { type: 'needs_edit', emoji: '\u270F\uFE0F', label: '要修正' },
  { type: 'unclear', emoji: '\u2753', label: '不明' },
  { type: 'partial', emoji: '\u26A0\uFE0F', label: '部分的' },
];

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
    border: '1px solid var(--color-border-light)',
    overflow: 'hidden',
    minHeight: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  toolbar: {
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid var(--color-border-light)',
    background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
    flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: 'var(--text-base)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.5px',
  },
  select: {
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    outline: 'none',
    color: 'var(--color-text)',
    transition: 'border-color var(--transition-fast)',
  },
  chunkBtn: {
    padding: '6px 16px',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    letterSpacing: '0.3px',
    boxShadow: '0 2px 6px rgba(230, 57, 70, 0.2)',
  },
  searchInput: {
    marginLeft: 'auto',
    padding: '6px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    outline: 'none',
    width: '160px',
    transition: 'all var(--transition-normal)',
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
    fontSize: 'var(--text-sm)',
  },
  th: {
    position: 'sticky' as const,
    top: 0,
    background: 'var(--color-surface-raised)',
    borderBottom: '1.5px solid var(--color-border)',
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    fontSize: 'var(--text-xxs)',
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    zIndex: 1,
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border-light)',
    verticalAlign: 'top' as const,
    color: 'var(--color-text)',
    transition: 'background var(--transition-fast)',
  },
  row: {
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
  },
  rowSelected: {
    background: 'var(--color-primary-ghost)',
    boxShadow: 'inset 3px 0 0 var(--color-primary)',
  },
  chunkText: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    lineHeight: 1.6,
    maxWidth: '400px',
    letterSpacing: '0.01em',
  },
  modifiedDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    display: 'inline-block',
    boxShadow: '0 0 6px var(--color-primary-glow)',
  },
  feedbackSelect: {
    fontSize: 'var(--text-sm)',
    padding: '5px 8px',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    outline: 'none',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
    minWidth: '90px',
    transition: 'all var(--transition-normal)',
    boxShadow: 'var(--shadow-inner)',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: '24px',
  },
  commentCell: {
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '10px 14px',
    borderTop: '1px solid var(--color-border-light)',
    background: 'var(--color-surface-raised)',
    flexShrink: 0,
  },
  pageBtn: {
    padding: '4px 9px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    transition: 'all var(--transition-normal)',
    minWidth: '28px',
    textAlign: 'center' as const,
    color: 'var(--color-text)',
  },
  pageBtnActive: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
    fontWeight: 600,
    boxShadow: '0 2px 6px rgba(230, 57, 70, 0.2)',
  },
  pageBtnDisabled: {
    opacity: 0.35,
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
    padding: '48px 20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: 'var(--text-base)',
    letterSpacing: '0.02em',
  },
  confirmOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(26, 26, 46, 0.45)',
    backdropFilter: 'blur(6px)',
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
    width: '400px',
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
    background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
  },
  confirmTitle: {
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    marginBottom: '12px',
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
  },
  confirmText: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    marginBottom: '24px',
    lineHeight: 1.7,
  },
  confirmActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
} as const;

interface ChunkTableProps {
  onChunkSelect?: (chunk: Chunk) => void;
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

export default function ChunkTable({ onChunkSelect }: ChunkTableProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const {
    chunks, selectedChunk, page, totalPages, isChunking,
    setChunk, setPage, fetchChunks, setSearch, searchQuery, triggerChunking,
    updateChunkEval, clearChunks,
  } = useChunkStore();

  const [strategy, setStrategy] = useState('page');
  const [chunkSize, setChunkSize] = useState(2000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState({ completed: 0, total: 0 });
  const evalEsRef = useRef<EventSource | null>(null);

  // Which strategies support chunk_size/overlap params
  const showSizeParams = ['character', 'recursive', 'markdown', 'semantic'].includes(strategy);

  // Pre-select strategy from ES metadata when doc changes
  const esStrategy = doc?.chunking_strategy;
  useEffect(() => {
    if (esStrategy) setStrategy(esStrategy);
  }, [esStrategy]);

  // Disable chunk button when strategy matches ES-chunked strategy
  const isStrategyUnchanged = !!(esStrategy && strategy === esStrategy);

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

  const startEvaluation = () => {
    if (!docId || isEvaluating) return;
    setIsEvaluating(true);
    setEvalProgress({ completed: 0, total: 0 });
    if (evalEsRef.current) { evalEsRef.current.close(); evalEsRef.current = null; }
    const es = subscribeEvaluation(docId, (data: EvalResult) => {
      if (data.type === 'start') {
        setEvalProgress({ completed: 0, total: data.total || 0 });
      } else if (data.type === 'result' && data.chunk_id != null) {
        updateChunkEval(data.chunk_id, {
          rag_score: data.rag_score ?? null,
          faq_score: data.faq_score ?? null,
          ai_suggestion: data.ai_suggestion ?? null,
        });
        setEvalProgress({ completed: data.completed || 0, total: data.total || 0 });
      } else if (data.type === 'done') {
        setIsEvaluating(false);
        es.close();
        evalEsRef.current = null;
      }
    });
    es.onerror = (err) => { console.error('LLM evaluation SSE error:', err); setIsEvaluating(false); es.close(); evalEsRef.current = null; };
    evalEsRef.current = es;
  };

  const confirmChunk = async () => {
    setConfirmOpen(false);
    if (!docId) return;
    try {
      await triggerChunking(docId, strategy, {
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      });
      // Small delay to ensure chunks are committed before evaluation starts
      await new Promise((r) => setTimeout(r, 500));
      startEvaluation();
    } catch {
      // error handled by store
    }
  };

  const handleRowClick = (chunk: Chunk) => {
    setChunk(chunk);
    onChunkSelect?.(chunk);
  };

  const handleCommentSave = async (chunk: Chunk) => {
    setEditingCommentId(null);
    const emoji = chunk.feedback_emoji || null;
    try {
      await setFeedback(chunk.id, emoji, commentDraft);
      if (docId) fetchChunks(docId);
    } catch { /* silent */ }
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
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)', letterSpacing: '0.3px' }}>
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
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)', letterSpacing: '0.3px' }}>
              重複
            </label>
            <input
              type="number"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ ...css.searchInput, width: '75px', marginLeft: 0, fontFamily: 'var(--font-mono)', textAlign: 'right' as const }}
              min={0}
              step={50}
            />
          </>
        )}
        <button
          style={{
            ...css.chunkBtn,
            opacity: !docId || isChunking || isEvaluating || isStrategyUnchanged ? 0.45 : 1,
            cursor: isStrategyUnchanged ? 'not-allowed' : (isChunking || isEvaluating ? 'wait' : 'pointer'),
          }}
          onClick={handleChunk}
          disabled={!docId || isChunking || isEvaluating || isStrategyUnchanged}
        >
          {isChunking ? '処理中...' : isEvaluating ? `評価中 ${evalProgress.completed}/${evalProgress.total}` : isStrategyUnchanged ? '評価済み' : 'チャンク実行'}
        </button>
        {chunks.length > 0 && docId && (
          <button
            style={{
              padding: '6px 12px',
              background: 'var(--color-surface)',
              color: 'var(--color-error, #c0392b)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              transition: 'all var(--transition-normal)',
              letterSpacing: '0.3px',
            }}
            onClick={() => clearChunks(docId)}
            title="チャンクをデータベースから削除"
          >
            削除
          </button>
        )}
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
              <th style={{ ...css.th, width: '80px' }}>RAGの使いやすさ</th>
              <th style={{ ...css.th, width: '80px' }}>FAQの使いやすさ</th>
              <th style={{ ...css.th, width: '180px' }}>AI提案</th>
              <th style={{ ...css.th, width: '50px' }}>修正</th>
              <th style={{ ...css.th, width: '80px' }}>フィードバック</th>
              <th style={{ ...css.th, width: '120px' }}>コメント</th>
            </tr>
          </thead>
          <tbody>
            {isChunking ? (
              <SkeletonRows />
            ) : chunks.length === 0 ? (
              <tr>
                <td colSpan={8} style={css.emptyState}>
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
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', fontWeight: 500 }}>
                          {chunk.chunk_index + 1}
                        </span>
                      </td>
                      <td style={css.td}>
                        <div className="chunk-text-cell" style={css.chunkText}>{chunk.content}</div>
                      </td>
                      <td style={{ ...css.td, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {chunk.rag_score != null ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                            background: chunk.rag_score >= 7 ? '#dcfce7' : chunk.rag_score >= 4 ? '#fef9c3' : '#fee2e2',
                            color: chunk.rag_score >= 7 ? '#166534' : chunk.rag_score >= 4 ? '#854d0e' : '#991b1b',
                          }}>{chunk.rag_score}</span>
                        ) : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                      <td style={{ ...css.td, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {chunk.faq_score != null ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                            background: chunk.faq_score >= 7 ? '#dcfce7' : chunk.faq_score >= 4 ? '#fef9c3' : '#fee2e2',
                            color: chunk.faq_score >= 7 ? '#166534' : chunk.faq_score >= 4 ? '#854d0e' : '#991b1b',
                          }}>{chunk.faq_score}</span>
                        ) : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                      <td style={{ ...css.td, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', maxWidth: '180px', cursor: chunk.ai_suggestion ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            if (!chunk.ai_suggestion) return;
                            e.stopPropagation();
                            setExpandedSuggestionId(expandedSuggestionId === chunk.id ? null : chunk.id);
                          }}>
                        {chunk.ai_suggestion ? (
                          <motion.div
                            initial={false}
                            animate={{
                              maxHeight: expandedSuggestionId === chunk.id ? 300 : 40,
                            }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            style={{
                              overflow: 'hidden',
                              lineHeight: 1.5,
                              ...(expandedSuggestionId === chunk.id
                                ? { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }
                                : { textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }),
                            }}
                          >
                            {chunk.ai_suggestion}
                          </motion.div>
                        ) : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                      <td
                        style={{ ...css.td, textAlign: 'center', cursor: chunk.is_modified ? 'pointer' : 'default' }}
                        title={chunk.is_modified ? '編集済み — クリックで元に戻す' : '未編集'}
                        onClick={(e) => {
                          if (!chunk.is_modified) return;
                          e.stopPropagation();
                          if (confirm('編集を元に戻しますか？')) {
                            deleteEdit(chunk.id).then(() => { if (docId) fetchChunks(docId); });
                          }
                        }}
                      >
                        {chunk.is_modified ? <span style={css.modifiedDot} /> : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                      <td style={{ ...css.td, textAlign: 'center' }}>
                        <select
                          style={css.feedbackSelect}
                          value={chunk.feedback_emoji || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            e.stopPropagation();
                            const val = e.target.value || null;
                            try {
                              await setFeedback(chunk.id, val, chunk.feedback_comment || undefined);
                              if (docId) fetchChunks(docId);
                            } catch { /* silent */ }
                          }}
                        >
                          <option value="">—</option>
                          {FEEDBACK_OPTIONS.map((opt) => (
                            <option key={opt.type} value={opt.type}>
                              {opt.emoji} {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={css.td} onClick={(e) => e.stopPropagation()}>
                        {editingCommentId === chunk.id ? (
                          <input
                            autoFocus
                            style={{
                              ...css.searchInput,
                              width: '100%',
                              marginLeft: 0,
                              fontSize: 'var(--text-xs)',
                              padding: '4px 8px',
                            }}
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCommentSave(chunk); if (e.key === 'Escape') setEditingCommentId(null); }}
                            onBlur={() => handleCommentSave(chunk)}
                          />
                        ) : (
                          <div
                            className="comment-cell"
                            style={{ ...css.commentCell, cursor: 'text' }}
                            onClick={() => { setEditingCommentId(chunk.id); setCommentDraft(chunk.feedback_comment || ''); }}
                            title="クリックして編集"
                          >
                            {chunk.feedback_comment || '\u2014'}
                          </div>
                        )}
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
              <span key={`e${i}`} style={{ padding: '0 4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>...</span>
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
                    padding: '8px 20px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    fontSize: 'var(--text-base)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--color-text-secondary)',
                    transition: 'all var(--transition-normal)',
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
