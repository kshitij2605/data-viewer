import client from './client.ts';

export interface ChunkParams {
  strategy: string;
  chunk_size?: number;
  chunk_overlap?: number;
  similarity_threshold?: number;
  min_chunk_size?: number;
}

export interface Chunk {
  id: number;
  chunk_index: number;
  page_number: number;
  content: string;
  is_modified: boolean;
  feedback_emoji: string | null;
  feedback_comment: string | null;
  image_refs: string[];
  rag_score: number | null;
  faq_score: number | null;
  ai_suggestion: string | null;
}

export type ChunkDetail = Chunk;

export interface ChunkListResponse {
  chunks: Chunk[];
  total: number;
  page: number;
  per_page: number;
}

export async function triggerChunking(
  docId: number,
  params: ChunkParams,
): Promise<Chunk[] | { task_id: string; status: string }> {
  const res = await client.post(`/documents/${docId}/chunk`, params);
  return res.data;
}

export async function getChunks(
  docId: number,
  params?: { search?: string; page?: number; per_page?: number },
): Promise<ChunkListResponse> {
  const res = await client.get<ChunkListResponse>(
    `/documents/${docId}/chunks`,
    { params },
  );
  return res.data;
}

export async function getChunk(
  docId: number,
  chunkId: number,
): Promise<ChunkDetail> {
  const res = await client.get<ChunkDetail>(
    `/documents/${docId}/chunks/${chunkId}`,
  );
  return res.data;
}

export interface EditChunkResponse {
  id: number;
  chunk_id: number;
  original_content: string;
  modified_content: string;
  es_synced?: boolean;
}

export async function editChunk(
  chunkId: number,
  modifiedContent: string,
): Promise<EditChunkResponse> {
  const res = await client.put<EditChunkResponse>(`/chunks/${chunkId}/edit`, {
    modified_content: modifiedContent,
  });
  return res.data;
}

export async function getDiff(
  chunkId: number,
): Promise<{ original: string; modified: string }> {
  const res = await client.get<{ original: string; modified: string }>(
    `/chunks/${chunkId}/diff`,
  );
  return res.data;
}

export async function deleteEdit(chunkId: number): Promise<void> {
  await client.delete(`/chunks/${chunkId}/edit`);
}

export async function deleteAllChunks(docId: number): Promise<void> {
  await client.delete(`/documents/${docId}/chunks`);
}

export async function deleteChunk(chunkId: number): Promise<{ es_synced: boolean }> {
  const res = await client.delete<{ es_synced: boolean }>(`/chunks/${chunkId}`);
  return res.data;
}

export interface EvalSingleResult {
  chunk_id: number;
  rag_score: number | null;
  faq_score: number | null;
  ai_suggestion: string | null;
}

export async function evaluateChunk(chunkId: number): Promise<EvalSingleResult> {
  const res = await client.post<EvalSingleResult>(`/chunks/${chunkId}/evaluate`);
  return res.data;
}

export interface EvalResult {
  type: 'start' | 'result' | 'done';
  chunk_id?: number;
  rag_score?: number | null;
  faq_score?: number | null;
  ai_suggestion?: string | null;
  completed?: number;
  total?: number;
}

export function subscribeEvaluation(
  docId: number,
  onMessage: (data: EvalResult) => void,
): EventSource {
  const token = localStorage.getItem('token') ?? '';
  const url = `/api/documents/${docId}/evaluate-chunks?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try {
      const data: EvalResult = JSON.parse(event.data);
      onMessage(data);
    } catch { /* ignore */ }
  };
  return es;
}

export interface ChunkStats {
  total: number;
  scored: number;
  avg_rag: number | null;
  median_rag: number | null;
  avg_faq: number | null;
  median_faq: number | null;
}

export async function getChunkStats(docId: number): Promise<ChunkStats> {
  const res = await client.get<ChunkStats>(`/documents/${docId}/chunk-stats`);
  return res.data;
}

export function subscribeChunkStatus(
  docId: number,
  taskId: string,
  onMessage: (data: unknown) => void,
): EventSource {
  const token = localStorage.getItem('token') ?? '';
  const url = `/api/documents/${docId}/chunk-status?task_id=${encodeURIComponent(taskId)}&token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try {
      const data: unknown = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };
  return es;
}
