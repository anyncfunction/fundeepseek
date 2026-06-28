// ============================================================
// Mode System — manages agent operating modes
// ============================================================
import { AgentMode, MODES, ModeConfig } from '../types';

export class ModeManager {
  private currentMode: AgentMode;
  private planBuffer: string[] = []; // For plan mode: accumulates plan steps

  constructor(initialMode: AgentMode = 'auto') {
    this.currentMode = initialMode;
  }

  get mode(): AgentMode {
    return this.currentMode;
  }

  get config(): ModeConfig {
    return MODES[this.currentMode];
  }

  /** Switch to a different mode */
  switch(newMode: AgentMode): string {
    const oldMode = this.currentMode;
    this.currentMode = newMode;

    // Clear plan buffer when leaving plan mode
    if (oldMode === 'plan') {
      this.planBuffer = [];
    }

    return `Switched from ${MODES[oldMode].name} to ${MODES[newMode].name} mode.
${MODES[newMode].description}`;
  }

  /** In plan mode: buffer plan content until approved */
  addToPlan(step: string): void {
    this.planBuffer.push(step);
  }

  getPlan(): string[] {
    return [...this.planBuffer];
  }

  clearPlan(): void {
    this.planBuffer = [];
  }

  /** Check if a tool is allowed in the current mode */
  canUseTool(toolName: string): boolean {
    const isReadTool = ['read_file', 'grep', 'glob'].includes(toolName);
    const isWriteTool = ['write_file', 'edit_file'].includes(toolName);
    const isExecuteTool = ['bash'].includes(toolName);
    const isSearchTool = ['web'].includes(toolName);
    const isGitTool = ['git'].includes(toolName);

    if (isReadTool && !this.config.canRead) return false;
    if (isWriteTool && !this.config.canWrite) return false;
    if (isExecuteTool && !this.config.canExecute) return false;
    if (isSearchTool && !this.config.canSearch) return false;

    // Git tools: read-only ops allowed in ask mode, write ops need canWrite
    if (isGitTool) return this.config.canRead;

    return true;
  }

  /** Get mode-appropriate rejection message */
  getRejectionMessage(toolName: string): string {
    const isWriteTool = ['write_file', 'edit_file'].includes(toolName);
    const isExecuteTool = ['bash'].includes(toolName);

    if (isWriteTool && !this.config.canWrite) {
      return `Cannot write files in ${this.mode} mode. Switch to auto mode with /auto.`;
    }
    if (isExecuteTool && !this.config.canExecute) {
      return `Cannot execute commands in ${this.mode} mode. Switch to auto mode with /auto.`;
    }
    return `Tool '${toolName}' is not available in ${this.mode} mode.`;
  }
}
