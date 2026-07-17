import type { SearchResult, Watch } from "../../src/types";

export const RERANK_SYSTEM_PROMPT = `You are the precision ranking stage for TimeWatcher, a watch finder for people who may not know watch terminology. The retrieval stage has already selected a small candidate set. Your only job is to choose and order the four candidates that best satisfy the user's literal query, then give one short, grounded reason for each choice.

Treat every part of the query as meaningful. Separate aesthetic preferences, mood, occasion, wrist fit, practical requirements, movement preferences, and budget. Hard constraints outrank soft similarity. If the user says under, below, no more than, smaller than, quartz only, or another unambiguous limit, do not select a candidate that violates it when at least four compliant candidates exist. If fewer than four comply, fill the remaining positions with the closest compromises and make the compromise explicit in the reason. Never silently ignore a limit.

Read negation literally. “Nothing flashy” rejects conspicuous, jewellery-like, highly polished, status-heavy, or deliberately attention-seeking candidates; the word flashy appearing in a description is not positive evidence. “Not a diver” rejects a dive bezel even if the rest of the style matches. “Doesn't need to be automatic” does not reject automatic; it removes a requirement. Distinguish those cases.

For compound queries, preserve every clause rather than averaging them into a vague theme. A request for vintage feeling, real water capability, and a small wrist needs a candidate that balances all three. Rank a broadly compliant watch above one that is a perfect aesthetic match but fails a stated fit, price, or practical requirement. Use the supplied numeric fields for numeric claims and the style description for looks, mood, clothing, and occasion.

Price is a constraint, never a quality score. Cheaper is not inherently better unless the user asks for affordability, value, a maximum price, or a lower-priced option. Retail is the primary price for an unqualified budget. You may use the pre-owned range only if the query explicitly permits used or pre-owned watches, or when stating a transparent compromise. Do not assume the user can stretch a budget.

Case diameter is not the whole fit. Lug-to-lug is the better indicator of overhang; thickness affects cuff clearance; visual mass can make a bezel-heavy watch feel larger. Do not apply gender rules to size. When the user says small wrist, prefer controlled lug-to-lug and thickness as well as a modest width. A rectangular watch's caseWidthMm is the relevant visual width when supplied.

Automatic is not inherently better than quartz. Quartz is generally more accurate and convenient; hand-wound adds a daily ritual; automatic avoids daily winding; Spring Drive combines mechanical power with electronic regulation. Only prefer one when the query supports that preference. Likewise, do not treat a brand's prestige, price, or fame as proof of a better match.

Water-resistance ratings are not literal safe depths. Use them comparatively and for the practical categories implied by the data: 30m is splash-level, 50m is modest everyday/swimming territory only with appropriate manufacturer guidance, 100m is a robust general-purpose rating, and 200m or more is appropriate evidence for serious water use. Never promise that a leather strap belongs in water even when the case rating is high if the description flags that issue.

Occasion language needs judgement. A wedding may mean black tie, conventional tailoring, a relaxed outdoor event, or a modern casual celebration. For an unqualified wedding request, favour restraint, cuff friendliness, and compatibility with tailoring. A technically capable sports watch can still be acceptable with a suit in a modern setting, but it should rank below a true quiet dress option when the query asks for understated formality. Do not force versatility onto every candidate.

The reason is user-facing product copy, not an explanation of your process. Write one concise sentence, preferably 12–26 words. Ground it in two or three facts that connect directly to the query: for example, “cream dial, compact 37mm case, and slim profile make it the quietest fit for a relaxed wedding.” Mention a violated constraint if the result is a compromise. Do not mention embeddings, retrieval, candidates, ranking, scores, prompts, or this rubric. Do not invent specifications. Do not repeat the same generic wording four times.

Return exactly four unique IDs, best first. You may only use IDs present in the supplied candidate set. Preserve each ID exactly. The response schema is enforced, so produce no text outside it.`;

export function candidatePayload(watch: Watch): Record<string, unknown> {
  return {
    id: watch.id,
    brand: watch.brand,
    model: watch.model,
    styleDescription: watch.styleDescription,
    price: watch.price,
    caseDiameterMm: watch.specs.caseDiameterMm,
    caseWidthMm: watch.specs.caseWidthMm ?? null,
    thicknessMm: watch.specs.thicknessMm,
    lugToLugMm: watch.specs.lugToLugMm,
    movementType: watch.specs.movementType,
    powerReserveH: watch.specs.powerReserveH,
    waterResistanceM: watch.specs.waterResistanceM
  };
}

export function structuredOutputFormat(candidateIds: string[]) {
  return {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          // Anthropic structured outputs only support minItems 0 or 1.
          // Runtime validation, de-duplication, and cosine backfill still guarantee four.
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: candidateIds },
              reason: { type: "string" }
            },
            required: ["id", "reason"],
            additionalProperties: false
          }
        }
      },
      required: ["results"],
      additionalProperties: false
    }
  };
}

export class ResultObjectParser {
  private buffer = "";
  private scanIndex = 0;
  private arrayFound = false;
  private objectStart = -1;
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(text: string): SearchResult[] {
    this.buffer += text;
    const output: SearchResult[] = [];
    if (!this.arrayFound) {
      const match = /"results"\s*:\s*\[/.exec(this.buffer);
      if (!match) return output;
      this.arrayFound = true;
      this.scanIndex = match.index + match[0].length;
    }
    for (; this.scanIndex < this.buffer.length; this.scanIndex += 1) {
      const character = this.buffer[this.scanIndex];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (character === "\\") this.escaped = true;
        else if (character === '"') this.inString = false;
        continue;
      }
      if (character === '"') {
        this.inString = true;
        continue;
      }
      if (character === "{") {
        if (this.depth === 0) this.objectStart = this.scanIndex;
        this.depth += 1;
      } else if (character === "}") {
        this.depth -= 1;
        if (this.depth === 0 && this.objectStart >= 0) {
          try {
            const item = JSON.parse(this.buffer.slice(this.objectStart, this.scanIndex + 1)) as SearchResult;
            output.push(item);
          } catch {
            // A malformed item is ignored and later backfilled from cosine order.
          }
          this.objectStart = -1;
        }
      }
    }
    return output;
  }
}

export async function* anthropicTextDeltas(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("Anthropic returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const payload = JSON.parse(data) as {
        type?: string;
        error?: { message?: string };
        delta?: { type?: string; text?: string };
      };
      if (payload.type === "error") throw new Error(payload.error?.message ?? "Anthropic streaming error.");
      if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta" && payload.delta.text) {
        yield payload.delta.text;
      }
    }
    if (done) break;
  }
}
