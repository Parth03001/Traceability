/**
 * Utility functions for processing markdown content
 * Minimal fixes for backend formatting issues
 * React-markdown with remark-gfm handles tables natively and robustly
 */

/**
 * Fixes critical backend markdown formatting issues
 * Only fixes what's necessary - lets react-markdown handle the rest
 * @param {string} markdown - The markdown text to process
 * @param {boolean} isComplete - Whether the markdown is complete (not streaming)
 * @returns {string} - Fixed markdown text
 */
export function fixMarkdownTables(markdown, isComplete = false) {
  if (!markdown) return markdown;

  let result = markdown;

  // Fix 0: Add space after # symbols when missing (e.g., "###2025 Title" -> "### 2025 Title")
  // The LLM sometimes generates headings without the required space after #
  result = result.replace(/(^#{1,6})([^\s#])/gm, "$1 $2");

  // Fix 1: Split concatenated headings (## Heading### Subheading -> ## Heading\n\n### Subheading)
  // This is the main issue: "## Detailed Analysis### Top Complaint Descriptions"
  result = result.replace(/(^#{1,6}\s+[^\n]+?)(#{1,6}\s+)/gm, "$1\n\n$2");

  // Fix 2: Split headings that end with a colon and have text continuing on the same line
  // Pattern: ### Heading: text continues -> ### Heading:\n\ntext continues
  // Handles cases like "### Vehicle-aligned traceability: part, batch, and shift for the vendor's claimsI traced..."
  // BUT: Don't split if the continuing text looks like a bullet point (bullet points should be on next line)
  result = result.replace(
    /(^#{1,6}\s+[^\n:]+:)([^\n]+)/gm,
    (match, headingWithColon, continuingText) => {
      const trimmed = continuingText.trim();

      // Don't split if:
      // - Empty
      // - Starts with pipe (table) - handled by Fix 4
      // - Starts with # (another heading) - handled by Fix 1
      // - Starts with bullet marker (bullets should be on next line, not same line)
      // - Looks like a bullet list pattern
      if (
        trimmed &&
        !trimmed.startsWith("|") &&
        !trimmed.startsWith("#") &&
        !trimmed.match(/^[-•*]\s/) // Don't split if it looks like a bullet point
      ) {
        return headingWithColon + "\n\n" + trimmed;
      }
      return match;
    }
  );

  // Fix 3: Split headings that are immediately followed by bullet points on the same line
  // Pattern: ### Heading- bullet or ### Heading - bullet or ### Heading* bullet -> ### Heading\n\n- bullet
  // This handles cases where bullets are attached directly to headings (with or without space)
  result = result.replace(
    /(^#{1,6}\s+[^\n]+?)(\s*[-•*]\s+[^\n]+)/gm,
    (match, heading, bulletContent) => {
      const headingTrimmed = heading.trim();
      const bulletTrimmed = bulletContent.trim();

      // Skip if heading already ends with colon (handled by Fix 2)
      // Skip if this looks like part of the heading text (e.g., "Vehicle-aligned" - dash in word)
      // Only process if bulletContent starts with a bullet marker followed by space
      if (
        !headingTrimmed.endsWith(":") &&
        bulletTrimmed.match(/^[-•*]\s/) &&
        !headingTrimmed.match(/[-•*]\s*$/) // Don't split if heading ends with dash/bullet (part of word)
      ) {
        return headingTrimmed + "\n\n" + bulletTrimmed;
      }
      return match;
    }
  );

  // Fix 4: Split headings that are on the same line as table headers
  // Pattern: ### Heading| Column | Column | -> ### Heading\n\n| Column | Column |
  result = result.replace(
    /(^#{1,6}\s+[^\n|#]+)\s*\|([^\n]+)/gm,
    (match, heading, tableContent) => {
      return heading + "\n\n|" + tableContent;
    }
  );

  // Fix 5: Ensure headings have blank lines before tables
  // Pattern: ### Heading\n| Column | -> ### Heading\n\n| Column |
  result = result.replace(/(^#{1,6}\s+[^\n]+)\n(\|[^\n]+\|)/gm, "$1\n\n$2");

  // Fix 6: Split heading text that runs into body text without a line break
  // Pattern: "### January2025 Warranty ConcernHere is the January2025..."
  // Only matches when lowercase letter is IMMEDIATELY followed by capitalized sentence-start word
  // (no space between = concatenation, not natural heading text)
  result = result.replace(
    /(^#{1,6}\s+[^\n]+?[a-z])((?:Here (?:is|are)|The |This |Based on|Below |Above |I (?:traced|found|identified|analyzed|will)|Let me|Looking at|We |It |A |An )[^\n]*)/gm,
    "$1\n\n$2"
  );

  // Fix 7: Ensure bold section headers (used as pseudo-headings) have blank lines before lists
  // Pattern: "**Notes**\n- item" -> "**Notes**\n\n- item"
  // Pattern: "**Next Steps**\n1. item" -> "**Next Steps**\n\n1. item"
  result = result.replace(
    /(\*\*[^*]+\*\*)\s*\n([-•*]\s+|\d+\.\s+)/gm,
    "$1\n\n$2"
  );

  // Fix 8: Ensure bold section headers on same line as content get separated
  // Pattern: "**Notes**- bullet" or "**Notes** Some text" -> "**Notes**\n\n- bullet"
  result = result.replace(
    /(\*\*(?:Notes?|Next Steps?|Key (?:Insights?|Findings?|Observations?)|Summary|Recommendations?|Detailed? Analysis|Conclusion|Results?|Chart:[^*]*)\*\*)\s*([^\n*])/gim,
    (match, header, content) => {
      // Don't split if content is just whitespace or another bold marker
      const trimmed = content.trim();
      if (!trimmed) return match;
      return header + "\n\n" + content;
    }
  );

  // Fix 9: Ensure **Chart: Title** on same line as heading gets its own line
  // Pattern: "## Detailed Analysis**Chart: Title**" -> "## Detailed Analysis\n\n**Chart: Title**"
  result = result.replace(
    /(^#{1,6}\s+[^\n*]+)(\*\*Chart:\s*[^*]+\*\*)/gm,
    "$1\n\n$2"
  );

  // Fix 10: Normalize multiple consecutive blank lines (keep max 2)
  result = result.replace(/\n{3,}/g, "\n\n");

  // Fix 11: Heading marker (####) embedded mid-line after non-whitespace text
  // Pattern: "Total defects:135#### Source:" -> "Total defects:135\n\n#### Source:"
  // The LLM sometimes concatenates a heading immediately after inline text without a newline.
  // All existing fixes use ^ (line-start) — this catches the mid-line case.
  result = result.replace(/([^\n#])(#{1,6})(\s)/g, "$1\n\n$2$3");

  // Fix 12: Plain text line immediately before a table row with no blank line
  // Pattern: "raw_warranty_data\n| Issue |" -> "raw_warranty_data\n\n| Issue |"
  // react-markdown requires a blank line before a table when preceded by a paragraph.
  result = result.replace(
    /([^\n|])\n(\|[^\n]+\|)/g,
    (match, beforeText, tableRow) => {
      // Don't double-insert if the char before is already a newline (blank line exists)
      return beforeText + "\n\n" + tableRow;
    }
  );

  // Fix 13: Table name at start of line immediately followed by pipe with no space/newline
  // Pattern: "raw_warranty_data| Column | Count |" -> "raw_warranty_data\n\n| Column | Count |"
  // The LLM sometimes concatenates a table/source name directly with the first table pipe.
  // Use ^ (line-start) with gm flag to avoid touching mid-line pipe characters.
  result = result.replace(
    /^([A-Za-z0-9_]+)\|([^\n]+\|[^\n]*)/gm,
    (match, word, tableContent) => {
      return word + "\n\n|" + tableContent;
    }
  );

  // Re-normalise after new fixes (avoid triple+ newlines introduced above)
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}
