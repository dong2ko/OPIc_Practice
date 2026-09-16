declare module "mammoth/mammoth.browser" {
  interface Message { type: string; message: string }
  interface Result { value: string; messages: Message[] }
  export const images: {
    imgElement: (handler: (image: unknown) => Promise<Record<string, string>>) => unknown;
  };
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { styleMap?: string[]; includeDefaultStyleMap?: boolean; convertImage?: unknown },
  ): Promise<Result>;
  const mammoth: { convertToHtml: typeof convertToHtml; images: typeof images };
  export default mammoth;
}
