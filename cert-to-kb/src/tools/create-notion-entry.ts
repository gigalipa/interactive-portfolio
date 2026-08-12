/**
 * Notion Integration for cert-to-kb MCP Server
 */

import { Client } from '@notionhq/client';
import { getConfig } from '../config.js';
import { NotionEntry, NotionSkillEntry, NotionAcademicEntry, NotionPersonalEntry, CreateNotionEntryParams, CreateNotionEntryResult } from '../types.js';

let notionClient: Client | null = null;

export function getNotionClient(): Client {
  if (!notionClient) {
    const config = getConfig();
    notionClient = new Client({ auth: config.notionApiKey, timeoutMs: 30000 });
  }
  return notionClient;
}

export function resetNotionClient(): void { notionClient = null; }

function mapContentType(contentType: string): string {
  const mapping: Record<string, string> = {
    'Skill': 'Skill', 'Academic Experience': 'Academic Experience',
    'Personal Interest': 'Personal Interest',
  };
  return mapping[contentType] || 'Personal Interest';
}

function mapStatus(status: string): string {
  const mapping: Record<string, string> = {
    'Draft': 'Draft', 'Reviewed': 'Reviewed', 'Published': 'Published', 'Archived': 'Archived',
  };
  return mapping[status] || 'Draft';
}

function mapSource(source: string): string {
  const mapping: Record<string, string> = {
    'Google Drive': 'Google Drive', 'OneDrive': 'OneDrive', 'Dropbox': 'Dropbox',
    'Notion': 'Notion', 'GitHub': 'GitHub', 'Local': 'Local', 'Other': 'Other',
  };
  return mapping[source] || 'Local';
}

function mapLanguage(language: string): string {
  const mapping: Record<string, string> = { 'EN': 'EN', 'ES': 'ES', 'FR': 'FR' };
  return mapping[language] || 'EN';
}

export async function createNotionEntry(entry: NotionEntry): Promise<CreateNotionEntryResult> {
  const config = getConfig();
  const notion = getNotionClient();
  const databaseId = config.notionDatabaseId.replace('collection://', '');
  type PageProperties = Parameters<typeof notion.pages.create>[0]['properties'];
  const properties: PageProperties = {
    Title: { title: [{ text: { content: entry.title } }] },
    'Content Type': { select: { name: mapContentType(entry.contentType) } },
    Content: { rich_text: [{ text: { content: entry.content.slice(0, 2000) } }] },
    Summary: { rich_text: [{ text: { content: entry.summary } }] },
    Tags: { multi_select: entry.tags.map(tag => ({ name: tag })) },
    Status: { select: { name: mapStatus(entry.status) } },
    Priority: { number: entry.priority },
    Language: { select: { name: mapLanguage(entry.language) } },
    Source: { select: { name: mapSource(entry.source) } },
    Metadata: { rich_text: [{ text: { content: JSON.stringify(entry.metadata).slice(0, 2000) } }] },
  };
  if (entry.relatedTo && entry.relatedTo.length > 0) {
    (properties as Record<string, unknown>)['Related To'] = { relation: entry.relatedTo.map(id => ({ id })) };
  }
  const response = await notion.pages.create({ parent: { database_id: databaseId }, properties });
  const page = response as { id: string; url: string };
  return { pageId: page.id, pageUrl: page.url, title: entry.title, contentType: entry.contentType };
}

export async function createSkillEntry(entry: NotionSkillEntry): Promise<CreateNotionEntryResult> {
  const content = buildSkillContent(entry);
  const summary = buildSkillSummary(entry);
  return createNotionEntry({ ...entry, content, summary });
}

export async function createAcademicEntry(entry: NotionAcademicEntry): Promise<CreateNotionEntryResult> {
  const content = buildAcademicContent(entry);
  const summary = buildAcademicSummary(entry);
  return createNotionEntry({ ...entry, content, summary });
}

export async function createPersonalEntry(entry: NotionPersonalEntry): Promise<CreateNotionEntryResult> {
  const content = buildPersonalContent(entry);
  const summary = buildPersonalSummary(entry);
  return createNotionEntry({ ...entry, content, summary });
}

function buildSkillContent(entry: NotionSkillEntry): string {
  const metadata = entry.metadata as NotionSkillEntry['metadata'];
  const lines = [
    `## ${entry.title}`,
    '',
    `**Category:** ${metadata.category || 'Technical'}`,
    `**Proficiency:** ${metadata.proficiency || 'Certified'}`,
    `**Last Used:** ${metadata.lastUsed || 'Unknown'}`,
    '',
    `### Certification`,
    `Certified through: ${metadata.originalFile}`,
  ];
  return lines.join('\n');
}

function buildSkillSummary(entry: NotionSkillEntry): string {
  const metadata = entry.metadata as NotionSkillEntry['metadata'];
  return `Certified in ${entry.title} (${metadata.proficiency || 'Certified'} level)`;
}

function buildAcademicContent(entry: NotionAcademicEntry): string {
  const metadata = entry.metadata as NotionAcademicEntry['metadata'];
  const lines = [
    `## ${metadata.courseName || entry.title}`,
    '',
    `**Institution:** ${metadata.institution || 'Unknown'}`,
    `**Recipient:** ${metadata.recipient || 'Daniel Arturo Peraza'}`,
    `**Certificate ID:** ${metadata.certificateId || 'Not specified'}`,
    `**Dates:** ${metadata.dates?.start || 'Unknown'} - ${metadata.dates?.end || 'Unknown'}`,
    '',
    `### Overview`,
    `Completed ${metadata.courseName || entry.title} at ${metadata.institution || 'Unknown Institution'}.`,
    '',
    `### Key Learnings`,
    `- ${entry.title} fundamentals`,
    `- Practical applications`,
    '- Best practices',
  ];
  if (metadata.gpa) lines.push(`**GPA:** ${metadata.gpa}`);
  if (metadata.honors) lines.push(`**Honors:** ${metadata.honors}`);
  return lines.join('\n');
}

function buildAcademicSummary(entry: NotionAcademicEntry): string {
  const metadata = entry.metadata as NotionAcademicEntry['metadata'];
  return `Completed ${metadata.courseName || entry.title} at ${metadata.institution || 'Unknown'}`;
}

function buildPersonalContent(entry: NotionPersonalEntry): string {
  const metadata = entry.metadata as NotionPersonalEntry['metadata'];
  const lines = [
    `## ${entry.title}`,
    '',
    `**Category:** ${metadata.category || 'Professional Development'}`,
    `**Since:** ${metadata.since || 'Unknown'}`,
    '',
    `### Why I'm Passionate About This`,
    `This interest developed from a passion for continuous learning and self-improvement.`,
    '',
    `### Key Activities`,
    `- Regular practice`,
    '- Community participation',
    '',
    `### How This Relates to My Professional Work`,
    `This personal interest complements my professional skills.`,
  ];
  return lines.join('\n');
}

function buildPersonalSummary(entry: NotionPersonalEntry): string {
  const metadata = entry.metadata as NotionPersonalEntry['metadata'];
  return `${entry.title} - ${metadata.category || 'Professional Development'} interest`;
}

export async function checkForDuplicate(title: string): Promise<boolean> {
  const config = getConfig();
  const notion = getNotionClient();
  const databaseId = config.notionDatabaseId.replace('collection://', '');
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: 'Title', title: { equals: title } },
      page_size: 1,
    });
    return response.results.length > 0;
  } catch (error) {
    console.error('Error checking for duplicate:', error);
    return false;
  }
}

export async function createEntriesBatch(entries: NotionEntry[], delayMs: number = 1000): Promise<CreateNotionEntryResult[]> {
  const results: CreateNotionEntryResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      const result = await createNotionEntry(entries[i]);
      results.push(result);
      if (i < entries.length - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Error creating entry ${i + 1}/${entries.length}:`, error);
      results.push({ pageId: '', pageUrl: '', title: entries[i].title, contentType: entries[i].contentType });
    }
  }
  return results;
}

export async function handleCreateNotionEntry(params: CreateNotionEntryParams): Promise<CreateNotionEntryResult> {
  return createNotionEntry(params.entryData);
}

export default { getNotionClient, resetNotionClient, createNotionEntry, createSkillEntry, createAcademicEntry, createPersonalEntry, checkForDuplicate, createEntriesBatch, handleCreateNotionEntry };
