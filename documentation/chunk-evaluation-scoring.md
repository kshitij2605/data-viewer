# Chunk Quality Evaluation Scoring

## Overview

The Data Viewer application includes an LLM-based evaluation system that assigns two quality scores to each text chunk:

- **RAG Usability Score** (0-10): How useful the chunk is for Retrieval-Augmented Generation systems.
- **FAQ Usability Score** (0-10): How suitable the chunk is for generating FAQ (Frequently Asked Questions) content.

Scores are computed by sending each chunk to a large language model (Qwen/Qwen3.5-122B-A10B, 64k context) with a structured evaluation rubric. The LLM acts as an expert judge, providing reasoning followed by numeric scores. Evaluation auto-triggers after chunking completes, with results streaming to the UI in real-time via SSE.

---

## Model and Infrastructure

| Parameter | Value |
|-----------|-------|
| Model | `Qwen/Qwen3.5-122B-A10B` |
| API Endpoint | `http://llm-host:9000/v1` |
| Temperature | `0.1` (near-deterministic for consistency) |
| Max tokens | `512` |
| Input truncation | None (full chunk content is sent) |

---

## RAG Usability Score

### What it measures

How effective a chunk would be when retrieved by a RAG system and used as context for generating an answer. A high-scoring chunk can be retrieved by a relevant query, understood in isolation, and provides enough substantive information for a language model to produce an accurate response.

### Evaluation criteria

| Criterion | Description | Weight rationale |
|-----------|-------------|-----------------|
| **Self-containedness** | Can the chunk be understood without surrounding context? Chunks that reference "the above table" or "as mentioned earlier" score lower. | Retrieval systems surface individual chunks out of order. Context-dependent chunks cause hallucination or incomplete answers. |
| **Information density** | Does the chunk contain meaningful, substantive information? Headers, boilerplate, TOC fragments, and filler text score lower. | Low-density chunks waste the LLM's context window and dilute answer quality. |
| **Coherence** | Is there a consistent theme or logical flow within the chunk? Mixed-topic chunks or mid-sentence splits score lower. | Incoherent chunks confuse the generation model and produce unfocused answers. |
| **Retrievability** | Does the chunk contain keywords, concepts, and phrases that an embedding model would match to relevant queries? | If a chunk cannot be retrieved, its content is effectively invisible to the RAG system regardless of quality. |
| **Specificity** | Does the chunk address a concrete topic rather than vague generalities? | Specific chunks embed distinctly and retrieve precisely; vague chunks match too many queries with low relevance. |

### Score scale

| Range | Label | Description |
|-------|-------|-------------|
| 0-2 | Unusable | Empty content, headers only, meaningless fragments, or corrupted text. |
| 3-4 | Low quality | Heavily context-dependent, very thin on information, or incoherent. |
| 5-6 | Moderate | Partially useful but has clear deficiencies (e.g., some context dependency, mixed topics). |
| 7-8 | Good | Self-contained, information-rich, coherent, and retrievable. |
| 9-10 | Excellent | Fully self-contained, high information density, optimal for retrieval and generation. |

---

## FAQ Usability Score

### What it measures

How well a chunk can serve as source material for generating high-quality FAQ question-answer pairs. A high-scoring chunk contains information that naturally forms one or more clear questions and complete answers.

### Evaluation criteria

| Criterion | Description | Weight rationale |
|-----------|-------------|-----------------|
| **Q&A generation potential** | Does the chunk contain information that naturally lends itself to question-answer pairs? Can you read it and immediately think "someone would ask about this"? | The fundamental requirement: if no natural questions arise from the content, FAQ generation fails regardless of other qualities. |
| **Standalone comprehensibility** | Can the chunk serve as a complete FAQ answer without any external context? All necessary definitions, acronyms, and background must be present. | FAQ answers are read in isolation. An answer that says "see section 3.2" or assumes prior reading is useless. |
| **Clarity** | Is the language precise and unambiguous? Could it be used directly as an FAQ answer with minimal editing? | Ambiguous or jargon-heavy text produces confusing FAQ entries that don't serve end users. |
| **Completeness** | Does the chunk contain enough information to fully answer the implied question? | Partial answers (e.g., listing 3 of 5 steps) create misleading FAQs. |
| **Atomicity** | Does the chunk focus on one clear topic or fact? | Single-topic chunks generate focused, high-quality Q&A pairs. Multi-topic chunks produce vague or compound questions. |

### Score scale

| Range | Label | Description |
|-------|-------|-------------|
| 0-2 | Not viable | Table/figure fragments, context-free references, or content with no question-answer potential. |
| 3-4 | Difficult | Multiple topics mixed together, incomplete explanations, or heavy external dependencies. |
| 5-6 | Possible but flawed | Somewhat ambiguous, requires supplementation, or produces only low-quality Q&A pairs. |
| 7-8 | Good | Can generate one or more clear, well-formed Q&A pairs. |
| 9-10 | Optimal | Clear, complete, atomic content that can produce multiple high-quality Q&A pairs directly. |

---

## Methodology Selection Rationale

### Why LLM-as-a-Judge?

The evaluation uses an **LLM-as-a-Judge** approach rather than heuristic metrics (e.g., chunk length, keyword density) or embedding-based similarity. This decision was based on the following considerations:

1. **Multi-dimensional assessment**: Chunk quality for RAG/FAQ is inherently multi-dimensional (coherence, completeness, specificity, etc.). Rule-based heuristics can only capture surface-level features like length or formatting, missing semantic quality entirely.

2. **Language-aware evaluation**: The documents are primarily in Japanese. LLM judges can assess semantic coherence, completeness, and clarity in the target language without requiring language-specific heuristic tuning.

3. **Alignment with downstream tasks**: Since the chunks will ultimately be consumed by LLMs (in RAG and FAQ generation), using an LLM to evaluate them provides evaluation that is naturally aligned with how they will be used.

### Prompt design principles

The evaluation prompt follows established best practices from LLM-as-a-Judge research:

| Principle | Implementation | Source |
|-----------|---------------|--------|
| **Explicit rubric with level definitions** | Each score range (0-2, 3-4, 5-6, 7-8, 9-10) has a written description with example characteristics. | Prevents score clustering and improves inter-run consistency. (Evidently AI, Promptfoo) |
| **Reasoning before scoring** | The prompt requires the LLM to output a brief rationale before the JSON score. This is a prompt-level technique (not a model reasoning mode) — the model generates reasoning tokens as regular output, which grounds the subsequent scores. | Stating rationale before scoring improves alignment with human judgments and enables auditing. (Monte Carlo Data, Towards Data Science) |
| **Structured JSON output** | Scores are returned in a fixed `{"rag_score": N, "faq_score": N}` format. | Enables reliable programmatic parsing. |
| **Low temperature (0.1)** | Near-deterministic generation reduces score variance across runs. | Standard practice for evaluation tasks where consistency matters more than creativity. |
| **Separate dimension definitions** | Each criterion is defined independently rather than as a single holistic score. | Decomposed evaluation reduces cognitive load on the judge and produces more calibrated results. (RAGAS, DeepEval) |

### Why a 0-10 scale?

While research suggests that narrower scales (binary or 3-point) produce more reliable LLM judgments, the 0-10 scale was chosen here because:

1. **Finer granularity for comparison**: Users need to compare chunks within a document and prioritize which to edit. A 3-point scale would cluster most chunks into the middle tier.
2. **Mitigated by explicit anchoring**: The rubric provides detailed descriptions for each score band, reducing the unreliability typically associated with wide scales.
3. **User familiarity**: A 0-10 scale is intuitive for human reviewers who will be looking at these scores alongside manual feedback.

### Why these specific criteria?

The criteria were selected by synthesizing findings from multiple sources:

- **RAGAS framework**: Context relevancy, context recall, and faithfulness metrics informed the RAG usability dimensions.
- **ChunkRAG** (arXiv:2410.19572): Multi-pass scoring approach for chunk relevance evaluation validated the importance of self-containedness and information density.
- **QChunker** (arXiv:2603.11650): Question-aware text chunking research demonstrated that FAQ-style evaluation requires assessing Q&A generation potential directly.
- **Pinecone and NVIDIA chunking guides**: Practical engineering guidance on what makes chunks effective in production RAG systems informed the retrievability and specificity criteria.
- **DeepEval contextual metrics**: The distinction between precision (is the chunk relevant?) and recall (is the chunk complete?) shaped the completeness and atomicity criteria for FAQ.

### Limitations

1. **Single-judge variance**: Each chunk is evaluated by a single LLM call. Multi-judge averaging (running 3+ evaluations and taking the mean) would improve reliability but increases latency and cost proportionally.
2. **No calibration examples**: The current prompt does not include scored example chunks (few-shot). Adding 2-3 anchor examples per score band would further improve consistency.
3. **No human validation baseline**: The scores have not yet been validated against human annotations using inter-rater agreement metrics (e.g., Cohen's Kappa). This should be done before treating scores as authoritative.
4. **Very long chunks**: Extremely long chunks may increase evaluation latency, though the Qwen3.5-122B model's large context window handles typical chunk sizes without issue. No input truncation is applied.

---

## Technical Implementation

### Backend

- **Service**: `backend/services/llm_eval.py` - Contains the prompt, LLM API call, and response parsing logic.
- **API endpoint**: `GET /api/documents/{document_id}/evaluate-chunks` - SSE endpoint that evaluates all chunks in parallel and streams results as they complete.
- **Database columns**: `rag_score` (REAL, nullable), `faq_score` (REAL, nullable), and `ai_suggestion` (TEXT, nullable) on the `chunks` table.
- **Execution**: All chunks are evaluated concurrently via `asyncio.create_task`. RAG/FAQ scoring and AI suggestion run in parallel per chunk via `asyncio.gather`. Results stream to the frontend via Server-Sent Events.

### Frontend

- **Display**: Three columns in the chunk table (RAGの使いやすさ / FAQの使いやすさ / AI提案) with color-coded score badges:
  - Green (7-10): Good to excellent quality
  - Yellow (4-6): Moderate quality, may need improvement
  - Red (0-3): Low quality, likely needs re-chunking or editing
- **Trigger**: Evaluation starts automatically after chunking completes. Progress is shown on the chunking button (e.g., "評価中 3/15"). Results stream in real-time via SSE.

---

## References

1. Evidently AI. "LLM-as-a-Judge: Complete Guide." https://www.evidentlyai.com/llm-guide/llm-as-a-judge
2. RAGAS. "RAG Evaluation Framework." https://docs.ragas.io/
3. DeepEval. "RAG Evaluation Guide." https://deepeval.com/guides/guides-rag-evaluation
4. ChunkRAG. "Novel LLM-Based Chunk Filtering for RAG." arXiv:2410.19572
5. QChunker. "Question-Aware Text Chunking for RAG." arXiv:2603.11650
6. Pinecone. "Chunking Strategies for LLM Applications." https://www.pinecone.io/learn/chunking-strategies/
7. NVIDIA. "Finding the Best Chunking Strategy." https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/
8. Monte Carlo Data. "LLM-as-Judge Best Practices." https://www.montecarlodata.com/blog-llm-as-judge/
