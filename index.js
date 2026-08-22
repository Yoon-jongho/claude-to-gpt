#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI, { toFile } from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname 설정 (ES 모듈용)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenAI API 초기화
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// ─────────────────────────────────────────────
// 모델 매핑 (2026.08 기준 GPT-5.6 계열)
// ─────────────────────────────────────────────
const MODEL_MAP = {
  sol: "gpt-5.6-sol", // 플래그십: 복잡한 추론/코딩  ($5 / $30 per MTok)
  terra: "gpt-5.6-terra", // 균형: 지능 대비 비용     ($2 / $12 per MTok)
  luna: "gpt-5.6-luna", // 경제형: 대량/단순 작업   ($0.20 / $1.20 per MTok)
};

const IMAGE_MODEL = "gpt-image-2";

function resolveModel(alias = "terra") {
  return MODEL_MAP[alias] || MODEL_MAP.terra;
}

// ─────────────────────────────────────────────
// 공용 헬퍼
// ─────────────────────────────────────────────

/**
 * Responses API 호출 래퍼.
 * status가 incomplete면 원인을 명확히 알려준다 (reasoning 토큰이 예산을 다 먹는 케이스가 잦음).
 */
async function callGPT({
  model = "terra",
  instructions,
  input,
  effort = "medium",
  tools,
  textFormat,
  maxOutputTokens = 16000,
}) {
  const params = {
    model: resolveModel(model),
    input,
    reasoning: { effort },
    max_output_tokens: maxOutputTokens,
  };

  if (instructions) params.instructions = instructions;
  if (tools) params.tools = tools;
  if (textFormat) params.text = { format: textFormat };

  const response = await openai.responses.create(params);

  const text = response.output_text || "";

  if (response.status === "incomplete" && !text) {
    const reason = response.incomplete_details?.reason || "unknown";
    throw new Error(
      `Response incomplete (reason: ${reason}). ` +
        `max_output_tokens(${maxOutputTokens})를 늘리거나 reasoning_effort를 낮춰보세요.`
    );
  }

  return { text, response };
}

/** web_search 결과의 출처 URL을 뽑아낸다. */
function extractCitations(response) {
  const seen = new Map();

  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const block of item.content || []) {
      for (const ann of block.annotations || []) {
        if (ann.type === "url_citation" && ann.url && !seen.has(ann.url)) {
          seen.set(ann.url, ann.title || ann.url);
        }
      }
    }
  }

  return [...seen.entries()].map(([url, title]) => `- ${title}\n  ${url}`);
}

/** 사용량을 사람이 읽을 수 있는 한 줄로. */
function formatUsage(response) {
  const u = response.usage;
  if (!u) return "";
  const reasoning = u.output_tokens_details?.reasoning_tokens;
  const parts = [`in ${u.input_tokens}`, `out ${u.output_tokens}`];
  if (reasoning) parts.push(`reasoning ${reasoning}`);
  return ` | tokens: ${parts.join(" / ")}`;
}

/** base64 이미지를 generated_images/ 에 저장. */
function saveBase64Image(b64, filename) {
  const outputDir = path.join(__dirname, "generated_images");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
  return filePath;
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function loadImageFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Image file not found: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_BY_EXT[ext];
  if (!type) {
    throw new Error(
      `Unsupported image format: ${ext} (png, jpg, jpeg, webp만 지원)`
    );
  }
  return toFile(fs.createReadStream(filePath), path.basename(filePath), {
    type,
  });
}

/**
 * strict json_schema는 모든 object에 additionalProperties:false와
 * 전체 required가 있어야 통과한다. 손으로 쓰기 번거로우니 자동 보정.
 */
function normalizeSchemaForStrict(node) {
  if (Array.isArray(node)) return node.map(normalizeSchemaForStrict);
  if (!node || typeof node !== "object") return node;

  const out = { ...node };

  if (out.properties && typeof out.properties === "object") {
    const properties = {};
    for (const [key, value] of Object.entries(out.properties)) {
      properties[key] = normalizeSchemaForStrict(value);
    }
    out.properties = properties;
    out.additionalProperties = false;
    out.required = Object.keys(properties);
    if (!out.type) out.type = "object";
  }

  if (out.items) out.items = normalizeSchemaForStrict(out.items);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(out[key])) out[key] = out[key].map(normalizeSchemaForStrict);
  }
  if (out.$defs && typeof out.$defs === "object") {
    const defs = {};
    for (const [key, value] of Object.entries(out.$defs)) {
      defs[key] = normalizeSchemaForStrict(value);
    }
    out.$defs = defs;
  }

  return out;
}

// ─────────────────────────────────────────────
// MCP 서버 생성
// ─────────────────────────────────────────────
const server = new Server(
  {
    name: "gpt-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const MODEL_PARAM = {
  type: "string",
  description:
    "Model tier: 'luna' (cheapest, bulk work), 'terra' (default, balanced), 'sol' (flagship, hardest reasoning)",
  enum: ["luna", "terra", "sol"],
  default: "terra",
};

const EFFORT_PARAM = {
  type: "string",
  description:
    "Reasoning depth. Higher = slower and more expensive. 'xhigh'/'max' can take several minutes and may exceed the MCP client timeout.",
  enum: ["none", "low", "medium", "high", "xhigh", "max"],
  default: "medium",
};

// ─────────────────────────────────────────────
// 도구 목록
// ─────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_gpt",
        description:
          "Ask GPT-5.6 a general question with explicit control over reasoning depth. Best for hard algorithmic problems, math-heavy logic, and tasks where you want a deliberate, slow answer rather than a fast one. Context window is ~1M tokens.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The question or task for GPT",
            },
            context: {
              type: "string",
              description:
                "Optional: code, documents, or other context to reason over",
            },
            model: MODEL_PARAM,
            reasoning_effort: EFFORT_PARAM,
          },
          required: ["prompt"],
        },
      },
      {
        name: "gpt_second_opinion",
        description:
          "Get an INDEPENDENT critique from GPT-5.6 of a conclusion Claude already reached — a design decision, a diagnosis, a piece of code, or a plan. Because GPT is a different model family, it catches blind spots that self-review misses. Use this before shipping anything risky, irreversible, or expensive to undo.",
        inputSchema: {
          type: "object",
          properties: {
            subject: {
              type: "string",
              description:
                "The artifact under review: code, architecture plan, bug diagnosis, or migration strategy",
            },
            claude_conclusion: {
              type: "string",
              description:
                "What Claude concluded or produced, and why. GPT will attack this specifically.",
            },
            mode: {
              type: "string",
              description:
                "'critique' finds flaws, 'verify' checks correctness step by step, 'alternatives' proposes different approaches",
              enum: ["critique", "verify", "alternatives"],
              default: "critique",
            },
            model: MODEL_PARAM,
            reasoning_effort: { ...EFFORT_PARAM, default: "high" },
          },
          required: ["subject", "claude_conclusion"],
        },
      },
      {
        name: "gpt_structured_extract",
        description:
          "Turn unstructured text, logs, or code into strict JSON matching a schema you define. Uses OpenAI structured outputs, so the shape is guaranteed — no parsing failures, no markdown fences. Use this for pipeline steps where the next stage needs reliable JSON.",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The raw text, logs, or code to extract from",
            },
            instruction: {
              type: "string",
              description: "What to extract and any rules for doing so",
            },
            json_schema: {
              type: "object",
              description:
                "JSON Schema for the output object. additionalProperties and required are auto-filled for strict mode, so you can write it loosely.",
            },
            schema_name: {
              type: "string",
              description: "Short name for the schema (a-z, 0-9, underscores)",
              default: "extraction",
            },
            model: { ...MODEL_PARAM, default: "luna" },
            reasoning_effort: { ...EFFORT_PARAM, default: "low" },
          },
          required: ["content", "instruction", "json_schema"],
        },
      },
      {
        name: "gpt_web_research",
        description:
          "Research a topic using GPT-5.6 with the built-in web_search tool, returning a synthesized answer plus source URLs. Best for questions where the answer needs current documentation, changelogs, or library versions — things that go stale.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to research",
            },
            context: {
              type: "string",
              description:
                "Optional: background such as the stack in use or constraints that shape a useful answer",
            },
            model: MODEL_PARAM,
            reasoning_effort: EFFORT_PARAM,
          },
          required: ["query"],
        },
      },
      {
        name: "generate_image",
        description:
          "Generate an image with gpt-image-2. Notably strong at rendering legible text inside the image, so it suits UI mockups, dashboards, diagrams with labels, and posters. Saves the result to generated_images/ and returns the file path. Note: gpt-image-2 does NOT support transparent backgrounds.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Detailed description of the image (English works best)",
            },
            size: {
              type: "string",
              description: "Output dimensions",
              enum: [
                "auto",
                "1024x1024",
                "1536x1024",
                "1024x1536",
                "2048x2048",
                "2048x1152",
                "3840x2160",
                "2160x3840",
              ],
              default: "1024x1024",
            },
            quality: {
              type: "string",
              description:
                "'low' for fast drafts, 'high' for final assets. Complex prompts at high quality can take up to 2 minutes.",
              enum: ["auto", "low", "medium", "high"],
              default: "medium",
            },
            format: {
              type: "string",
              description: "File format. jpeg is faster than png.",
              enum: ["png", "jpeg", "webp"],
              default: "png",
            },
            n: {
              type: "number",
              description: "Number of images to generate (1-4)",
              minimum: 1,
              maximum: 4,
              default: 1,
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "edit_image",
        description:
          "Edit existing images with gpt-image-2, or compose a new image from up to 4 reference images. Supply an optional mask (PNG with an alpha channel, same size as the first image) to restrict edits to a region. Saves results to generated_images/.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Description of the desired edit or composition",
            },
            image_paths: {
              type: "array",
              description:
                "Local file paths of 1-4 source images (png, jpg, jpeg, webp)",
              items: { type: "string" },
              minItems: 1,
              maxItems: 4,
            },
            mask_path: {
              type: "string",
              description:
                "Optional: local path to a mask PNG with an alpha channel. Applies to the first image.",
            },
            size: {
              type: "string",
              description: "Output dimensions",
              enum: [
                "auto",
                "1024x1024",
                "1536x1024",
                "1024x1536",
                "2048x2048",
              ],
              default: "auto",
            },
            quality: {
              type: "string",
              description: "Rendering quality",
              enum: ["auto", "low", "medium", "high"],
              default: "medium",
            },
          },
          required: ["prompt", "image_paths"],
        },
      },
    ],
  };
});

// ─────────────────────────────────────────────
// 도구 실행 핸들러
// ─────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── ask_gpt ──────────────────────────────
    if (name === "ask_gpt") {
      const { prompt, context, model = "terra", reasoning_effort = "medium" } = args;

      const input = context
        ? `Context:\n\`\`\`\n${context}\n\`\`\`\n\nTask: ${prompt}`
        : prompt;

      const { text, response } = await callGPT({
        model,
        input,
        effort: reasoning_effort,
        instructions:
          "You are a senior engineer. Be concrete and specific. State assumptions explicitly. If the question is underspecified, say what is missing instead of guessing.",
      });

      return {
        content: [
          {
            type: "text",
            text: `[GPT-5.6 ${model} | effort: ${reasoning_effort}${formatUsage(
              response
            )}]\n\n${text}`,
          },
        ],
      };
    }

    // ── gpt_second_opinion ───────────────────
    if (name === "gpt_second_opinion") {
      const {
        subject,
        claude_conclusion,
        mode = "critique",
        model = "terra",
        reasoning_effort = "high",
      } = args;

      const modeInstructions = {
        critique:
          "Find what is wrong, fragile, or missing. Prioritise correctness bugs and design flaws over style. If you find nothing substantive, say so plainly rather than inventing objections.",
        verify:
          "Verify the reasoning step by step. For each step, state whether it holds and why. Identify the first step that breaks, if any.",
        alternatives:
          "Propose genuinely different approaches, not variations of the same one. For each, give the trade-off that would make someone pick it over the original.",
      };

      const instructions = `You are reviewing work produced by another AI model (Claude). Your value comes from being an independent second pair of eyes — do not defer to the existing conclusion, and do not rubber-stamp it.

${modeInstructions[mode]}

Structure your response as:
1. Verdict (one line: sound / sound with caveats / flawed)
2. Findings, each tagged [Critical] / [Major] / [Minor]
3. What you would do differently, concretely
4. What you could not evaluate given the information provided`;

      const input = `## Subject under review\n${subject}\n\n## Claude's conclusion\n${claude_conclusion}`;

      const { text, response } = await callGPT({
        model,
        input,
        instructions,
        effort: reasoning_effort,
      });

      return {
        content: [
          {
            type: "text",
            text: `[GPT-5.6 Second Opinion - ${mode} | effort: ${reasoning_effort}${formatUsage(
              response
            )}]\n\n${text}`,
          },
        ],
      };
    }

    // ── gpt_structured_extract ───────────────
    if (name === "gpt_structured_extract") {
      const {
        content,
        instruction,
        json_schema,
        schema_name = "extraction",
        model = "luna",
        reasoning_effort = "low",
      } = args;

      const safeName = String(schema_name)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .slice(0, 60);

      const { text, response } = await callGPT({
        model,
        effort: reasoning_effort,
        instructions:
          "Extract exactly what the schema asks for. Do not invent values. If a field genuinely cannot be determined from the content, use an empty string, empty array, or null as the schema allows.",
        input: `${instruction}\n\n## Content\n\`\`\`\n${content}\n\`\`\``,
        textFormat: {
          type: "json_schema",
          name: safeName,
          schema: normalizeSchemaForStrict(json_schema),
          strict: true,
        },
      });

      // 유효한 JSON인지 확인해서 호출한 쪽이 믿고 파싱할 수 있게 한다
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // strict 모드에선 사실상 발생하지 않지만, 발생하면 원문 그대로 넘긴다
      }

      return {
        content: [
          {
            type: "text",
            text: `[GPT-5.6 Structured Extract - ${safeName}${formatUsage(
              response
            )}]\n\n${pretty}`,
          },
        ],
      };
    }

    // ── gpt_web_research ─────────────────────
    if (name === "gpt_web_research") {
      const { query, context, model = "terra", reasoning_effort = "medium" } = args;

      const input = context
        ? `${query}\n\n## Background\n${context}`
        : query;

      const { text, response } = await callGPT({
        model,
        input,
        effort: reasoning_effort,
        tools: [{ type: "web_search" }],
        instructions:
          "Research the question using web search. Prefer official documentation, changelogs, and primary sources over blog aggregators. State clearly when sources disagree or when information appears outdated.",
      });

      const citations = extractCitations(response);
      const sources = citations.length
        ? `\n\n## Sources\n${citations.join("\n")}`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `[GPT-5.6 Web Research${formatUsage(
              response
            )}]\n\n${text}${sources}`,
          },
        ],
      };
    }

    // ── generate_image ───────────────────────
    if (name === "generate_image") {
      const {
        prompt,
        size = "1024x1024",
        quality = "medium",
        format = "png",
        n = 1,
      } = args;

      const params = {
        model: IMAGE_MODEL,
        prompt,
        n,
        output_format: format,
      };
      if (size !== "auto") params.size = size;
      if (quality !== "auto") params.quality = quality;

      const result = await openai.images.generate(params);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const lines = [];

      result.data.forEach((image, index) => {
        const filename = `gpt_${timestamp}_${index + 1}.${format}`;
        const filePath = saveBase64Image(image.b64_json, filename);
        lines.push(`${index + 1}. ${filePath}`);
      });

      return {
        content: [
          {
            type: "text",
            text: `[GPT Image 2]\n\nPrompt: ${prompt}\nSize: ${size} | Quality: ${quality} | Format: ${format}\n\nSaved:\n${lines.join(
              "\n"
            )}`,
          },
        ],
      };
    }

    // ── edit_image ───────────────────────────
    if (name === "edit_image") {
      const {
        prompt,
        image_paths,
        mask_path,
        size = "auto",
        quality = "medium",
      } = args;

      const images = await Promise.all(image_paths.map(loadImageFile));

      const params = {
        model: IMAGE_MODEL,
        image: images,
        prompt,
      };
      if (mask_path) params.mask = await loadImageFile(mask_path);
      if (size !== "auto") params.size = size;
      if (quality !== "auto") params.quality = quality;

      const result = await openai.images.edit(params);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const lines = [];

      result.data.forEach((image, index) => {
        const filename = `gpt_edit_${timestamp}_${index + 1}.png`;
        const filePath = saveBase64Image(image.b64_json, filename);
        lines.push(`${index + 1}. ${filePath}`);
      });

      return {
        content: [
          {
            type: "text",
            text: `[GPT Image 2 - Edit]\n\nPrompt: ${prompt}\nSources: ${image_paths.length} image(s)${
              mask_path ? " + mask" : ""
            }\n\nSaved:\n${lines.join("\n")}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    // OpenAI SDK 에러는 status/code가 붙어 있어서 원인 파악에 도움이 된다
    const detail = [error.status && `HTTP ${error.status}`, error.code]
      .filter(Boolean)
      .join(" ");

    return {
      content: [
        {
          type: "text",
          text: `Error calling GPT${detail ? ` (${detail})` : ""}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─────────────────────────────────────────────
// 서버 시작
// ─────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GPT MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
