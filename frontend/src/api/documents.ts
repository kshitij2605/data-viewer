import client from './client.ts';

export interface Document {
  id: number;
  folder_name: string;
  folder_path: string;
  pdf_title: string | null;
  num_pages: number;
  num_images: number;
  num_tables: number;
  ai_review_status?: string;
  source_type?: string;
  es_index?: string;
  es_parent_doc_id?: string;
  veda_collection?: string;
  veda_doc_id?: string;
  chunking_strategy?: string | null;
}

export interface AIReview {
  status: string;
  review: string | null;
}

export interface DocumentDetail extends Document {
  metadata: Record<string, unknown>;
  parsing_metrics: Record<string, unknown>;
}

export interface Table {
  description: string;
  content: string;
  page_number: number | null;
}

export interface TableImage {
  filename: string;
  page_number: number | null;
}

export interface ImageWithCaption {
  image_path: string;
  caption: string;
  image_type?: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  has_metadata: boolean;
  children_count: number;
}

export async function browsePath(path: string): Promise<DirEntry[]> {
  const res = await client.post<DirEntry[]>('/filesystem/browse', { path });
  return res.data;
}

export async function loadFolder(folderPath: string): Promise<Document> {
  const res = await client.post<Document>('/documents/load', {
    folder_path: folderPath,
  });
  return res.data;
}

export async function deleteDocument(id: number): Promise<void> {
  await client.delete(`/documents/${id}`);
}

export async function deleteAllDocuments(): Promise<void> {
  await client.delete('/documents/all');
}

export async function listDocuments(): Promise<Document[]> {
  const res = await client.get<Document[]>('/documents');
  return res.data;
}

export async function getDocument(id: number): Promise<DocumentDetail> {
  const res = await client.get<DocumentDetail>(`/documents/${id}`);
  return res.data;
}

export async function getMarkdown(id: number): Promise<string> {
  const res = await client.get<string>(`/documents/${id}/markdown`);
  return res.data;
}

export async function getPageMarkdown(id: number, pageNum: number): Promise<string> {
  const res = await client.get<{ content: string }>(`/documents/${id}/page/${pageNum}/markdown`);
  return res.data.content;
}

export async function getTextOnly(id: number): Promise<string[]> {
  const res = await client.get<{ paragraphs: string[] }>(
    `/documents/${id}/text-only`,
  );
  return res.data.paragraphs;
}

export async function getTablesOnly(id: number): Promise<{ tables: Table[]; table_images: TableImage[]; table_html_map: Record<string, string> }> {
  const res = await client.get<{ tables: Table[]; table_images: TableImage[]; table_html_map: Record<string, string> }>(
    `/documents/${id}/tables-only`,
  );
  return res.data;
}

export async function getImagesOnly(id: number): Promise<ImageWithCaption[]> {
  const res = await client.get<{ images: ImageWithCaption[] }>(
    `/documents/${id}/images-only`,
  );
  return res.data.images;
}

export async function getAIReview(id: number): Promise<AIReview> {
  const res = await client.get<AIReview>(`/documents/${id}/ai-review`);
  return res.data;
}

export async function retryAIReview(id: number): Promise<void> {
  await client.post(`/documents/${id}/ai-review/retry`);
}

// ---------------------------------------------------------------------------
// Elasticsearch integration
// ---------------------------------------------------------------------------

export interface ESIndex {
  index_name: string;
  doc_count: number;
}

export interface ESDocument {
  parent_doc_id: string;
  filename: string;
  chunk_count: number;
  num_pages: number;
  index_name: string;
  already_imported: boolean;
}

export interface ImportResult {
  id: number;
  folder_name: string;
  pdf_title: string | null;
  num_pages: number;
  num_images: number;
  num_tables: number;
  chunks_imported: number;
}

export async function listESIndices(): Promise<ESIndex[]> {
  const res = await client.get<ESIndex[]>('/es/indices');
  return res.data;
}

export async function listESDocuments(index: string): Promise<ESDocument[]> {
  const res = await client.get<ESDocument[]>('/es/documents', { params: { index } });
  return res.data;
}

export async function importESDocument(parentDocId: string, index: string): Promise<ImportResult> {
  const res = await client.post<ImportResult>(
    `/es/documents/${encodeURIComponent(parentDocId)}/import`,
    null,
    { params: { index } },
  );
  return res.data;
}

export async function refreshFromES(documentId: number): Promise<void> {
  await client.post(`/es/documents/${documentId}/refresh`);
}

// ---------------------------------------------------------------------------
// Veda vector database integration
// Reuses the ESIndex / ESDocument / ImportResult shapes — `index_name` carries
// the Veda collection name.
// ---------------------------------------------------------------------------

export async function listVedaCollections(): Promise<ESIndex[]> {
  const res = await client.get<ESIndex[]>('/veda/collections');
  return res.data;
}

export async function listVedaDocuments(collection: string): Promise<ESDocument[]> {
  const res = await client.get<ESDocument[]>('/veda/documents', { params: { collection } });
  return res.data;
}

export async function importVedaDocument(parentDocId: string, collection: string): Promise<ImportResult> {
  const res = await client.post<ImportResult>(
    `/veda/documents/${encodeURIComponent(parentDocId)}/import`,
    null,
    { params: { collection } },
  );
  return res.data;
}

export async function refreshFromVeda(documentId: number): Promise<void> {
  await client.post(`/veda/documents/${documentId}/refresh`);
}
