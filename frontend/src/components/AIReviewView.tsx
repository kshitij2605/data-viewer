import { useEffect, useState, useCallback, useMemo } from 'react';
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
    gap: '12px',
  },
  title: {
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
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
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    letterSpacing: '0.3px',
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
  // ── Config tiles ──
  tilesSection: {
    marginBottom: '24px',
  },
  tilesLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    color: 'var(--color-text-muted)',
    marginBottom: '12px',
  },
  tilesRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  tileGlow: {
    flex: '1 1 150px',
    minWidth: '140px',
    padding: '16px 18px',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    boxShadow: '0 0 22px var(--color-primary-glow), 0 6px 18px rgba(230,57,70,0.22)',
    animation: 'tilePulse 3.2s ease-in-out infinite',
  },
  tileAlt: {
    flex: '1 1 150px',
    minWidth: '140px',
    padding: '16px 18px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-sm)',
  },
  tileLabel: {
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    opacity: 0.85,
    marginBottom: '6px',
  },
  tileValue: {
    fontSize: '22px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    lineHeight: 1.1,
    wordBreak: 'break-word' as const,
  },
} as const;

const animations = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes tilePulse {
  0%, 100% { box-shadow: 0 0 18px var(--color-primary-glow), 0 6px 18px rgba(230,57,70,0.20); }
  50% { box-shadow: 0 0 30px rgba(230,57,70,0.30), 0 8px 24px rgba(230,57,70,0.28); }
}
`;

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

// ── Config extraction ───────────────────────────────────────────────────────

interface ChunkConfig {
  strategy?: string | null;
  chunk_size?: number | null;
  chunk_overlap?: number | null;
  similarity_threshold?: number | null;
  min_chunk_size?: number | null;
}
interface AIConfig {
  recommended?: ChunkConfig;
  alternative?: ChunkConfig;
}

const STRATEGY_LABELS: Record<string, string> = {
  character: 'Character',
  recursive: 'Recursive',
  markdown: 'Markdown',
  semantic: 'Semantic',
  page: 'Page-wise',
  'page-wise': 'Page-wise',
  'page_markdown': 'Page+Markdown',
  'page-markdown': 'Page+Markdown',
};

function strategyLabel(s?: string | null): string | undefined {
  if (!s) return undefined;
  const k = String(s).toLowerCase().trim();
  return STRATEGY_LABELS[k] || (s.charAt(0).toUpperCase() + s.slice(1));
}

const AI_CONFIG_RE = /<!--\s*AI_CONFIG\s*([\s\S]*?)-->/;

// Best-effort parse of an already-generated (pre-AI_CONFIG) Japanese report.
function heuristicConfig(md: string): AIConfig | null {
  const numAfter = (key: string, scope: string): number | undefined => {
    const m = scope.match(new RegExp(`${key}[^0-9]{0,24}([0-9]+(?:\\.[0-9]+)?)`, 'i'));
    return m ? Number(m[1]) : undefined;
  };
  const sectionAfter = (headingRe: RegExp): string => {
    const m = md.match(headingRe);
    if (!m || m.index == null) return '';
    const rest = md.slice(m.index + m[0].length);
    const next = rest.search(/\n#{1,3}\s/);
    return next === -1 ? rest : rest.slice(0, next);
  };
  const strategyIn = (scope: string): string | undefined => {
    const order: [RegExp, string][] = [
      [/markdown/i, 'markdown'],
      [/recursive|再帰/i, 'recursive'],
      [/semantic|意味/i, 'semantic'],
      [/character|文字数/i, 'character'],
      [/page[-\s]?wise|ページ(?:単位|区切り)/i, 'page'],
    ];
    for (const [re, val] of order) if (re.test(scope)) return val;
    return undefined;
  };

  const recScope = sectionAfter(/#{1,3}[^\n]*推薦[^\n]*(?:戦略|チャンキング)[^\n]*/) || md;
  const altScope = sectionAfter(/#{1,3}[^\n]*代替[^\n]*/);

  const recommended: ChunkConfig = {
    strategy: strategyIn(recScope),
    chunk_size: numAfter('chunk_size', md),
    chunk_overlap: numAfter('chunk_overlap', md),
    similarity_threshold: numAfter('similarity_threshold', md),
    min_chunk_size: numAfter('min_chunk_size', md),
  };
  const alternative: ChunkConfig | undefined = altScope
    ? { strategy: strategyIn(altScope) }
    : undefined;

  const hasAny = recommended.strategy || recommended.chunk_size != null;
  if (!hasAny) return null;
  return { recommended, alternative };
}

function extractConfig(review: string): { config: AIConfig | null; cleaned: string } {
  const m = review.match(AI_CONFIG_RE);
  if (m) {
    const cleaned = review.replace(m[0], '').trim();
    try {
      const config = JSON.parse(m[1].trim()) as AIConfig;
      return { config, cleaned };
    } catch {
      // Block present but malformed — fall back to heuristics on the cleaned text.
      return { config: heuristicConfig(cleaned), cleaned };
    }
  }
  return { config: heuristicConfig(review), cleaned: review };
}

function tilesFor(cfg?: ChunkConfig): { label: string; value: string }[] {
  if (!cfg) return [];
  const tiles: { label: string; value: string }[] = [];
  const strat = strategyLabel(cfg.strategy);
  if (strat) tiles.push({ label: 'チャンキング戦略', value: strat });
  if (cfg.chunk_size != null) tiles.push({ label: 'チャンクサイズ', value: String(cfg.chunk_size) });
  if (cfg.chunk_overlap != null) tiles.push({ label: 'オーバーラップ', value: String(cfg.chunk_overlap) });
  if (cfg.similarity_threshold != null) tiles.push({ label: '類似度しきい値', value: String(cfg.similarity_threshold) });
  if (cfg.min_chunk_size != null) tiles.push({ label: '最小チャンクサイズ', value: String(cfg.min_chunk_size) });
  return tiles;
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
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

  const { config, cleaned } = useMemo(
    () => (review?.review ? extractConfig(review.review) : { config: null, cleaned: '' }),
    [review?.review],
  );

  const handleRetry = async () => {
    if (!doc) return;
    await retryAIReview(doc.id);
    setReview({ status: 'running', review: null });
    setTimeout(fetchReview, 2000);
  };

  const handleDownload = () => {
    if (!cleaned) return;
    const name = (doc?.pdf_title || doc?.folder_name || 'AIレビュー').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([cleaned], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_AIレビュー.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  const recTiles = tilesFor(config?.recommended);
  const altTiles = tilesFor(config?.alternative);
  const canDownload = !!cleaned && review?.status === 'done';

  return (
    <div style={css.container}>
      <style>{animations}</style>

      <div style={css.header}>
        <span style={css.title}>AIレビュー — {doc.pdf_title || doc.folder_name}</span>
        <div style={css.headerActions}>
          {canDownload && (
            <button
              style={css.downloadBtn}
              onClick={handleDownload}
              title="Markdownレポートをダウンロード"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}
            >
              <DownloadIcon />
              ダウンロード
            </button>
          )}
          <button
            style={{ ...css.retryBtn, opacity: review?.status === 'running' ? 0.6 : 1 }}
            onClick={handleRetry}
            disabled={review?.status === 'running'}
          >
            {review?.status === 'running' ? '分析中...' : '再分析'}
          </button>
        </div>
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
          {/* ── Highlighted recommended config tiles ── */}
          {recTiles.length > 0 && (
            <div style={css.tilesSection}>
              <div style={css.tilesLabel}>
                <span style={{ color: 'var(--color-primary)' }}>★</span> 推薦設定 — Best Configuration
              </div>
              <div style={css.tilesRow}>
                {recTiles.map((t, i) => (
                  <motion.div
                    key={t.label}
                    style={css.tileGlow}
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                  >
                    <div style={css.tileLabel}>{t.label}</div>
                    <div style={css.tileValue}>{t.value}</div>
                  </motion.div>
                ))}
              </div>

              {altTiles.length > 0 && (
                <>
                  <div style={{ ...css.tilesLabel, marginTop: '18px' }}>代替戦略 — Alternative</div>
                  <div style={css.tilesRow}>
                    {altTiles.map((t, i) => (
                      <motion.div
                        key={t.label}
                        style={css.tileAlt}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                      >
                        <div style={{ ...css.tileLabel, color: 'var(--color-text-muted)' }}>{t.label}</div>
                        <div style={{ ...css.tileValue, color: 'var(--color-text)', fontSize: '20px' }}>{t.value}</div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div
            style={css.markdown}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(cleaned) }}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
