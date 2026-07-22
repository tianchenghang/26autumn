export interface MethodInfo {
  readonly name: string;
  readonly eventType: string | null;
  readonly byteOffset: number;
}

export function parseEventMethodName(raw: string): {
  handlerName: string;
  eventType: string | null;
} {
  const match = raw.match(/^(.+?)<([a-z,]+)>$/);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { handlerName: match[1], eventType: match[2] };
  }
  return { handlerName: raw, eventType: null };
}
