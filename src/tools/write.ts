// ============================================================
// Write File Tool
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { ToolResult } from '../types';

export async function writeFile(args: {
  file_path: string;
  content: string;
}): Promise<ToolResult> {
  try {
    const filePath = path.resolve(args.file_path);

    // Safety: warn about overwriting
    const existed = fs.existsSync(filePath);

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, args.content, 'utf-8');

    const action = existed ? 'Updated' : 'Created';
    const lines = args.content.split('\n').length;
    const size = Buffer.byteLength(args.content, 'utf-8');

    return {
      success: true,
      output: `${action} file: ${filePath}\nLines: ${lines}, Size: ${formatSize(size)}`,
    };
  } catch (err: any) {
    return { success: false, output: '', error: `Write error: ${err.message}` };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
