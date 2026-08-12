/**
 * cert-to-kb MCP Server Types
 * Type definitions for the certificate processing system
 */

// Certificate Data Types
export interface CertificateRawData {
  filePath: string;
  fileName: string;
  fileSize: number;
  lastModified: Date;
  rawText: string;
}

export interface CertificateParsedData {
  institution: string;
  courseName: string;
  contentType: 'Skill' | 'Academic Experience' | 'Personal Interest';
  issueDate?: string;
  completionDate?: string;
  expirationDate?: string;
  duration?: string;
  recipient: string;
  certificateId?: string;
  description?: string;
  instructor?: string;
  level?: string;
  credits?: string;
  grade?: string;
  originalFile: string;
  source: 'Local' | 'Google Drive' | 'Notion' | 'Other';
  language: 'EN' | 'ES' | 'FR';
  links: string[];
  confidenceScores: Record<string, number>;
}

// Notion Entry Types
export interface NotionEntryBase {
  title: string;
  contentType: 'Skill' | 'Academic Experience' | 'Personal Interest';
  content: string;
  summary: string;
  tags: string[];
  priority: number;
  status: 'Draft' | 'Reviewed' | 'Published' | 'Archived';
  language: 'EN' | 'ES' | 'FR';
  source: 'Google Drive' | 'OneDrive' | 'Dropbox' | 'Notion' | 'GitHub' | 'Local' | 'Other';
  metadata: Record<string, unknown>;
  relatedTo?: string[];
}

export interface NotionSkillEntry extends NotionEntryBase {
  contentType: 'Skill';
  metadata: {
    originalFile: string;
    proficiency?: string;
    yearsOfExperience?: number;
    lastUsed?: string;
    category?: string;
  };
}

export interface NotionAcademicEntry extends NotionEntryBase {
  contentType: 'Academic Experience';
  metadata: {
    originalFile: string;
    institution: string;
    courseName: string;
    recipient?: string;
    dates?: {
      start?: string;
      end?: string;
    };
    gpa?: string;
    honors?: string;
    advisor?: string;
    certificateId?: string;
  };
}

export interface NotionPersonalEntry extends NotionEntryBase {
  contentType: 'Personal Interest';
  metadata: {
    originalFile: string;
    category: string;
    since?: string;
    frequency?: string;
  };
}

export type NotionEntry = NotionSkillEntry | NotionAcademicEntry | NotionPersonalEntry;

// Processing Results
export interface ProcessingResult {
  success: boolean;
  certificate: string;
  entriesCreated: {
    skill?: { pageId: string; pageUrl: string; title: string };
    academic?: { pageId: string; pageUrl: string; title: string };
    personal?: { pageId: string; pageUrl: string; title: string };
  };
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

export interface BatchProcessingResult {
  totalCertificates: number;
  successful: number;
  failed: number;
  results: ProcessingResult[];
  totalTimeMs: number;
  summary: {
    skillsCreated: number;
    academicCreated: number;
    personalCreated: number;
    duplicatesSkipped: number;
  };
}

// MCP Tool Schemas
export interface ListCertificatesParams {
  folderPath?: string;
  extensions?: string[];
  recursive?: boolean;
}

export interface ListCertificatesResult {
  certificates: Array<{
    fileName: string;
    filePath: string;
    fileSize: number;
    lastModified: string;
  }>;
  total: number;
}

export interface ReadPdfParams {
  filePath: string;
}

export interface ReadPdfResult {
  fileName: string;
  filePath: string;
  text: string;
  numPages: number;
  metadata: {
    author?: string;
    title?: string;
    creationDate?: string;
    modificationDate?: string;
  };
}

export interface ParseCertificateParams {
  filePath: string;
  text?: string;
}

export interface ParseCertificateResult {
  parsedData: CertificateParsedData;
  confidence: number;
  detectedType: 'Skill' | 'Academic Experience' | 'Personal Interest' | 'Unknown';
}

export interface CreateNotionEntryParams {
  entryData: NotionEntry;
  useTemplate?: boolean;
}

export interface CreateNotionEntryResult {
  pageId: string;
  pageUrl: string;
  title: string;
  contentType: string;
}

export interface ProcessAllCertificatesParams {
  folderPath?: string;
  dryRun?: boolean;
  overwrite?: boolean;
}

export interface ProcessAllCertificatesResult extends BatchProcessingResult {}

// Configuration Types
export interface ServerConfig {
  notionApiKey: string;
  notionDatabaseId: string;
  certificatesFolder: string;
  maxConcurrentProcessing: number;
  requestDelayMs: number;
  templates?: {
    skill?: string;
    academic?: string;
    professional?: string;
    project?: string;
    personal?: string;
  };
}
