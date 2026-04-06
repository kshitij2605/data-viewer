import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getAIReview, retryAIReview } from '../api/documents.ts';
import type { AIReview } from '../api/documents.ts';

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
  header: {
    padding: '14px 20px',
    borderBottom: '1px solid var(--color-border-light)',
    background: 'linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
  },
  retryBtn: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    letterSpacing: '0.3px',
    boxShadow: '0 2px 6px rgba(99,102,241,0.2)',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px 28px',
    lineHeight: 1.8,
    fontSize: 'var(--text-base)',
    color: 'var(--color-text)',
  },
  statusBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '16px',
    padding: '48px',
    textAlign: 'center' as const,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--color-border-light)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  statusText: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-muted)',
    letterSpacing: '0.02em',
  },
  markdown: {
    lineHeight: 1.8,
    fontSize: 'var(--text-base)',
  },
} as const;

function renderMarkdown(text: string): string {
  // Simple markdown to HTML: headers, bold, bullets, code blocks
  return text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:var(--text-md);font-weight:700;font-family:var(--font-display);margin:20px 0 8px;color:var(--color-text);letter-spacing:0.3px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:var(--text-lg);font-weight:700;font-family:var(--font-display);margin:24px 0 10px;color:var(--color-text);letter-spacing:0.3px;border-bottom:1px solid var(--color-border-light);padding-bottom:6px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:var(--text-xl);font-weight:700;font-family:var(--font-display);margin:28px 0 12px;color:var(--color-text)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-surface-inset);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:var(--text-sm)">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul style="margin:8px 0 8px 16px;padding:0;list-style:disc">${m}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:4px 0;padding-left:4px" value="$1">$2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export default function AIReviewView() {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [review, setReview] = useState<AIReview | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReview = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    try {
      const data = await getAIReview(doc.id);
      setReview(data);
    } catch {
      setReview({ status: 'error', review: 'レビューの取得に失敗しました' });
    } finally {
      setLoading(false);
    }
  }, [doc]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  // Poll while running
  useEffect(() => {
    if (!review || review.status !== 'running') return;
    const interval = setInterval(fetchReview, 3000);
    return () => clearInterval(interval);
  }, [review?.status, fetchReview]);

  const handleRetry = async () => {
    if (!doc) return;
    await retryAIReview(doc.id);
    setReview({ status: 'running', review: null });
    // Start polling
    setTimeout(fetchReview, 2000);
  };

  if (!doc) {
    return (
      <div style={css.container}>
        <div style={css.statusBox}>
          <div style={css.statusText}>ドキュメントを選択してください</div>
        </div>
      </div>
    );
  }

  return (
    <div style={css.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={css.header}>
        <span style={css.title}>AIレビュー — {doc.pdf_title || doc.folder_name}</span>
        <button
          style={{ ...css.retryBtn, opacity: review?.status === 'running' ? 0.6 : 1 }}
          onClick={handleRetry}
          disabled={review?.status === 'running'}
        >
          {review?.status === 'running' ? '分析中...' : '再分析'}
        </button>
      </div>

      {loading && !review ? (
        <div style={css.statusBox}>
          <div style={css.spinner} />
          <div style={css.statusText}>読み込み中...</div>
        </div>
      ) : review?.status === 'pending' || review?.status === 'running' ? (
        <div style={css.statusBox}>
          <div style={css.spinner} />
          <div style={css.statusText}>
            {review.status === 'pending' ? 'AIレビューを準備中...' : 'ドキュメントを分析中...'}
          </div>
          <div style={{ ...css.statusText, fontSize: 'var(--text-sm)', opacity: 0.6 }}>
            LLMがドキュメント構造を分析し、最適なチャンキング戦略を推薦します
          </div>
        </div>
      ) : review?.status === 'error' ? (
        <div style={css.statusBox}>
          <div style={{ ...css.statusText, color: 'var(--color-error)' }}>
            {review.review || 'エラーが発生しました'}
          </div>
          <button style={css.retryBtn} onClick={handleRetry}>再試行</button>
        </div>
      ) : review?.review ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={css.content}
        >
          <div
            style={css.markdown}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(review.review) }}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
