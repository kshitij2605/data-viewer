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
        _client = httpx.AsyncClient(timeout=120.0)
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
あなたはドキュメント品質の専門家です。以下のテキストチャンクは、添付のページ画像から抽出されたものです。

画像とテキストを比較して、抽出されたテキストに欠落や誤りがないか確認してください。

## チャンクテキスト
```
{chunk_text}
```

## 指示
1. 画像内の該当箇所とテキストを比較する
2. 欠落している情報、誤変換、レイアウト崩れなどを特定する
3. 問題がなければ「問題なし」と回答する

簡潔に日本語で回答してください（最大100文字）。/no_think"""


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
            f"以下のテキストチャンクを確認し、明らかな問題（不完全な文、文脈の欠落、意味不明な断片）があれば簡潔に指摘してください。問題なければ「問題なし」と回答。最大100文字。/no_think\n\n```\n{content}\n```"
        }], max_tokens=200)
        return text.strip()[:200]

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
    text = await _call_llm(messages, max_tokens=200)
    return text.strip()[:200]


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
