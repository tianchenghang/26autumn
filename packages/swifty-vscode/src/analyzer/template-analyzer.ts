import { extractGlobalVars } from "@swifty.js/mvc/compiler";
import { logError } from "../logger.js";

export interface TemplateEventBinding {
  readonly eventType: string;
  readonly handlerName: string;
  readonly offset: number;
}

export interface TemplateViewRef {
  readonly path: string;
  readonly offset: number;
}

export interface TemplateAnalysis {
  readonly events: readonly TemplateEventBinding[];
  readonly viewRefs: readonly TemplateViewRef[];
  readonly variables: readonly string[];
}

const EVENT_ATTR_PATTERN = /@(\w+)="([^"]+)"/g;
const HANDLER_PATTERN = /^(\w+)\(.*\)$/s;
const V_SWIFTY_PATTERN = /v-swifty\s*=\s*"([^"?]+)(?:\?[^"]*)?"/g;

export async function analyzeTemplate(
  source: string,
): Promise<TemplateAnalysis> {
  const events = extractEventBindings(source);
  const viewRefs = extractViewRefs(source);
  let variables: string[] = [];

  try {
    variables = await extractGlobalVars(source);
  } catch (e) {
    logError("Failed to extract template variables", e);
  }

  return { events, viewRefs, variables };
}

function extractEventBindings(source: string): TemplateEventBinding[] {
  const bindings: TemplateEventBinding[] = [];
  const regex = new RegExp(EVENT_ATTR_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const eventType = match[1];
    const attrValue = match[2];
    if (eventType === undefined || attrValue === undefined) continue;

    const handlerMatch = HANDLER_PATTERN.exec(attrValue);
    if (handlerMatch === null || handlerMatch[1] === undefined) continue;

    const handlerName = handlerMatch[1];
    const attrOffset = match.index;
    const valueStart = source.indexOf('"', attrOffset) + 1;

    bindings.push({
      eventType,
      handlerName,
      offset: valueStart,
    });
  }

  return bindings;
}

function extractViewRefs(source: string): TemplateViewRef[] {
  const refs: TemplateViewRef[] = [];
  const regex = new RegExp(V_SWIFTY_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const viewPath = match[1];
    if (viewPath === undefined) continue;

    const attrOffset = match.index;
    const valueStart = source.indexOf('"', attrOffset) + 1;

    refs.push({
      path: viewPath,
      offset: valueStart,
    });
  }

  return refs;
}
