import client from './client.ts';

export interface Document {
  id: number;
  folder_name: string;
  folder_path: string;
  pdf_title: string | null;
  num_pages: number;
  num_images: number;
  num_tables: number;
}

export interface DocumentDetail extends Document {
  metadata: Record<string, unknown>;
  parsing_metrics: Record<string, unknown>;
}

export interface Table {
  description: string;
  content: string;
}

export interface ImageWithCaption {
  image_path: string;
  caption: string;
  image_type?: string;
}

export async function loadFolder(folderPath: string): Promise<Document> {
  const res = await client.post<Document>('/documents/load', {
    folder_path: folderPath,
  });
  return res.data;
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

export async function getTextOnly(id: number): Promise<string[]> {
  const res = await client.get<{ paragraphs: string[] }>(
    `/documents/${id}/text-only`,
  );
  return res.data.paragraphs;
}

export async function getTablesOnly(id: number): Promise<Table[]> {
  const res = await client.get<{ tables: Table[] }>(
    `/documents/${id}/tables-only`,
  );
  return res.data.tables;
}

export async function getImagesOnly(id: number): Promise<ImageWithCaption[]> {
  const res = await client.get<{ images: ImageWithCaption[] }>(
    `/documents/${id}/images-only`,
  );
  return res.data.images;
}
