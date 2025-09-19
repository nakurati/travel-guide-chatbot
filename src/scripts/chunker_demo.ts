// scripts/chunker_demo.ts

// Small sample text with three paragraphs separated by blank lines
const sample = [
  'Paris is the capital and most populous city of France. It is famed for art, fashion, gastronomy, and culture.',
  "The city is crossed by the River Seine and is home to world-class museums like the Louvre and Musée d'Orsay.",
  'Landmarks include the Eiffel Tower, Notre-Dame Cathedral, and the Arc de Triomphe. The metro is the fastest way to move around.',
].join('\n\n');

function chunkByParagraph(text: string, maxChars = 400, overlapChars = 50) {
  // Split text into paragraphs wherever there’s a blank line
  const paragraphs = text.split(/\n\s*\n/);

  const chunks: string[] = []; // final result list
  let currentChunk = ''; // what we’re building right now

  for (const paragraph of paragraphs) {
    // Add a separator only if we already have text in currentChunk
    const separator = currentChunk ? '\n\n' : '';

    // Try to merge current chunk with the new paragraph
    const merged = currentChunk + separator + paragraph;

    if (merged.length <= maxChars) {
      // If it still fits within max size, keep merging
      currentChunk = merged;
    } else {
      // If it overflows, flush the current chunk into result
      if (currentChunk) chunks.push(currentChunk);

      if (paragraph.length > maxChars) {
        // Case 1: paragraph itself is too big → hard-split with overlap
        for (let i = 0; i < paragraph.length; i += maxChars - overlapChars) {
          chunks.push(paragraph.slice(i, i + maxChars));
        }
        currentChunk = ''; // reset since we already pushed slices
      } else {
        // Case 2: start a new chunk, but carry a small overlap tail
        const overlapTail = currentChunk.slice(-overlapChars);
        currentChunk = (overlapTail ? overlapTail + '\n\n' : '') + paragraph;
      }
    }
  }

  // Push any leftover text
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

// Run demo with smaller maxChars so we force multiple chunks
const chunks = chunkByParagraph(sample, 220, 40);
console.log(
  `chunks=${chunks.length} first_len=${chunks[0].length} last_len=${chunks.at(-1)!.length}`,
);
