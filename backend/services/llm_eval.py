"""LLM-based chunk quality evaluation for RAG, FAQ usability, and AI suggestion."""
import asyncio
import base64
import json
import logging
import re
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

LLM_API_BASE = "http://llm-host:9000/v1"
LLM_API_KEY = "__REDACTED_EMBEDDING_API_KEY__"
LLM_MODEL = "Qwen/Qwen3.5-122B-A10B"

# Shared httpx client for connection pooling across parallel requests
_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=120.0, trust_env=False)
    return _client


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

**出力の冒頭**: 必ず「以下は『{doc_title}』の分析結果と、最適なチャンキング戦略の提案です。」から始めてください。「ご提示いただいた」「ご依頼の」等の対話的な表現は使わず、独立したレポートとして書いてください。/no_think"""


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


async def _call_llm(messages: list[dict], max_tokens: int = 512) -> str:
    """Make a single LLM API call and return the response text."""
    client = await _get_client()
    resp = await client.post(
        f"{LLM_API_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": max_tokens,
        },
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def evaluate_rag_faq(content: str) -> dict:
    """Evaluate RAG and FAQ scores. Returns {"rag_score": int, "faq_score": int}."""
    prompt = RAG_FAQ_PROMPT.format(chunk_text=content)
    text = await _call_llm([{"role": "user", "content": prompt}])
    return _parse_scores(text)


async def evaluate_ai_suggestion(content: str, page_image_path: str | None) -> str:
    """Compare chunk text with page image and suggest missing content."""
    if not page_image_path or not Path(page_image_path).exists():
        # No image available — text-only fallback
        text = await _call_llm([{"role": "user", "content":
            f"以下のテキストチャンクに明らかな問題（不完全な文、文脈の欠落、意味不明な断片）があれば指摘せよ。\n\n```\n{content}\n```\n\n出力ルール（厳守）：問題なし→「問題なし」とだけ出力（説明不要）。問題あり→具体的問題点のみ列挙（最大300文字）。/no_think"
        }], max_tokens=512)
        return text.strip()

    # Encode image as base64
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
