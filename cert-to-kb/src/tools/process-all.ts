/**
 * Process All Certificates Tool for cert-to-kb MCP Server
 */

import path from 'path';
import { getConfig } from '../config.js';
import { listPdfFiles } from './list-certificates.js';
import { readPdfFile } from './read-pdf.js';
import { parseCertificate, determinePriority, extractTags } from './parse-certificate.js';
import { createNotionEntry, checkForDuplicate } from './create-notion-entry.js';
import { ProcessingResult, BatchProcessingResult, ProcessAllCertificatesParams, CertificateParsedData } from '../types.js';
import { NotionEntry, NotionSkillEntry, NotionAcademicEntry, NotionPersonalEntry } from '../types.js';

function convertToNotionEntry(parsedData: CertificateParsedData, filePath: string): NotionEntry {
  const priority = determinePriority(parsedData.description || parsedData.courseName, parsedData.contentType);
  const tags = extractTags(parsedData.description || parsedData.courseName, parsedData.contentType);
  if (parsedData.institution && !tags.includes(parsedData.institution.toLowerCase())) tags.push(parsedData.institution);
  if (parsedData.courseName && !tags.includes(parsedData.courseName.toLowerCase())) tags.push(parsedData.courseName);
  const commonEntry = {
    title: `${parsedData.courseName} - ${parsedData.institution}`,
    content: buildContent(parsedData),
    summary: buildSummary(parsedData),
    tags,
    priority,
    status: 'Published' as const,
    language: parsedData.language,
    source: parsedData.source,
  };
  switch (parsedData.contentType) {
    case 'Skill': {
      const entry: NotionSkillEntry = {
        ...commonEntry,
        contentType: 'Skill',
        metadata: { originalFile: parsedData.originalFile, category: 'Technical', proficiency: 'Certified' },
      };
      return entry;
    }
    case 'Academic Experience': {
      const entry: NotionAcademicEntry = {
        ...commonEntry,
        contentType: 'Academic Experience',
        metadata: {
          originalFile: parsedData.originalFile,
          institution: parsedData.institution,
          courseName: parsedData.courseName,
          recipient: parsedData.recipient,
          certificateId: parsedData.certificateId,
          dates: { start: parsedData.issueDate, end: parsedData.completionDate },
        },
      };
      return entry;
    }
    case 'Personal Interest': {
      const entry: NotionPersonalEntry = {
        ...commonEntry,
        contentType: 'Personal Interest',
        metadata: { originalFile: parsedData.originalFile, category: 'Professional Development', since: parsedData.issueDate },
      };
      return entry;
    }
  }
}

function buildContent(parsedData: CertificateParsedData): string {
  const lines: string[] = [`## ${parsedData.courseName}`, '', `**Institution:** ${parsedData.institution || 'Unknown'}`, `**Recipient:** ${parsedData.recipient || 'Daniel Arturo Peraza'}`];
  if (parsedData.certificateId) lines.push(`**Certificate ID:** ${parsedData.certificateId}`);
  if (parsedData.issueDate) lines.push(`**Date:** ${parsedData.issueDate}`);
  if (parsedData.instructor) lines.push(`**Instructor:** ${parsedData.instructor}`);
  if (parsedData.level) lines.push(`**Level:** ${parsedData.level}`);
  if (parsedData.credits) lines.push(`**Credits:** ${parsedData.credits}`);
  if (parsedData.grade) lines.push(`**Grade:** ${parsedData.grade}`);
  lines.push('', '### Overview', `Certificate for ${parsedData.courseName} from ${parsedData.institution}.`);
  if (parsedData.description) lines.push('', parsedData.description);
  return lines.join('\n');
}

function buildSummary(parsedData: CertificateParsedData): string {
  let summary = `${parsedData.courseName}`;
  if (parsedData.institution) summary += ` from ${parsedData.institution}`;
  if (parsedData.issueDate) summary += ` (${parsedData.issueDate})`;
  return summary;
}

export async function processCertificate(filePath: string, dryRun: boolean = false, overwrite: boolean = false): Promise<ProcessingResult> {
  const startTime = Date.now();
  const fileName = path.basename(filePath);
  const result: ProcessingResult = { success: false, certificate: fileName, entriesCreated: {}, errors: [], warnings: [], processingTimeMs: 0 };
  try {
    const { text } = await readPdfFile(filePath);
    const { parsedData, confidence } = await parseCertificate({ filePath, text });
    if (confidence < 0.3) result.warnings.push(`Low confidence (${(confidence * 100).toFixed(1)}%) in parsing: ${fileName}`);
    const entry = convertToNotionEntry(parsedData, filePath);
    const isDuplicate = await checkForDuplicate(entry.title);
    if (isDuplicate && !overwrite) {
      result.warnings.push(`Duplicate entry detected, skipping: ${entry.title}`);
      result.success = true;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
    const entryKey: keyof ProcessingResult['entriesCreated'] =
      parsedData.contentType === 'Skill' ? 'skill' : parsedData.contentType === 'Academic Experience' ? 'academic' : 'personal';
    if (!dryRun) {
      const created = await createNotionEntry(entry);
      result.entriesCreated[entryKey] = { pageId: created.pageId, pageUrl: created.pageUrl, title: created.title };
    } else {
      result.entriesCreated[entryKey] = { pageId: '', pageUrl: `[DRY RUN] Would create: ${entry.title}`, title: entry.title };
      result.warnings.push(`[DRY RUN] Would create entry: ${entry.title}`);
    }
    result.success = true;
  } catch (error) {
    result.success = false;
    result.errors.push(`Failed to process ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Error processing ${fileName}:`, error);
  }
  result.processingTimeMs = Date.now() - startTime;
  return result;
}

export async function processAllCertificates(params?: ProcessAllCertificatesParams): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const config = getConfig();
  const folderPath = params?.folderPath || config.certificatesFolder;
  const dryRun = params?.dryRun ?? false;
  const overwrite = params?.overwrite ?? false;
  const result: BatchProcessingResult = {
    totalCertificates: 0, successful: 0, failed: 0, results: [],
    totalTimeMs: 0, summary: { skillsCreated: 0, academicCreated: 0, personalCreated: 0, duplicatesSkipped: 0 }
  };
  try {
    const certificates = await listPdfFiles(folderPath, true);
    result.totalCertificates = certificates.length;
    if (certificates.length === 0) {
      result.results.push({ success: false, certificate: 'No certificates found', entriesCreated: {}, errors: [`No PDF certificates found in ${folderPath}`], warnings: [], processingTimeMs: 0 });
      result.totalTimeMs = Date.now() - startTime;
      return result;
    }
    const delayMs = config.requestDelayMs;
    for (let i = 0; i < certificates.length; i++) {
      const cert = certificates[i];
      try {
        const processingResult = await processCertificate(cert.filePath, dryRun, overwrite);
        result.results.push(processingResult);
        if (processingResult.success) {
          result.successful++;
          if (processingResult.entriesCreated.skill) result.summary.skillsCreated++;
          if (processingResult.entriesCreated.academic) result.summary.academicCreated++;
          if (processingResult.entriesCreated.personal) result.summary.personalCreated++;
          if (processingResult.warnings.some(w => w.includes('Duplicate'))) result.summary.duplicatesSkipped++;
        } else { result.failed++; }
        if (i < certificates.length - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error) {
        result.failed++;
        result.results.push({ success: false, certificate: cert.fileName, entriesCreated: {}, errors: [`Unexpected error: ${error instanceof Error ? error.message : String(error)}`], warnings: [], processingTimeMs: 0 });
      }
    }
  } catch (error) {
    result.results.push({ success: false, certificate: 'Batch processing', entriesCreated: {}, errors: [`Batch processing failed: ${error instanceof Error ? error.message : String(error)}`], warnings: [], processingTimeMs: 0 });
    result.failed = result.totalCertificates;
  }
  result.totalTimeMs = Date.now() - startTime;
  return result;
}

export async function handleProcessAllCertificates(params?: ProcessAllCertificatesParams): Promise<BatchProcessingResult> {
  return processAllCertificates(params);
}

export default { processCertificate, processAllCertificates, handleProcessAllCertificates, convertToNotionEntry };
