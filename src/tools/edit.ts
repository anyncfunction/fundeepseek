// ============================================================
// Edit File Tool — exact string replacement
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as diffLib from 'diff';
import { ToolResult } from '../types';

export async function editFile(args: {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}): Promise<ToolResult> {
  try {
    const filePath = path.resolve(args.file_path);

    if (!fs.existsSync(filePath)) {
      return { success: false, output: '', error: `File not found: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const occurrences = countOccurrences(content, args.old_string);

    if (occurrences === 0) {
      return {
        success: false,
        output: '',
        error: `old_string not found in file. Make sure it matches exactly (including whitespace and indentation).`,
      };
    }

    if (occurrences > 1 && !args.replace_all) {
      return {
        success: false,
        output: '',
        error: `old_string found ${occurrences} times in the file. Use replace_all: true to replace all, or provide more context to make the match unique.`,
      };
    }

    if (args.old_string === args.new_string) {
      return { success: false, output: '', error: 'old_string and new_string are identical' };
    }

    const newContent = args.replace_all
      ? content.split(args.old_string).join(args.new_string)
      : content.replace(args.old_string, args.new_string);

    fs.writeFileSync(filePath, newContent, 'utf-8');

    // Generate a mini diff for feedback
    const diff = diffLib.createPatch(filePath, content, newContent, 'before', 'after');
    const diffLines = diff.split('\n');
    const shortDiff = diffLines.slice(0, 20).join('\n');

    return {
      success: true,
      output: `File edited: ${filePath}\n${occurrences} replacement(s)\n\n${shortDiff}${diffLines.length > 20 ? '\n... (truncated)' : ''}`,
    };
  } catch (err: any) {
    return { success: false, output: '', error: `Edit error: ${err.message}` };
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
