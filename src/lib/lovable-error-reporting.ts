export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  console.error('[Application Error]', error, context);
}

