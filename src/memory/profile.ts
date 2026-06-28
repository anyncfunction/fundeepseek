// ============================================================
// User Profile Analyzer — automatically learns user
// preferences, coding style, and personality from
// conversation history
// ============================================================
import { UserProfile, Message } from '../types';
import { MemoryStore } from './store';

const DEFAULT_PROFILE: UserProfile = {
  codingStyle: {
    indentation: 'spaces',
    indentSize: 2,
    namingPreference: 'camelCase',
    commentDensity: 'moderate',
    quotePreference: 'single',
    semicolons: true,
  },
  techStack: {
    languages: [],
    frameworks: [],
    tools: [],
  },
  interactionStyle: {
    verbosity: 'balanced',
    confirmThreshold: 'medium',
    preferExplanations: false,
    preferCodeFirst: true,
  },
  personality: {
    traits: [],
    learningStyle: 'hands-on',
    patience: 'medium',
  },
};

export class UserProfileAnalyzer {
  private profile: UserProfile;
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
    this.profile = this.loadProfile();
  }

  get current(): UserProfile {
    return this.profile;
  }

  /** Analyze messages from a conversation and update the profile */
  analyzeMessages(messages: Message[]): UserProfile {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantRequestedEdits =
      messages.filter((m) => m.role === 'tool' && m.name === 'edit_file').length;

    // Analyze coding style from user's code snippets
    this.analyzeCodingStyle(userMessages);

    // Analyze interaction patterns
    this.analyzeInteractionStyle(userMessages, assistantRequestedEdits);

    // Detect tech stack mentions
    this.detectTechStack(messages);

    // Infer personality traits
    this.inferPersonality(messages);

    // Save updated profile
    this.saveProfile();

    return this.profile;
  }

  /** Update profile with explicit user feedback */
  updateWithFeedback(feedback: string): void {
    // Store the feedback as a memory
    this.store.save({
      name: `feedback-${Date.now()}`,
      description: 'User feedback on coding style or preferences',
      metadata: {
        type: 'feedback',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      content: feedback,
    });

    // Parse feedback for actionable items
    const lower = feedback.toLowerCase();

    if (lower.includes('tab') && lower.includes('indent')) {
      this.profile.codingStyle.indentation = 'tabs';
    }
    if (lower.includes('space') && lower.includes('indent')) {
      this.profile.codingStyle.indentation = 'spaces';
    }
    if (lower.includes('2 space') || lower.includes('2-space')) {
      this.profile.codingStyle.indentSize = 2;
    }
    if (lower.includes('4 space') || lower.includes('4-space')) {
      this.profile.codingStyle.indentSize = 4;
    }
    if (lower.includes('snake_case') || lower.includes('snake case')) {
      this.profile.codingStyle.namingPreference = 'snake_case';
    }
    if (lower.includes('camelcase') || lower.includes('camel case')) {
      this.profile.codingStyle.namingPreference = 'camelCase';
    }
    if (lower.includes('double quote') || lower.includes('double-quote')) {
      this.profile.codingStyle.quotePreference = 'double';
    }
    if (lower.includes('single quote') || lower.includes('single-quote')) {
      this.profile.codingStyle.quotePreference = 'single';
    }
    if (lower.includes('no semicolon') || lower.includes('no semi')) {
      this.profile.codingStyle.semicolons = false;
    }
    if (lower.includes('concise') || lower.includes('brief')) {
      this.profile.interactionStyle.verbosity = 'concise';
    }
    if (lower.includes('detailed') || lower.includes('verbose')) {
      this.profile.interactionStyle.verbosity = 'detailed';
    }
    if (lower.includes('explain') || lower.includes('explanation')) {
      this.profile.interactionStyle.preferExplanations = true;
    }
    if (lower.includes('code first') || lower.includes('just code')) {
      this.profile.interactionStyle.preferCodeFirst = true;
      this.profile.interactionStyle.preferExplanations = false;
    }

    this.saveProfile();
  }

  /** Get profile summary for display */
  getSummary(): string {
    const p = this.profile;
    return [
      `🎨 **Your Coding Profile**`,
      ``,
      `Style: ${p.codingStyle.indentSize}-${p.codingStyle.indentation}, ${p.codingStyle.namingPreference}, ${p.codingStyle.quotePreference} quotes${p.codingStyle.semicolons ? ', semicolons' : ', no semicolons'}`,
      `Comments: ${p.codingStyle.commentDensity}`,
      `Tech: ${p.techStack.languages.join(', ') || '(learning...)'}`,
      `Frameworks: ${p.techStack.frameworks.join(', ') || '(learning...)'}`,
      `Verbosity: ${p.interactionStyle.verbosity}`,
      `Style: ${p.interactionStyle.preferCodeFirst ? 'code-first' : 'explanation-first'}`,
      `Traits: ${p.personality.traits.join(', ') || '(learning...)'}`,
    ].join('\n');
  }

  // ---- Private Analysis Methods ----

  private analyzeCodingStyle(messages: Message[]): void {
    let indent2Count = 0;
    let indent4Count = 0;
    let tabCount = 0;
    let singleQuoteCount = 0;
    let doubleQuoteCount = 0;
    let camelCaseCount = 0;
    let snakeCaseCount = 0;
    let semicolonCount = 0;
    let noSemicolonCount = 0;
    let commentCount = 0;
    let totalLines = 0;

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (!content) continue;

      // Look for code blocks
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      for (const block of codeBlocks) {
        const code = block.replace(/```\w*\n?/g, '').replace(/```$/, '');
        const lines = code.split('\n');
        totalLines += lines.length;

        for (const line of lines) {
          // Indentation
          if (line.startsWith('  ') && !line.startsWith('    ')) indent2Count++;
          if (line.startsWith('    ')) indent4Count++;
          if (line.startsWith('\t')) tabCount++;

          // Quotes
          if (line.includes("'")) singleQuoteCount++;
          if (line.includes('"')) doubleQuoteCount++;

          // Naming
          if (/[a-z][A-Z]/.test(line.trim())) camelCaseCount++;
          if (line.includes('_') && !line.includes('__')) snakeCaseCount++;

          // Semicolons
          if (line.trim().endsWith(';')) semicolonCount++;
          else if (/[a-zA-Z0-9'"`)}\]]$/.test(line.trim()) && line.trim().length > 3)
            noSemicolonCount++;

          // Comments
          if (
            line.trim().startsWith('//') ||
            line.trim().startsWith('#') ||
            line.trim().startsWith('--') ||
            line.includes('/*') ||
            line.includes('*/')
          )
            commentCount++;
        }
      }
    }

    // Update based on evidence
    if (tabCount > indent2Count && tabCount > indent4Count) {
      this.profile.codingStyle.indentation = 'tabs';
      this.profile.codingStyle.indentSize = 4;
    } else if (indent2Count > indent4Count) {
      this.profile.codingStyle.indentation = 'spaces';
      this.profile.codingStyle.indentSize = 2;
    } else if (indent4Count > 0) {
      this.profile.codingStyle.indentation = 'spaces';
      this.profile.codingStyle.indentSize = 4;
    }

    if (singleQuoteCount > doubleQuoteCount * 1.5) {
      this.profile.codingStyle.quotePreference = 'single';
    } else if (doubleQuoteCount > singleQuoteCount * 1.5) {
      this.profile.codingStyle.quotePreference = 'double';
    }

    if (camelCaseCount > snakeCaseCount * 2) {
      this.profile.codingStyle.namingPreference = 'camelCase';
    } else if (snakeCaseCount > camelCaseCount * 2) {
      this.profile.codingStyle.namingPreference = 'snake_case';
    }

    if (semicolonCount > noSemicolonCount * 2) {
      this.profile.codingStyle.semicolons = true;
    } else if (noSemicolonCount > semicolonCount * 2) {
      this.profile.codingStyle.semicolons = false;
    }

    if (totalLines > 0) {
      const commentRatio = commentCount / totalLines;
      if (commentRatio > 0.3) this.profile.codingStyle.commentDensity = 'verbose';
      else if (commentRatio > 0.1) this.profile.codingStyle.commentDensity = 'moderate';
      else this.profile.codingStyle.commentDensity = 'minimal';
    }
  }

  private analyzeInteractionStyle(
    messages: Message[],
    editCount: number
  ): void {
    // Analyze message complexity to infer preferences
    let totalWords = 0;
    let askCount = 0;

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      totalWords += content.split(/\s+/).filter(Boolean).length;

      // Count questions (user asking for explanations)
      if (
        content.includes('why') ||
        content.includes('explain') ||
        content.includes('how does') ||
        content.includes('what is')
      ) {
        askCount++;
      }
    }

    const avgWords = messages.length > 0 ? totalWords / messages.length : 0;

    // Short messages → prefers concise
    if (avgWords < 20) {
      this.profile.interactionStyle.verbosity = 'concise';
    } else if (avgWords > 100) {
      this.profile.interactionStyle.verbosity = 'detailed';
    }

    // Many explanation questions → prefers explanations
    if (askCount > messages.length * 0.3) {
      this.profile.interactionStyle.preferExplanations = true;
      this.profile.interactionStyle.preferCodeFirst = false;
    }

    // Many edits → likes to iterate
    if (editCount > 5) {
      this.profile.interactionStyle.confirmThreshold = 'high';
    }
  }

  private detectTechStack(messages: Message[]): void {
    const allText = messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join(' ');

    const languagePatterns: Record<string, RegExp> = {
      TypeScript: /\btypescript\b|\.ts\b|\.tsx\b/i,
      JavaScript: /\bjavascript\b|\.js\b|\.jsx\b/i,
      Python: /\bpython\b|\.py\b|\bdef\s+\w+\s*\(/i,
      Rust: /\brust\b|\.rs\b|\bfn\s+\w+\s*\(/i,
      Go: /\bgolang\b|\.go\b/i,
      Java: /\bjava\b|\.java\b/i,
      'C++': /\bc\+\+\b|\.cpp\b|\.hpp\b/i,
      Ruby: /\bruby\b|\.rb\b/i,
      PHP: /\bphp\b|\.php\b/i,
      Swift: /\bswift\b|\.swift\b/i,
      Kotlin: /\bkotlin\b|\.kt\b/i,
      SQL: /\bsql\b|\.sql\b|\bselect\b.*\bfrom\b/i,
    };

    const frameworkPatterns: Record<string, RegExp> = {
      React: /\breact\b|\.jsx\b|\.tsx\b/i,
      'Next.js': /\bnext\.?js\b|\bnextjs\b/i,
      Vue: /\bvue\b|\.vue\b/i,
      Angular: /\bangular\b/i,
      Svelte: /\bsvelte\b/i,
      Express: /\bexpress\b/i,
      Django: /\bdjango\b/i,
      Flask: /\bflask\b/i,
      FastAPI: /\bfastapi\b/i,
      Spring: /\bspring\b/i,
      Laravel: /\blaravel\b/i,
      'React Native': /\breact.?native\b/i,
      Flutter: /\bflutter\b/i,
      Tailwind: /\btailwind\b/i,
    };

    const toolPatterns: Record<string, RegExp> = {
      Git: /\bgit\b/i,
      Docker: /\bdocker\b/i,
      Kubernetes: /\bk8s\b|\bkubernetes\b/i,
      VSCode: /\bvs.?code\b/i,
      Webpack: /\bwebpack\b/i,
      Vite: /\bvite\b/i,
      ESLint: /\beslint\b/i,
      Prettier: /\bprettier\b/i,
      Jest: /\bjest\b/i,
      PostgreSQL: /\bpostgres(ql)?\b/i,
      MongoDB: /\bmongo(db)?\b/i,
      Redis: /\bredis\b/i,
      GraphQL: /\bgraphql\b/i,
      Nginx: /\bnginx\b/i,
      AWS: /\baws\b/i,
      'GitHub Actions': /\bgithub.?actions\b/i,
    };

    const detectedLanguages: string[] = [];
    const detectedFrameworks: string[] = [];
    const detectedTools: string[] = [];

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(allText)) detectedLanguages.push(lang);
    }
    for (const [fw, pattern] of Object.entries(frameworkPatterns)) {
      if (pattern.test(allText)) detectedFrameworks.push(fw);
    }
    for (const [tool, pattern] of Object.entries(toolPatterns)) {
      if (pattern.test(allText)) detectedTools.push(tool);
    }

    // Merge with existing (deduplicate)
    this.profile.techStack.languages = [
      ...new Set([...this.profile.techStack.languages, ...detectedLanguages]),
    ];
    this.profile.techStack.frameworks = [
      ...new Set([...this.profile.techStack.frameworks, ...detectedFrameworks]),
    ];
    this.profile.techStack.tools = [
      ...new Set([...this.profile.techStack.tools, ...detectedTools]),
    ];
  }

  private inferPersonality(messages: Message[]): void {
    const allText = messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join(' ');

    const traits: string[] = [];

    // Analyze personality indicators
    if (allText.match(/please|thanks|thank you|appreciate/gi)?.length || 0 > 3) {
      traits.push('polite');
    }
    if (allText.match(/urgent|quickly|asap|fast/gi)?.length || 0 > 2) {
      traits.push('efficiency-focused');
      this.profile.personality.patience = 'low';
    }
    if (allText.match(/detail|thorough|explain|why/gi)?.length || 0 > 5) {
      traits.push('detail-oriented');
    }
    if (allText.match(/best practice|clean code|pattern|architecture/gi)?.length || 0 > 3) {
      traits.push('quality-focused');
    }
    if (allText.match(/just|simple|easy|quick fix|hack/gi)?.length || 0 > 3) {
      traits.push('pragmatic');
    }

    // Message count indicates engagement
    if (messages.length > 20) {
      traits.push('engaged');
    }
    if (messages.length < 5) {
      traits.push('terse');
    }

    // Code-first vs explanation-first already determined in interactionStyle

    this.profile.personality.traits = [...new Set([...this.profile.personality.traits, ...traits])];
  }

  // ---- Persistence ----

  private loadProfile(): UserProfile {
    try {
      const mem = this.store.getBySlug('user-profile');
      if (mem) {
        return JSON.parse(mem.content);
      }
    } catch {
      // Return default
    }
    return { ...DEFAULT_PROFILE };
  }

  private saveProfile(): void {
    this.store.save({
      name: 'user-profile',
      description: 'Auto-generated user profile based on conversation analysis',
      metadata: {
        type: 'user',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      content: JSON.stringify(this.profile, null, 2),
    });
  }
}
