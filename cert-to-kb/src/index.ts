/**
 * cert-to-kb MCP Server
 * Main entry point for the certificate to Knowledge Base MCP server
 */

import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { getConfig, printConfig } from './config.js';
import { handleListCertificates } from './tools/list-certificates.js';
import { handleReadPdf } from './tools/read-pdf.js';
import { handleParseCertificate } from './tools/parse-certificate.js';
import { handleCreateNotionEntry } from './tools/create-notion-entry.js';
import { handleProcessAllCertificates } from './tools/process-all.js';
import { ListCertificatesParams, ReadPdfParams, ParseCertificateParams, CreateNotionEntryParams, ProcessAllCertificatesParams } from './types.js';

const TOOLS = [
  {
    name: 'list_certificates',
    description: 'List all PDF certificates in a folder',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Path to folder containing certificates' },
        extensions: { type: 'array', items: { type: 'string' }, description: 'File extensions to include', default: ['.pdf'] },
        recursive: { type: 'boolean', description: 'Search subdirectories recursively', default: true },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        certificates: { type: 'array', items: { type: 'object', properties: { fileName: { type: 'string' }, filePath: { type: 'string' }, fileSize: { type: 'number' }, lastModified: { type: 'string' } } } },
        total: { type: 'number' },
      },
    },
  },
  {
    name: 'read_pdf',
    description: 'Extract text from a PDF file',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: 'Path to the PDF file' } },
      required: ['filePath'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        fileName: { type: 'string' },
        filePath: { type: 'string' },
        text: { type: 'string' },
        numPages: { type: 'number' },
        metadata: { type: 'object', properties: { author: { type: 'string' }, title: { type: 'string' }, creationDate: { type: 'string' }, modificationDate: { type: 'string' } } },
      },
    },
  },
  {
    name: 'parse_certificate',
    description: 'Parse certificate text and extract structured data',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the PDF file' },
        text: { type: 'string', description: 'Pre-extracted text (optional)' },
      },
      required: ['filePath'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        parsedData: { type: 'object', properties: { institution: { type: 'string' }, courseName: { type: 'string' }, contentType: { type: 'string' }, issueDate: { type: 'string' }, recipient: { type: 'string' }, certificateId: { type: 'string' }, description: { type: 'string' }, originalFile: { type: 'string' }, source: { type: 'string' }, language: { type: 'string' } } },
        confidence: { type: 'number' },
        detectedType: { type: 'string' },
      },
    },
  },
  {
    name: 'create_notion_entry',
    description: 'Create a Notion entry in the Knowledge Base',
    inputSchema: {
      type: 'object',
      properties: {
        entryData: {
          type: 'object',
          description: 'Entry data to create',
          properties: {
            title: { type: 'string' },
            contentType: { type: 'string' },
            content: { type: 'string' },
            summary: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            priority: { type: 'number' },
            status: { type: 'string' },
            language: { type: 'string' },
            source: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['title', 'contentType', 'content', 'summary'],
        },
        useTemplate: { type: 'boolean', description: 'Use Notion template', default: false },
      },
      required: ['entryData'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        pageUrl: { type: 'string' },
        title: { type: 'string' },
        contentType: { type: 'string' },
      },
    },
  },
  {
    name: 'process_all_certificates',
    description: 'Batch process all PDF certificates and create Notion entries',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Path to folder containing certificates' },
        dryRun: { type: 'boolean', description: 'Test without creating entries', default: false },
        overwrite: { type: 'boolean', description: 'Overwrite existing entries', default: false },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        totalCertificates: { type: 'number' },
        successful: { type: 'number' },
        failed: { type: 'number' },
        results: { type: 'array', items: { type: 'object', properties: { success: { type: 'boolean' }, certificate: { type: 'string' }, errors: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { type: 'string' } } } } },
        totalTimeMs: { type: 'number' },
        summary: { type: 'object', properties: { skillsCreated: { type: 'number' }, academicCreated: { type: 'number' }, personalCreated: { type: 'number' }, duplicatesSkipped: { type: 'number' } } },
      },
    },
  },
];

/**
 * A single Server/transport pair only handles one session at a time, so a fresh
 * Server instance is created per MCP session (see the streamable-HTTP session
 * routing below) rather than sharing one Server across concurrent sessions.
 */
function createServer(): Server {
  const server = new Server({ name: 'cert-to-kb', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result: unknown;
      switch (name) {
        case 'list_certificates': result = await handleListCertificates(args as unknown as ListCertificatesParams); break;
        case 'read_pdf': result = await handleReadPdf(args as unknown as ReadPdfParams); break;
        case 'parse_certificate': result = await handleParseCertificate(args as unknown as ParseCertificateParams); break;
        case 'create_notion_entry': result = await handleCreateNotionEntry(args as unknown as CreateNotionEntryParams); break;
        case 'process_all_certificates': result = await handleProcessAllCertificates(args as unknown as ProcessAllCertificatesParams); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error in tool ${name}:`, error);
      return {
        content: [{ type: 'text' as const, text: `Tool ${name} failed: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  return server;
}

/** Optional shared-secret check — set MCP_AUTH_TOKEN so a guessed zrok URL can't write to Notion unattended. */
function checkAuth(req: Request, res: Response): boolean {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return true;
  const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided === expected) return true;
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
  return false;
}

async function main() {
  try {
    const config = getConfig();
    if (process.env.NODE_ENV === 'development') printConfig();
    console.log('cert-to-kb MCP Server starting...');
    console.log(`Connected to Notion database: ${config.notionDatabaseId}`);
    console.log(`Certificates folder: ${config.certificatesFolder}`);

    const host = process.env.MCP_SERVER_HOST === 'localhost' ? '0.0.0.0' : (process.env.MCP_SERVER_HOST || '0.0.0.0');
    const port = Number(process.env.MCP_SERVER_PORT) || 3000;

    const app = createMcpExpressApp({ host });

    // Sessions are stateful: the transport created on 'initialize' is reused for
    // every subsequent request carrying the same Mcp-Session-Id header.
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    app.post('/mcp', async (req: Request, res: Response) => {
      if (!checkAuth(req, res)) return;
      const sessionId = req.header('mcp-session-id');
      try {
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
              console.log(`Session initialized: ${sid}`);
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              delete transports[sid];
              console.log(`Session closed: ${sid}`);
            }
          };
          const server = createServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null });
          return;
        }
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
      }
    });

    const sessionStreamHandler = async (req: Request, res: Response) => {
      if (!checkAuth(req, res)) return;
      const sessionId = req.header('mcp-session-id');
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      await transports[sessionId].handleRequest(req, res);
    };
    app.get('/mcp', sessionStreamHandler);
    app.delete('/mcp', sessionStreamHandler);

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', tools: TOOLS.map((t) => t.name) });
    });

    app.listen(port, host, () => {
      console.log(`cert-to-kb MCP Server is running on http://${host}:${port}/mcp`);
      console.log(`Available tools: ${TOOLS.map((t) => t.name).join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start cert-to-kb MCP Server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nShutting down cert-to-kb MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTerminating cert-to-kb MCP Server...');
  process.exit(0);
});

main();

export { createServer, TOOLS };
