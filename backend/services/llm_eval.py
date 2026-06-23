"""LLM-based chunk quality evaluation for RAG, FAQ usability, and AI suggestion."""
import asyncio
import base64
import hashlib
import io
import json
import logging
import random
import re
from pathlib import Path

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

LLM_API_BASE = settings.llm_api_base
LLM_API_KEY = settings.llm_api_key
LLM_MODEL = settings.llm_model

# ---------------------------------------------------------------------------
# Global throttle: a single process-wide semaphore caps how many requests are
# in flight against the shared Qwen vLLM deployment at any moment — regardless
# of how many users or chunks are being evaluated concurrently. This is the key
# protection that keeps a 100-user burst from overwhelming one GPU. The httpx
# client's connection pool is bounded to match.
# ---------------------------------------------------------------------------
_client: httpx.AsyncClient | None = None
_semaphore: asyncio.Semaphore | None = None
# Lazily-bound to the running event loop so the singletons are created inside
# the loop that uses them (important under gunicorn/uvicorn workers).
_semaphore_loop: object | None = None

# In-process cache of parsed RAG/FAQ scores keyed by a hash of the chunk text,
# so re-evaluating unchanged content never hits the GPU again.
_score_cache: dict[str, dict] = {}
_SCORE_CACHE_MAX = 5000


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore, _semaphore_loop
    loop = asyncio.get_running_loop()
    if _semaphore is None or _semaphore_loop is not loop:
        _semaphore = asyncio.Semaphore(max(1, settings.llm_max_concurrency))
        _semaphore_loop = loop
    return _semaphore


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        # Cap total connections to the global concurrency budget so the pool
        # itself can't exceed what the throttle allows.
        limits = httpx.Limits(
            max_connections=max(1, settings.llm_max_concurrency),
            max_keepalive_connections=max(1, settings.llm_max_concurrency),
        )
        _client = httpx.AsyncClient(
            timeout=settings.llm_timeout, trust_env=False, limits=limits
        )
    return _client


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


RAG_FAQ_PROMPT = """\
あなたはテキストチャンクの品質を評価する専門家です。以下のテキストチャンクを2つの観点で0〜10のスコアで評価してください。

## 評価基準

### RAG usability（RAG活用度）: 0〜10
このチャンクが検索拡張生成（RAG）システムでどれだけ有用かを評価します。
- **自己完結性**: 前後の文脈なしで理解できるか
- **情報密度**: 意味のある具体的な情報を含んでいるか（定型文やヘッダーのみではないか）
- **一貫性**: チャンク内のテーマや論理が一貫しているか
- **検索適合性**: 関連する質問に対して検索・マッチングされやすいキーワードや概念を含んでいるか
- **具体性**: 曖昧な一般論ではなく、具体的なトピックを扱っているか

スコア目安:
- 0-2: ほぼ無用（空白、ヘッダーのみ、意味不明な断片）
- 3-4: 低品質（文脈依存が強い、情報が薄い）
- 5-6: 普通（一部有用だが改善の余地あり）
- 7-8: 良好（自己完結的で情報豊富）
- 9-10: 優秀（完全に自己完結、高い情報密度、検索に最適）

### FAQ usability（FAQ活用度）: 0〜10
このチャンクからFAQ（よくある質問と回答）を生成するのにどれだけ適しているかを評価します。
- **Q&A生成可能性**: 自然な質問と回答のペアを作れる情報を含んでいるか
- **単独理解可能性**: チャンクだけで完全に理解できる回答になるか
- **明確さ**: 曖昧さがなく、FAQ回答として直接使える明瞭な表現か
- **完全性**: 質問に対する回答として十分な情報量があるか
- **原子性**: 1つの明確なトピックや事実に焦点を当てているか

スコア目安:
- 0-2: FAQ生成不可（表や図の断片、文脈なしの参照）
- 3-4: 困難（複数トピック混在、不完全な説明）
- 5-6: 可能だが課題あり（やや曖昧、補足が必要）
- 7-8: 良好（明確なQ&Aペアを1つ以上生成可能）
- 9-10: 最適（明確、完結、複数の質の高いQ&A生成可能）

## 評価対象チャンク
```
{chunk_text}
```

## 出力形式
まず簡潔に理由を述べ、その後JSONで回答してください。/no_think

理由: <1〜2文の簡潔な評価理由>

```json
{{"rag_score": <0-10の整数>, "faq_score": <0-10の整数>}}
```"""


AI_SUGGESTION_PROMPT = """\
画像とテキストを比較し、欠落・誤変換・レイアウト崩れがあれば指摘せよ。

## チャンクテキスト
```
{chunk_text}
```

## 出力ルール（厳守）
- 問題がない場合 → 「問題なし」とだけ出力。それ以外の文字は一切書くな。正確である旨の説明も不要。
- 問題がある場合 → 具体的な問題点のみ簡潔に列挙（最大300文字）。/no_think"""


CHUNKING_ANALYSIS_PROMPT = """\
あなたはドキュメント処理とRAGシステムの専門家です。以下はMarkdownドキュメントの{part_label}です。

このパートの内容を詳細に分析し、以下の情報を抽出してください：
- 各セクション（ヘッダー）の名前と文字数
- テーブルの有無とサイズ（行数・おおよその文字数）
- 画像参照の分布
- 段落の長さのパターン（短い/中程度/長い）
- 特殊な構造（箇条書き、番号リスト、ネストされた構造）

**重要**: ドキュメント内の各セクション・テーブル・段落を一つずつ確認し、文字数を正確に数えてください。推測ではなく実測に基づいて報告してください。

```
{content}
```

簡潔に箇条書きで報告してください。/no_think"""


CHUNKING_RECOMMENDATION_PROMPT = """\
あなたはドキュメント処理とRAGシステムの専門家です。

## ドキュメントの分析結果

以下は、あるドキュメントの各パートの詳細分析です：

{analysis_results}

## ドキュメント統計
- 総ページ数: {num_pages}
- 総文字数: {total_chars}
- 画像数: {num_images}
- テーブル数: {num_tables}

## 利用可能なチャンキング戦略

- **Character** — 固定文字数で分割。シンプルだが文脈を無視する。
- **Recursive** — 段落・文・文字の順で再帰的に分割。構造を部分的に保持。
- **Markdown** — Markdownのヘッダー（#, ##, ###）と段落区切りで分割。構造を最も保持。
- **Semantic** — 文の意味的類似度に基づいて分割。類似度が閾値以下で新チャンクを作成。
- **Page-wise** — ページ区切り（---）で分割。元のページ構造を維持。

## 設定可能なパラメータ

- **chunk_size**: チャンクの最大文字数（100〜10000）
- **chunk_overlap**: チャンク間の重複文字数（0〜chunk_size/2）
- **similarity_threshold**: セマンティック分割の閾値（0.0〜1.0、低いほど細かく分割）
- **min_chunk_size**: 最小チャンクサイズ（セマンティック分割用）

## 指示

上記の分析結果に基づいて、最適なチャンキング戦略を推薦してください。

**重要な注意事項**:
- 一般的・汎用的なアドバイスは一切不要です。
- すべての判断は上記の分析結果から得られた具体的なセクション名、文字数、テーブルサイズに基づいてください。
- 「このドキュメントの『○○』セクションは約X文字あるため…」のように、実際のデータを引用して説明してください。
- 特にテーブルや大きなセクションのサイズを考慮し、それらが分割されないパラメータを推薦してください。
- chunk_sizeは、ドキュメント内で最も大きなセクションやテーブルが分断されないサイズに設定してください。

以下の観点で回答してください：

- **ドキュメント構造の要約**: セクション構成、最小/最大セクションサイズ、テーブルの最大サイズ等
- **推薦チャンキング戦略**: 戦略名のみ記載（番号不要）。具体的な根拠を説明
- **推薦パラメータ**: 各パラメータの推薦値と、その値を選んだ具体的な根拠（ドキュメント内の実際のサイズデータに基づく）
- **RAGへの影響**: 具体的なセクションを例に挙げて説明
- **FAQ生成への影響**: 具体的なセクションの内容を例に挙げて説明
- **代替案**: 次善の戦略とその使い分け

日本語でMarkdown形式で回答してください。

**出力の冒頭**: 必ず「以下は『{doc_title}』の分析結果と、最適なチャンキング戦略の提案です。」から始めてください。「ご提示いただいた」「ご依頼の」等の対話的な表現は使わず、独立したレポートとして書いてください。

**出力の末尾**: レポートの最後に、推薦設定を機械可読な形式で必ず以下のHTMLコメントとして出力してください。値は実際の推薦値に置き換え、該当しないパラメータはnullにしてください。strategyは character / recursive / markdown / semantic / page のいずれかを使ってください。このコメントブロックの前後に余計な文章を追加しないでください。
<!--AI_CONFIG
{{"recommended":{{"strategy":"markdown","chunk_size":2000,"chunk_overlap":200,"similarity_threshold":null,"min_chunk_size":null}},"alternative":{{"strategy":"recursive","chunk_size":1500,"chunk_overlap":150,"similarity_threshold":null,"min_chunk_size":null}}}}
-->
/no_think"""


# Max chars per analysis chunk — ~50k chars leaves room for prompt within 64k token context
_ANALYSIS_CHUNK_SIZE = 50000


async def evaluate_chunking_strategy(markdown_content: str, num_pages: int, num_images: int, num_tables: int, doc_title: str = "") -> str:
    """Analyze entire document (multi-pass if needed) and recommend optimal chunking strategy."""
    total_chars = len(markdown_content)

    # Phase 1: Analyze the document — split into parts if too large
    parts = []
    for i in range(0, len(markdown_content), _ANALYSIS_CHUNK_SIZE):
        parts.append(markdown_content[i:i + _ANALYSIS_CHUNK_SIZE])

    if len(parts) == 1:
        # Document fits in one pass — analyze directly
        analysis_prompt = CHUNKING_ANALYSIS_PROMPT.format(
            part_label="全文",
            content=parts[0],
        )
        analysis = await _call_llm([{"role": "user", "content": analysis_prompt}], max_tokens=2048)
        analysis_results = analysis
    else:
        # Multi-part analysis in parallel
        async def analyze_part(idx: int, part: str) -> str:
            prompt = CHUNKING_ANALYSIS_PROMPT.format(
                part_label=f"パート{idx + 1}/{len(parts)}",
                content=part,
            )
            return await _call_llm([{"role": "user", "content": prompt}], max_tokens=1500)

        import asyncio
        tasks = [asyncio.create_task(analyze_part(i, p)) for i, p in enumerate(parts)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        analysis_parts = []
        for i, r in enumerate(results):
            if isinstance(r, str):
                analysis_parts.append(f"### パート{i + 1}\n{r}")
            else:
                logger.error("Analysis failed for part %d: %s", i + 1, r)
                analysis_parts.append(f"### パート{i + 1}\n分析失敗: {str(r)[:100]}")

        analysis_results = "\n\n".join(analysis_parts)

    # Phase 2: Generate recommendation based on analysis
    rec_prompt = CHUNKING_RECOMMENDATION_PROMPT.format(
        analysis_results=analysis_results,
        num_pages=num_pages,
        total_chars=total_chars,
        num_images=num_images,
        num_tables=num_tables,
        doc_title=doc_title or "対象ドキュメント",
    )
    return await _call_llm([{"role": "user", "content": rec_prompt}], max_tokens=3000)


_RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


async def _call_llm(messages: list[dict], max_tokens: int = 512) -> str:
    """Make a single LLM API call and return the response text.

    Acquires the global concurrency semaphore (so total in-flight requests to
    the shared Qwen deployment stay bounded) and retries transient failures
    (429/503/timeouts) with exponential backoff + jitter.
    """
    client = await _get_client()
    semaphore = _get_semaphore()
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }

    last_exc: Exception | None = None
    attempts = max(1, settings.llm_max_retries)
    for attempt in range(attempts):
        try:
            async with semaphore:
                resp = await client.post(
                    f"{LLM_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                    json=payload,
                )
            if resp.status_code in _RETRYABLE_STATUS:
                raise httpx.HTTPStatusError(
                    f"retryable status {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as e:
            # Don't retry genuine client errors (4xx that aren't rate-limit/conflict).
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status is not None and status not in _RETRYABLE_STATUS:
                raise
            last_exc = e
            if attempt < attempts - 1:
                backoff = min(2 ** attempt, 8) + random.uniform(0, 0.5)
                logger.warning(
                    "LLM call failed (attempt %d/%d): %s — retrying in %.1fs",
                    attempt + 1, attempts, e, backoff,
                )
                await asyncio.sleep(backoff)

    raise last_exc if last_exc else RuntimeError("LLM call failed")


async def evaluate_rag_faq(content: str) -> dict:
    """Evaluate RAG and FAQ scores. Returns {"rag_score": int, "faq_score": int}.

    Results are cached by content hash so unchanged chunks never re-hit the GPU.
    Only successfully-parsed (non-None) scores are cached.
    """
    key = _content_hash(content)
    cached = _score_cache.get(key)
    if cached is not None:
        return dict(cached)

    prompt = RAG_FAQ_PROMPT.format(chunk_text=content)
    text = await _call_llm([{"role": "user", "content": prompt}])
    scores = _parse_scores(text)

    if scores.get("rag_score") is not None and scores.get("faq_score") is not None:
        if len(_score_cache) >= _SCORE_CACHE_MAX:
            _score_cache.clear()  # simple bound; cheap to rebuild
        _score_cache[key] = dict(scores)
    return scores


def _downscale_image_to_jpeg(path: str, max_px: int) -> bytes | None:
    """Load a page image, shrink its longest edge to <= max_px, return JPEG bytes.

    Cuts vision-prompt token cost dramatically (a ~420 KB page PNG → tens of KB).
    Returns None if the image can't be processed (caller falls back to raw bytes).
    """
    try:
        import fitz  # PyMuPDF, already a dependency
        doc = fitz.open(path)
        page = doc[0]
        rect = page.rect
        longest = max(rect.width, rect.height) or 1
        scale = min(1.0, max_px / longest)
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        if pix.alpha:  # JPEG has no alpha channel
            pix = fitz.Pixmap(fitz.csRGB, pix)
        data = pix.tobytes(output="jpeg", jpg_quality=70)
        doc.close()
        return data
    except Exception as e:
        logger.warning("Image downscale failed for %s: %s", path, e)
        return None


async def evaluate_ai_suggestion(content: str, page_image_path: str | None) -> str:
    """Compare chunk text with page image and suggest missing content."""
    if not page_image_path or not Path(page_image_path).exists():
        # No image available — text-only fallback
        text = await _call_llm([{"role": "user", "content":
            f"以下のテキストチャンクに明らかな問題（不完全な文、文脈の欠落、意味不明な断片）があれば指摘せよ。\n\n```\n{content}\n```\n\n出力ルール（厳守）：問題なし→「問題なし」とだけ出力（説明不要）。問題あり→具体的問題点のみ列挙（最大300文字）。/no_think"
        }], max_tokens=512)
        return text.strip()

    # Downscale + recompress the page image before encoding to keep the vision
    # prompt cheap; fall back to the raw bytes if processing fails.
    image_data = _downscale_image_to_jpeg(page_image_path, settings.ai_suggestion_image_max_px)
    if image_data is None:
        image_data = Path(page_image_path).read_bytes()
    b64 = base64.b64encode(image_data).decode("utf-8")

    prompt_text = AI_SUGGESTION_PROMPT.format(chunk_text=content)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }
    ]
    text = await _call_llm(messages, max_tokens=512)
    return text.strip()


async def evaluate_chunk_all(content: str, page_image_path: str | None) -> dict:
    """Run all 3 evaluations in parallel. Returns {"rag_score", "faq_score", "ai_suggestion"}."""
    rag_faq_task = asyncio.create_task(evaluate_rag_faq(content))
    suggestion_task = asyncio.create_task(evaluate_ai_suggestion(content, page_image_path))

    results = await asyncio.gather(rag_faq_task, suggestion_task, return_exceptions=True)

    scores = results[0] if isinstance(results[0], dict) else {"rag_score": None, "faq_score": None}
    suggestion = results[1] if isinstance(results[1], str) else None

    if isinstance(results[0], Exception):
        logger.error("RAG/FAQ eval failed: %s", results[0])
    if isinstance(results[1], Exception):
        logger.error("AI suggestion eval failed: %s", results[1])

    return {
        "rag_score": scores.get("rag_score"),
        "faq_score": scores.get("faq_score"),
        "ai_suggestion": suggestion,
    }


def _parse_scores(text: str) -> dict:
    """Extract rag_score and faq_score from LLM response text."""
    json_match = re.search(r'\{[^}]*"rag_score"\s*:\s*(\d+)[^}]*"faq_score"\s*:\s*(\d+)[^}]*\}', text)
    if json_match:
        return {
            "rag_score": min(10, max(0, int(json_match.group(1)))),
            "faq_score": min(10, max(0, int(json_match.group(2)))),
        }

    for match in re.finditer(r'\{[^}]+\}', text):
        try:
            data = json.loads(match.group())
            if "rag_score" in data and "faq_score" in data:
                return {
                    "rag_score": min(10, max(0, int(data["rag_score"]))),
                    "faq_score": min(10, max(0, int(data["faq_score"]))),
                }
        except (json.JSONDecodeError, ValueError, KeyError):
            continue

    logger.warning("Could not parse LLM scores from: %s", text[:200])
    return {"rag_score": None, "faq_score": None}
