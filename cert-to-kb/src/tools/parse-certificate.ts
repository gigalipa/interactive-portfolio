/**
 * Certificate Parser for cert-to-kb MCP Server
 * Intelligently extracts structured data from certificate text
 */

import path from 'path';
import { cleanPdfText } from './read-pdf.js';
import { CertificateParsedData, ParseCertificateParams, ParseCertificateResult } from '../types.js';

const EXTRACTION_PATTERNS: Record<string, Array<{ regex: RegExp; transform?: (match: RegExpMatchArray) => string }>> = {
  institution: [
    { regex: /(?:issued by|presented by|from|by)\s+([A-Z][A-Za-z\s\-&.,']+?)(?:\n|\s{2,}|$)/i },
    { regex: /([A-Z][A-Za-z\s\-&.,']+?)\s+(?:university|college|institute|institution|school|academy|company|corporation|inc\.|llc|ltd)/i },
    { regex: /^([A-Z][A-Za-z\s\-&.,']+)/m },
  ],
  courseName: [
    { regex: /(?:course|diploma|certificate|workshop|training|bootcamp|program)\s+[:\-]?\s+([A-Z][A-Za-z\s\-:.,()']+?)(?:\n|\s{2,})/i },
    { regex: /"([^"]+)"/ },
    { regex: /'([^']+)'/ },
    { regex: /\b(?:in|for|of)\s+([A-Z][A-Za-z\s\-:.,()']+?)(?:\n|\s{2,})/i },
  ],
  recipient: [
    { regex: /(?:awarded to|presented to|this certifies that|issued to|to)\s+([A-Z][A-Za-z\s\-']+)/i },
    { regex: /\bname:\s*([A-Z][A-Za-z\s\-']+)/i },
    { regex: /\bparticipant:\s*([A-Z][A-Za-z\s\-']+)/i },
    { regex: /\bstudent:\s*([A-Z][A-Za-z\s\-']+)/i },
  ],
  certificateId: [ { regex: /\b(?:id|certificate id|cert #|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\s\-]+)/i } ],
  issueDate: [
    { regex: /\b(?:issued|date|completed|awarded|graduated)\s+(?:on\s+)?([A-Za-z]+\s\d{1,2},?\s\d{4})/i },
    { regex: /\b(?:issued|date|completed)\s+(?:on\s+)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i },
    { regex: /\b(\d{4})/ },
  ],
  instructor: [ { regex: /\b(?:instructor|teacher|tutor|by)\s+[:\-]?\s*([A-Z][A-Za-z\s\-']+)/i } ],
  level: [
    { regex: /\b(?:level|difficulty)\s*[:\-]?\s*([A-Za-z]+)/i },
    { regex: /\b(beginner|intermediate|advanced|expert|master|fundamental|basic)\b/i },
  ],
  credits: [
    { regex: /\b(?:credits?|hours?|duration)\s*[:\-]?\s*([\d.]+\s*(?:hours?|credits?|hrs))/i },
    { regex: /\b(\d+)\s+(?:hour|credit|hr)/i },
  ],
  grade: [
    { regex: /\b(?:grade|score|result)\s*[:\-]?\s*([A-Z+\-]+|\d+(?:\.\d+)?%?)/i },
    { regex: /\b(?:passed|completed|achieved)\s+(?:with\s+)?(?:a\s+)?(grade\s+)?([A-Z+\-]+|\d+%)/i },
  ],
};

const TYPE_DETECTION_PATTERNS: Record<string, { keywords: string[]; weight: number }> = {
  'Academic Experience': { keywords: ['university', 'college', 'academy', 'institute', 'school', 'faculty', 'degree', 'diploma', 'bachelor', 'master', 'phd', 'doctorate', 'course', 'lecture', 'seminar', 'thesis', 'dissertation', 'gpa', 'credits', 'transcript', 'academic', 'education'], weight: 1.5 },
  'Skill': { keywords: ['certification', 'certified', 'proficiency', 'expert', 'specialist', 'skill', 'competency', 'qualification', 'accreditation', 'training', 'workshop', 'bootcamp', 'mastery'], weight: 1.2 },
  'Personal Interest': { keywords: ['hobby', 'interest', 'passion', 'personal', 'self-improvement', 'volunteer', 'community', 'club', 'society'], weight: 1.0 },
};

export function extractField(text: string, field: keyof typeof EXTRACTION_PATTERNS): string | undefined {
  const patterns = EXTRACTION_PATTERNS[field];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      let value = match[1]?.trim();
      if (value && pattern.transform) value = pattern.transform(match);
      if (value) return value;
    }
  }
  return undefined;
}

function detectCertificateType(text: string): { detectedType: 'Skill' | 'Academic Experience' | 'Personal Interest' | 'Unknown'; confidenceScores: Record<string, number>; } {
  const cleaned = cleanPdfText(text).toLowerCase();
  const scores: Record<string, number> = { 'Academic Experience': 0, 'Skill': 0, 'Personal Interest': 0 };
  for (const [type, config] of Object.entries(TYPE_DETECTION_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (cleaned.includes(keyword)) scores[type] += config.weight;
    }
  }
  let maxScore = -1;
  let detectedType: 'Skill' | 'Academic Experience' | 'Personal Interest' | 'Unknown' = 'Unknown';
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) { maxScore = score; detectedType = type as 'Skill' | 'Academic Experience' | 'Personal Interest' | 'Unknown'; }
  }
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const confidenceScores = Object.entries(scores).reduce((result, [type, score]) => { result[type] = totalScore > 0 ? score / totalScore : 0; return result; }, {} as Record<string, number>);
  if (detectedType === 'Unknown' || maxScore < 0.5) {
    if (cleaned.includes('university') || cleaned.includes('college') || cleaned.includes('degree')) return { detectedType: 'Academic Experience', confidenceScores: { ...confidenceScores, 'Academic Experience': 0.8 } };
    if (cleaned.includes('certification') || cleaned.includes('certified')) return { detectedType: 'Skill', confidenceScores: { ...confidenceScores, 'Skill': 0.8 } };
  }
  return { detectedType, confidenceScores };
}

function formatDate(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;
  let cleaned = dateString.replace(/[^\d\s\-\/:,]/g, '').trim();
  if (/^\d{4}[\-\/]\d{2}[\-\/]\d{2}$/.test(cleaned)) return cleaned;
  if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(cleaned)) return cleaned;
  if (/^\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}$/.test(cleaned)) {
    const parts = cleaned.split(/[\-\/]/);
    if (parts.length === 3) {
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      return day > 12 ? `${year}-${parts[1]}-${parts[0]}` : `${year}-${parts[0]}-${parts[1]}`;
    }
  }
  if (/^\d{4}$/.test(cleaned)) return cleaned;
  return cleaned;
}

export function extractTags(text: string, contentType: string): string[] {
  const cleaned = cleanPdfText(text).toLowerCase();
  const tags: Set<string> = new Set();
  const contentTags: Record<string, string[]> = {
    'Academic Experience': ['education', 'academic', 'course', 'learning', 'study'],
    'Skill': ['skill', 'competency', 'certification', 'training'],
    'Personal Interest': ['personal', 'interest', 'hobby', 'development'],
  };
  if (contentTags[contentType]) contentTags[contentType].forEach(tag => tags.add(tag));
  const skillKeywords = ['python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'go', 'rust', 'php', 'html', 'css', 'react', 'node', 'angular', 'vue', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'sql', 'mongodb', 'postgresql', 'mysql', 'machine learning', 'ai', 'artificial intelligence', 'data science', 'autocad', 'solidworks', 'blender', 'photoshop', 'illustrator', 'english', 'spanish', 'french', 'teaching', 'education', 'leadership', 'management', 'project management', 'agile', 'scrum'];
  for (const skill of skillKeywords) if (cleaned.includes(skill)) tags.add(skill);
  const institution = extractField(cleaned, 'institution');
  if (institution) tags.add(institution.toLowerCase().replace(/\s+/g, '-'));
  const courseName = extractField(cleaned, 'courseName');
  if (courseName) tags.add(courseName.toLowerCase().replace(/\s+/g, '-'));
  const level = extractField(cleaned, 'level');
  if (level) tags.add(`level-${level.toLowerCase()}`);
  return Array.from(tags).slice(0, 10);
}

export function determinePriority(text: string, contentType: string): number {
  const cleaned = cleanPdfText(text).toLowerCase();
  const priority5Keywords = ['stanford', 'harvard', 'mit', 'oxford', 'cambridge', 'google', 'microsoft', 'amazon', 'aws', 'azure', 'master', 'phd', 'doctorate', 'expert', 'advanced', 'professional', 'architect', 'specialist'];
  for (const keyword of priority5Keywords) if (cleaned.includes(keyword)) return 5;
  const priority4Keywords = ['coursera', 'udemy', 'edx', 'pluralsight', 'linkedin learning', 'alison', 'cursa', 'domestika', 'busuu', 'ef set', 'university', 'college', 'institute', 'academy', 'bachelor', 'diploma', 'certification'];
  for (const keyword of priority4Keywords) if (cleaned.includes(keyword)) return 4;
  return 3;
}

function determineLanguage(text: string): 'EN' | 'ES' | 'FR' {
  const cleaned = cleanPdfText(text);
  const enWords = cleaned.match(/\b(the|and|of|to|in|is|it|that|for|you)\b/gi)?.length || 0;
  const esWords = cleaned.match(/\b(la|el|de|y|en|es|los|las|un|una)\b/gi)?.length || 0;
  const frWords = cleaned.match(/\b(le|la|les|de|et|en|à|est|un|une)\b/gi)?.length || 0;
  if (esWords > enWords && esWords > frWords) return 'ES';
  if (frWords > enWords && frWords > esWords) return 'FR';
  return 'EN';
}

export async function parseCertificate(params: ParseCertificateParams): Promise<ParseCertificateResult> {
  const { filePath, text: providedText } = params;
  let text = providedText;
  if (!text) {
    const { readPdfFile } = await import('./read-pdf.js');
    const pdfData = await readPdfFile(filePath);
    text = pdfData.text;
  }
  const cleanedText = cleanPdfText(text);
  const { detectedType, confidenceScores } = detectCertificateType(cleanedText);
  const institution = extractField(cleanedText, 'institution') || 'Unknown';
  const courseName = extractField(cleanedText, 'courseName') || 'Unknown Course';
  const recipient = extractField(cleanedText, 'recipient') || 'Daniel Arturo Peraza';
  const certificateId = extractField(cleanedText, 'certificateId');
  const issueDate = formatDate(extractField(cleanedText, 'issueDate'));
  const instructor = extractField(cleanedText, 'instructor');
  const level = extractField(cleanedText, 'level');
  const credits = extractField(cleanedText, 'credits');
  const grade = extractField(cleanedText, 'grade');
  const fileName = filePath ? path.basename(filePath) : 'unknown.pdf';
  const contentType = detectedType === 'Unknown' ? 'Personal Interest' : detectedType;
  const parsedData: CertificateParsedData = {
    institution, courseName, contentType, issueDate, recipient, certificateId, instructor, level, credits, grade,
    originalFile: fileName, source: 'Local', language: determineLanguage(cleanedText), links: [], confidenceScores,
  };
  if (issueDate) parsedData.completionDate = issueDate;
  parsedData.description = `${courseName} from ${institution}`;
  if (instructor) parsedData.description += ` (Instructor: ${instructor})`;
  if (level) parsedData.description += ` - Level: ${level}`;
  const confidence = Math.max(...Object.values(confidenceScores));
  return { parsedData, confidence, detectedType };
}

export async function handleParseCertificate(params: ParseCertificateParams): Promise<ParseCertificateResult> {
  return parseCertificate(params);
}

export default { parseCertificate, handleParseCertificate, detectCertificateType, extractField, extractTags, determinePriority, determineLanguage };
