export interface SelectionResult {
  content: string;
  contextText: string;
}

// content = the selected text; contextText = the nearest block ancestor's text,
// giving the surrounding paragraph/section without the whole document.
export const extractSelection = (selection: Selection | null): SelectionResult => {
  if (!selection || selection.rangeCount === 0) {
    return { content: '', contextText: '' };
  }
  const range = selection.getRangeAt(0);
  const content = range.toString().trim();
  if (!content) return { content: '', contextText: '' };

  const container = range.commonAncestorContainer;
  const element =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  const block = element?.closest('p, li, blockquote, article, section, main, div') ?? element;
  const contextText = (block?.textContent ?? content).trim().replace(/\s+/g, ' ');
  return { content, contextText };
};
