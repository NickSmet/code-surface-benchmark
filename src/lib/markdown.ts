import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

/** Render a markdown string to HTML for chat bubbles. Local single-user demo. */
export function renderMarkdown(src: string): string {
  return marked.parse(src ?? '', { async: false }) as string;
}
