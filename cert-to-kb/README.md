# cert-to-kb MCP Server

**Process PDF certificates into Notion Knowledge Base entries automatically**

This MCP (Model Context Protocol) server reads PDF certificates from `C:/Users/peraz/Projects/Misc/interactive-portfolio/docs/certificates`, extracts structured information, and creates corresponding entries in your Notion Knowledge Base database. Designed for use with **Mistral Studio**.

---

## 🚀 Quick Start

### 1. Navigate to project
```bash
cd C:/Users/peraz/Projects/Misc/interactive-portfolio/cert-to-kb
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with:
```env
NOTION_API_KEY=your_notion_integration_token
NOTION_DATABASE_ID=5ddd97f8-4124-4581-9fbe-8eef41d10d71
CERTIFICATES_FOLDER=C:/Users/peraz/Projects/Misc/interactive-portfolio/docs/certificates
```

`NOTION_DATABASE_ID` must be the plain database UUID (find it in the database's Notion URL),
**not** a `collection://` data-source ID — `@notionhq/client` v2.x (used here) predates
Notion's multi-data-source database model and only accepts a `database_id`.

**Get Notion API Key:** https://www.notion.so/my-integrations

**Share database with integration:** Open Knowledge Base in Notion → Share → Invite integration

**Optional — protect the endpoint:** set `MCP_AUTH_TOKEN` in `.env` to a random string. Once
this server is exposed to the internet via zrok, anyone who finds the URL could otherwise
create Notion pages through it. When set, every request must include `Authorization: Bearer
<token>`; configure the same token as the bearer credential when registering the connector in
Mistral Studio.

### 4. Test Locally
```bash
pnpm run dev
```

### 5. Deploy for Mistral Studio

**Option A: ngrok (Quickest)**
```bash
pnpm run dev &
ngrok http 3000
```
Use HTTPS URL from ngrok

**Option B: Fly.io (Production)**
```bash
flyctl launch
flyctl secrets set NOTION_API_KEY=your_key NOTION_DATABASE_ID=collection://... CERTIFICATES_FOLDER=/app/certs
flyctl deploy
```

**Option C: Docker + zrok (Recommended Free Solution)**
```bash
# 1. Build the Docker image
docker build -t cert-to-kb .

# 2. Create certs folder and copy PDFs
mkdir certs
cp C:/Users/peraz/Projects/Misc/interactive-portfolio/docs/certificates/*.pdf certs/

# 3. Run container with environment variables
docker run -d --name cert-to-kb \
  -p 3000:3000 \
  -e NOTION_API_KEY=your_key \
  -e NOTION_DATABASE_ID=5ddd97f8-4124-4581-9fbe-8eef41d10d71 \
  -e CERTIFICATES_FOLDER=/app/certs \
  -e MCP_SERVER_HOST=0.0.0.0 \
  -v %cd%/certs:/app/certs:ro \
  cert-to-kb

# 4. Expose with zrok (install from https://zrok.io)
zrok share http 3000
```
Copy the zrok URL (e.g., `https://abc123.zrok.io`)

**Using docker-compose:**
```bash
# 1. Set environment variables
echo NOTION_API_KEY=your_key > .env
echo NOTION_DATABASE_ID=5ddd97f8-4124-4581-9fbe-8eef41d10d71 >> .env

# 2. Create certs folder and copy PDFs
mkdir certs
cp C:/Users/peraz/Projects/Misc/interactive-portfolio/docs/certificates/*.pdf certs/

# 3. Start with docker-compose
docker-compose up -d

# 4. Expose with zrok
zrok share http 3000
```

### 6. Register in Mistral Studio

1. Go to: https://studio.mistral.ai
2. Navigate to **Connectors**
3. Click **+ Add Connector**
4. Select **Custom MCP Connector**
5. Enter:
   - **Name:** `cert-to-kb`
   - **URL:** Your server URL **with the `/mcp` path**, e.g. `https://abc123.zrok.io/mcp`
   - **Description:** Process PDF certificates into Notion Knowledge Base
   - If you set `MCP_AUTH_TOKEN`, add it as a Bearer token credential
6. Save

### 7. Use It!

Two ways to drive this, in Mistral Studio conversation:

- **LLM-guided (recommended, higher quality):** ask Mistral to `list_certificates`, then for
  each one `read_pdf` and reason over the raw text itself to decide the content type,
  title, tags, and priority, then call `create_notion_entry` with what it extracted. This
  is the point of using an MCP + LLM at all — Mistral's own reading comprehension is far
  better than the regex parser below at pulling a real course name out of a certificate's
  free-form layout.
- **Fast batch (rough, no LLM extraction):** `process_all_certificates` runs entirely
  server-side using the regex-based `parse_certificate` heuristics — no Mistral reasoning
  involved. It's quick but noticeably worse at extracting course names/institutions from
  certificates with unusual formatting (confirmed in testing: it sometimes grabs the wrong
  sentence, or falls back to "Unknown Course"). Always run it with `dryRun: true` first and
  review the output before writing anything to Notion.

---

## 📋 Available Tools

| Tool | Description |
|------|-------------|
| `list_certificates` | List all PDFs in folder |
| `read_pdf` | Extract text from PDF — pair with Mistral's own reasoning for the best results |
| `parse_certificate` | Regex-based heuristic parse (rough; prefer letting the LLM read `read_pdf`'s output instead) |
| `create_notion_entry` | Create Notion entry — the actual write; call this with LLM-extracted fields |
| `process_all_certificates` | Batch process all certificates using the regex parser only (no LLM extraction) — always dry-run first |

---

## 🎯 Main Tool: process_all_certificates

**Parameters:**
- `folderPath` (optional): Custom folder path
- `dryRun` (optional): Test without creating (default: false)
- `overwrite` (optional): Overwrite duplicates (default: false)

**Example:**
```typescript
// Process all certificates
process_all_certificates()

// Dry run first
process_all_certificates({ dryRun: true })
```

---

## 📊 Output Format

**Batch Processing Result:**
```json
{
  "totalCertificates": 35,
  "successful": 30,
  "failed": 5,
  "results": [...],
  "totalTimeMs": 15000,
  "summary": {
    "skillsCreated": 10,
    "academicCreated": 15,
    "personalCreated": 5,
    "duplicatesSkipped": 3
  }
}
```

---

## 🎨 Automatic Classification

| Type | Keywords | Priority |
|------|----------|----------|
| **Academic Experience** | university, college, degree, diploma | High |
| **Skill** | certification, certified, training | High |
| **Personal Interest** | hobby, interest, personal | Medium |
| **Project** | project, completion | Low |

**Priority:**
- **P5**: Stanford, Harvard, MIT, Google, Microsoft
- **P4**: Coursera, Udemy, University, College
- **P3**: Default

---

## 📁 Notion Entry Format

Each certificate creates a Notion page with:

| Field | Value |
|-------|-------|
| **Title** | Course - Institution |
| **Content Type** | Academic/Skill/Personal |
| **Content** | Formatted markdown |
| **Summary** | Short description |
| **Tags** | Auto-generated |
| **Priority** | 1-5 |
| **Status** | Published |
| **Language** | EN/ES/FR |
| **Source** | Local |
| **Metadata** | JSON with all data |

---

## 📚 API Reference

### process_all_certificates

**Process all certificates in a folder and create Notion entries**

**Parameters:**
```typescript
{
  folderPath?: string;      // Path to certificates folder
  dryRun?: boolean;        // Test mode (default: false)
  overwrite?: boolean;      // Overwrite existing (default: false)
}
```

**Returns:** `BatchProcessingResult` (see above)

---

## 🔧 Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTION_API_KEY` | ✅ Yes | - | Notion integration token |
| `NOTION_DATABASE_ID` | ✅ Yes | - | Knowledge Base collection ID |
| `CERTIFICATES_FOLDER` | ✅ Yes | - | Path to PDF certificates |
| `MAX_CONCURRENT_PROCESSING` | ❌ No | 5 | Max simultaneous requests |
| `REQUEST_DELAY_MS` | ❌ No | 1000 | Delay between requests |

---

## 🧪 Testing

### Dry Run Mode
```typescript
process_all_certificates({ dryRun: true })
```

Shows what would be created without making changes.

### Single Certificate Test
```typescript
// Read PDF
const pdf = await read_pdf({ filePath: "C:/.../certificate.pdf" });

// Parse
const parsed = await parse_certificate({ filePath: "C:/.../certificate.pdf" });

// Create entry
const entry = await create_notion_entry({ 
  entryData: { 
    title: parsed.parsedData.courseName,
    contentType: parsed.detectedType,
    content: `Cert from ${parsed.parsedData.institution}`,
    summary: parsed.parsedData.description || "",
    tags: ["test"],
    priority: 3,
    status: "Published",
    language: "EN",
    source: "Local",
    metadata: {}
  }
});
```

---

## 🐛 Troubleshooting

**"PDF file not found"**
- Check `CERTIFICATES_FOLDER` uses `C:/` format
- Verify folder contains PDF files

**"Notion API error"**
- Verify `NOTION_API_KEY` is correct
- Ensure integration has database access
- Check database ID format: `collection://...`

**"Low confidence parsing"**
- Certificate format doesn't match patterns
- Add custom patterns to `parse-certificate.ts`

---

## 📄 License

MIT License

---

**Built for Mistral AI Studio**
