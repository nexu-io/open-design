// Parses <tool_call> XML blocks from DeepSeek-format streaming text.
// DeepSeek emits tool calls inline as:
//   <tool_call name="Read">
//   {"file_path": "path/to/file"}
//   </tool_call>
//
// We extract these before the text hits the chat renderer so the agent loop
// can execute them and feed results back.

export interface ParsedToolCall {
  name: string;
  parameters: Record<string, unknown>;
  rawXml: string;
}

const SELF_CLOSING = /<tool_call\b[^>]*\/>/gi;
const OPENING = /<tool_call\b[^>]*>/gi;

export function parseToolCalls(text: string): {
  toolCalls: ParsedToolCall[];
  cleanText: string;
} {
  const toolCalls: ParsedToolCall[] = [];

  // Strip self-closing tags first
  let clean = text.replace(SELF_CLOSING, '');

  // Extract well-formed <tool_call>...</tool_call> pairs
  const blocks = extractToolCallBlocks(clean);
  for (const block of blocks) {
    clean = clean.replace(block.rawXml, '');
    const parsed = parseToolCallBlock(block);
    if (parsed) toolCalls.push(parsed);
  }

  return { toolCalls, cleanText: clean.trim() };
}

interface RawBlock {
  rawXml: string;
  innerXml: string;
}

function extractToolCallBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const re = /<tool_call\b([^>]*)>([\s\S]*?)<\/tool_call>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({
      rawXml: m[0],
      innerXml: `<tool_call${m[1]}>${m[2]}</tool_call>`,
    });
  }
  return blocks;
}

function parseToolCallBlock(block: RawBlock): ParsedToolCall | null {
  const nameMatch = block.innerXml.match(/<tool_call\b[^>]*\bname\s*=\s*"([^"]*)"/i);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  // Extract JSON body between the opening and closing tags
  const bodyMatch = block.innerXml.match(/<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/i);
  if (!bodyMatch) return null;

  let parameters: Record<string, unknown> = {};
  try {
    parameters = JSON.parse(bodyMatch[1].trim());
  } catch {
    // Non-JSON body — treat as a single string param
    const trimmed = bodyMatch[1].trim();
    if (trimmed) parameters = { _raw: trimmed };
  }

  return { name, parameters, rawXml: block.rawXml };
}

// Returns true when the text ends inside an unclosed <tool_call> block.
// The caller should buffer and wait for more text before parsing.
export function isInsideToolCall(text: string): boolean {
  const openCount = (text.match(/<tool_call\b[^/][^>]*>/gi) || []).length;
  const closeCount = (text.match(/<\/tool_call>/gi) || []).length;
  const selfClosing = (text.match(SELF_CLOSING) || []).length;
  return openCount > closeCount + selfClosing;
}

// Accumulates text, calling onToolCalls when complete tool_call blocks are found.
// Remaining partial text is returned for the next accumulation.
export function createToolCallAccumulator(
  onToolCalls: (calls: ParsedToolCall[]) => void,
): (chunk: string) => void {
  let buf = '';

  return (chunk: string) => {
    buf += chunk;
    // Only parse when we might have complete blocks
    if (!buf.includes('</tool_call>')) return;

    const { toolCalls, cleanText } = parseToolCalls(buf);
    if (toolCalls.length > 0) {
      onToolCalls(toolCalls);
      // Keep the remaining (potentially partial) text in buffer
      buf = cleanText;
    }
  };
}
