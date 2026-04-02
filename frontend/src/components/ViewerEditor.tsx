import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChunkStore } from '../stores/chunkStore.ts';
import { useDocumentStore } from '../stores/documentStore.ts';
import { editChunk } from '../api/chunks.ts';
import { setFeedback } from '../api/feedback.ts';

const css = {
  container: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  header: {
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
    borderBottom: '1px solid var(--color-border-light)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background var(--transition-normal)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: 'var(--text-base)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
  },
  chevron: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
    transition: 'transform var(--transition-smooth)',
  },
  body: {
    overflow: 'auto',
    flex: 1,
    minHeight: 0,
  },
  inner: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  modeSwitch: {
    display: 'flex',
    gap: '6px',
  },
  modeBtn: {
    padding: '6px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    transition: 'all var(--transition-normal)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.2px',
  },
  modeBtnActive: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
    fontWeight: 600,
    boxShadow: '0 2px 6px rgba(230, 57, 70, 0.2)',
  },
  textarea: {
    width: '100%',
    minHeight: '100px',
    padding: '14px 16px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    fontFamily: 'inherit',
    lineHeight: 1.7,
    resize: 'none' as const,
    outline: 'none',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
    transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
    overflow: 'hidden',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    padding: '7px 22px',
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
  chunkLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-faint)',
    fontWeight: 500,
    fontFamily: 'var(--font-mono)',
  },
  emptyState: {
    padding: '28px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.02em',
  },
  statusMsg: {
    fontSize: 'var(--text-xs)',
    padding: '4px 12px',
    borderRadius: 'var(--radius-full)',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
  },
} as const;

interface ViewerEditorProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function ViewerEditor({ isOpen = true, onToggle }: ViewerEditorProps) {
  const { selectedChunk, fetchChunks } = useChunkStore();
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [mode, setMode] = useState<'content' | 'comment'>('content');
  const [editText, setEditText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedChunk) {
      setEditText(selectedChunk.content);
      setCommentText(selectedChunk.feedback_comment || '');
      setStatus('idle');
    }
  }, [selectedChunk]);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(100, ta.scrollHeight)}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [editText, commentText, mode, autoResize]);

  const handleSave = async () => {
    if (!selectedChunk) return;
    setSaving(true);
    setStatus('idle');
    try {
      if (mode === 'content') {
        await editChunk(selectedChunk.id, editText);
      } else {
        await setFeedback(selectedChunk.id, selectedChunk.feedback_emoji || '', commentText);
      }
      setStatus('saved');
      if (doc) {
        await fetchChunks(doc.id);
      }
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.container}>
      <div
        style={css.header}
        onClick={() => onToggle?.()}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-inset)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface-raised)'; }}
      >
        <div style={css.headerLeft}>
          <span
            style={{
              ...css.chevron,
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            &#9654;
          </span>
          <span>Viewer and Editor</span>
          {selectedChunk && (
            <span style={css.chunkLabel}>
              &mdash; Chunk #{selectedChunk.chunk_index + 1}
            </span>
          )}
        </div>
        {status === 'saved' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ ...css.statusMsg, color: 'var(--color-success)', background: '#f0fdf4' }}
          >
            保存しました
          </motion.span>
        )}
        {status === 'error' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ ...css.statusMsg, color: 'var(--color-error)', background: '#fef2f2' }}
          >
            保存に失敗しました
          </motion.span>
        )}
      </div>

      {isOpen && (
          <div style={css.body}>
            {!selectedChunk ? (
              <div style={css.emptyState}>
                チャンクを選択するとここに内容が表示されます。
              </div>
            ) : (
              <div style={css.inner}>
                <div style={css.modeSwitch}>
                  <button
                    style={{
                      ...css.modeBtn,
                      ...(mode === 'content' ? css.modeBtnActive : {}),
                    }}
                    onClick={() => setMode('content')}
                  >
                    コンテンツ編集
                  </button>
                  <button
                    style={{
                      ...css.modeBtn,
                      ...(mode === 'comment' ? css.modeBtnActive : {}),
                    }}
                    onClick={() => setMode('comment')}
                  >
                    FBコメント
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {mode === 'content' ? (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <textarea
                        ref={textareaRef}
                        style={css.textarea}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="comment"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <textarea
                        style={{ ...css.textarea, minHeight: '80px' }}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="フィードバックコメントを入力..."
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={css.actions}>
                  <button
                    style={{
                      ...css.saveBtn,
                      opacity: saving ? 0.7 : 1,
                    }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
