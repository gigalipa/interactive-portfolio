/**
 * cert-to-kb Configuration Management
 * Centralized configuration for the MCP server
 */

import dotenv from 'dotenv';
import { z } from 'zod';
import { ServerConfig } from './types.js';

dotenv.config();

const ServerConfigSchema = z.object({
  notionApiKey: z.string().min(1, 'NOTION_API_KEY is required'),
  notionDatabaseId: z.string().min(1, 'NOTION_DATABASE_ID is required'),
  certificatesFolder: z.string().min(1, 'CERTIFICATES_FOLDER is required'),
  maxConcurrentProcessing: z.coerce.number().default(5),
  requestDelayMs: z.coerce.number().default(1000),
  templates: z.object({
    skill: z.string().optional(),
    academic: z.string().optional(),
    professional: z.string().optional(),
    project: z.string().optional(),
    personal: z.string().optional(),
  }).optional(),
});

function validateConfig(config: Partial<ServerConfig>): ServerConfig {
  const parsed = ServerConfigSchema.safeParse(config);
  if (!parsed.success) {
    const errors = parsed.error.format();
    const errorMessages = Object.entries(errors)
      .map(([field, details]) => {
        if (details && '_errors' in details) {
          return `${field}: ${details._errors.join(', ')}`;
        }
        return `${field}: invalid`;
      })
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errorMessages}\n\n` +
      `Please check your .env file and ensure all required variables are set.\n` +
      `Required: NOTION_API_KEY, NOTION_DATABASE_ID, CERTIFICATES_FOLDER`);
  }
  return parsed.data;
}

const defaultConfig: Partial<ServerConfig> = {
  maxConcurrentProcessing: 5,
  requestDelayMs: 1000,
};

export function loadConfig(): ServerConfig {
  const envConfig: Partial<ServerConfig> = {
    notionApiKey: process.env.NOTION_API_KEY,
    notionDatabaseId: process.env.NOTION_DATABASE_ID,
    certificatesFolder: process.env.CERTIFICATES_FOLDER,
    maxConcurrentProcessing: process.env.MAX_CONCURRENT_PROCESSING 
      ? Number(process.env.MAX_CONCURRENT_PROCESSING) 
      : defaultConfig.maxConcurrentProcessing,
    requestDelayMs: process.env.REQUEST_DELAY_MS 
      ? Number(process.env.REQUEST_DELAY_MS) 
      : defaultConfig.requestDelayMs,
    templates: {
      skill: process.env.TEMPLATE_SKILL,
      academic: process.env.TEMPLATE_ACADEMIC,
      professional: process.env.TEMPLATE_PROFESSIONAL,
      project: process.env.TEMPLATE_PROJECT,
      personal: process.env.TEMPLATE_PERSONAL,
    },
  };
  return validateConfig({ ...defaultConfig, ...envConfig });
}

let cachedConfig: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

export function printConfig(): void {
  const config = getConfig();
  console.log('cert-to-kb Configuration:');
  console.log('  Notion Database ID:', config.notionDatabaseId);
  console.log('  Certificates Folder:', config.certificatesFolder);
  console.log('  Max Concurrent:', config.maxConcurrentProcessing);
  console.log('  Request Delay (ms):', config.requestDelayMs);
  console.log('  Notion API Key:', config.notionApiKey ? '***' + config.notionApiKey.slice(-4) : 'NOT SET');
}
