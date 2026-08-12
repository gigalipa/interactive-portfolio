/**
 * Certificate Listing Tool for cert-to-kb MCP Server
 * Lists PDF certificates in a folder
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ListCertificatesParams, ListCertificatesResult } from '../types.js';
import { getConfig } from '../config.js';
import { isValidPdf, getFileMetadata } from './read-pdf.js';

export async function listPdfFiles(folderPath: string, recursive: boolean = true) {
  const files: Array<{ fileName: string; filePath: string; fileSize: number; lastModified: string }> = [];
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          const subFiles = await listPdfFiles(fullPath, recursive);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        try {
          const isPdf = await isValidPdf(fullPath);
          if (isPdf) {
            const metadata = await getFileMetadata(fullPath);
            files.push({
              fileName: entry.name,
              filePath: fullPath,
              fileSize: metadata.fileSize,
              lastModified: metadata.lastModified.toISOString(),
            });
          }
        } catch { /* Skip files that can't be read */ }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${folderPath}:`, error);
  }
  files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return files;
}

export async function getCertificates(params?: ListCertificatesParams): Promise<ListCertificatesResult> {
  const config = getConfig();
  const folderPath = params?.folderPath || config.certificatesFolder;
  const extensions = params?.extensions || ['.pdf'];
  const recursive = params?.recursive ?? true;
  const files = await listPdfFiles(folderPath, recursive);
  const certificates = extensions.length > 0 
    ? files.filter(file => extensions.some(ext => file.fileName.toLowerCase().endsWith(ext.toLowerCase())))
    : files;
  return { certificates, total: certificates.length };
}

export async function handleListCertificates(params?: ListCertificatesParams): Promise<ListCertificatesResult> {
  return getCertificates(params);
}

export default { listPdfFiles, getCertificates, handleListCertificates };
