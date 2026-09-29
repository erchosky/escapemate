export type MessageTree = {
  [key: string]: string | MessageTree;
};

export type TranslationParams = Record<string, string | number>;

export function getMessageValue(messages: MessageTree, key: string): string | undefined {
  let current: string | MessageTree | undefined = messages;

  for (const part of key.split(".")) {
    if (!current || typeof current === "string") return undefined;
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
}

export function interpolateMessage(message: string, params: TranslationParams = {}) {
  return message.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? "" : String(value);
  });
}

export function createTranslator(messages: MessageTree, fallbackMessages: MessageTree = messages) {
  return (key: string, params?: TranslationParams) => {
    const message = getMessageValue(messages, key) ?? getMessageValue(fallbackMessages, key) ?? key;
    return interpolateMessage(message, params);
  };
}
