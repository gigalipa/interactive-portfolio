/**
 * PDF Reading Tool for cert-to-kb MCP Server
 * Extracts text and metadata from PDF certificates
 */

import { promises as fs } from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { ReadPdfParams, ReadPdfResult } from '../types.js';

export async function readPdfFile(filePath: string): Promise<{ text: string; numPages: number; metadata: { author?: string; title?: string; creationDate?: string; modificationDate?: string; } }> {
  try { await fs.access(filePath); } catch (error) { throw new Error(`PDF file not found: ${filePath}`); }
  const dataBuffer = await fs.readFile(filePath);
  const pdfData = await pdfParse(dataBuffer);
  return {
    text: pdfData.text,
    numPages: pdfData.numpages,
    metadata: {
      author: pdfData.info?.Author,
      title: pdfData.info?.Title,
      creationDate: pdfData.info?.CreationDate,
      modificationDate: pdfData.info?.ModDate,
    },
  };
}

export async function isValidPdf(filePath: string): Promise<boolean> {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const header = dataBuffer.subarray(0, 4).toString();
    return header === '%PDF';
  } catch { return false; }
}

export async function getFileMetadata(filePath: string): Promise<{ fileName: string; fileSize: number; lastModified: Date; extension: string; }> {
  const stats = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return { fileName, fileSize: stats.size, lastModified: stats.mtime, extension };
}

export async function handleReadPdf(params: ReadPdfParams): Promise<ReadPdfResult> {
  const { filePath } = params;
  const isPdf = await isValidPdf(filePath);
  if (!isPdf) throw new Error(`File is not a valid PDF: ${filePath}`);
  const { text, numPages, metadata } = await readPdfFile(filePath);
  const fileMetadata = await getFileMetadata(filePath);
  return {
    fileName: fileMetadata.fileName,
    filePath,
    text,
    numPages,
    metadata: {
      author: metadata.author,
      title: metadata.title || fileMetadata.fileName,
      creationDate: metadata.creationDate,
      modificationDate: metadata.modificationDate || fileMetadata.lastModified.toISOString(),
    },
  };
}

export function cleanPdfText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function isCertificateText(text: string): boolean {
  const cleaned = cleanPdfText(text).toLowerCase();
  const certificateIndicators = ['certificate', 'diploma', 'completion', 'awarded to', 'this certifies', 'has successfully completed', 'participation', 'course', 'training', 'workshop', 'bootcamp', 'certified', 'accreditation'];
  return certificateIndicators.some(indicator => cleaned.includes(indicator));
}

export default { readPdfFile, isValidPdf, getFileMetadata, handleReadPdf, cleanPdfText, isCertificateText };
