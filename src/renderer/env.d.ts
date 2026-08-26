declare global {
  interface Window {
    api: {
      getAppVersion: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      chatSend: (messages: { role: string; content: string }[], model: string, apiKey: string) => Promise<string>;
    };
  }
}

export {};
