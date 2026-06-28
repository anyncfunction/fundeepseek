# FundeePseek 🐋

**DeepSeek-optimized CLI programming tool** — an intelligent coding agent that runs in your terminal.

Built specifically for DeepSeek's model family with full agent loop, tool execution, streaming thinking display, and automatic user profiling.

## Features

### 🧠 Multi-Model Support
- **deepseek-v4-pro** — 131K context, top-tier reasoning (supports thinking mode)
- **deepseek-v4-flash** — Fast & cheap (supports thinking mode)
- **deepseek-reasoner (R1)** — Dedicated reasoning with always-on thinking
- **deepseek-chat (V3)** — General-purpose coding, fast and cost-effective

### 🤖 Full Agent Loop
Autonomous agent that:
- Reads, writes, and edits files
- Executes shell commands (sandboxed)
- Searches code with regex (grep) and file patterns (glob)
- Performs git operations
- Searches the web for docs and solutions

### 🎯 Four Operating Modes
| Mode | Behavior |
|------|----------|
| `auto` | Full autonomy — reads, writes, executes freely |
| `plan` | Plan-first — shows plan, executes after approval |
| `ask` | Read-only — answers questions, no modifications |
| `chat` | Pure conversation — no tools available |

### 💭 Thinking/Reasoning Display
- See DeepSeek's thinking process in real-time for R1, V4-Pro, and V4-Flash
- Configurable: `on`, `off`, or `auto`

### 🧠 Global Memory & User Profiling
- Automatically learns your coding style (indentation, naming, quotes, etc.)
- Detects your tech stack preferences
- Builds a personality profile from conversation patterns
- Persistent cross-project memories

### 📋 Session Management
- Sessions auto-saved per project in `.deepseek/`
- Resume previous sessions with `dsc --resume`
- Export sessions as markdown

## Installation

```bash
npm install -g fundeepseek
```

Set your API key:
```bash
export DEEPSEEK_API_KEY="sk-xxxxxxxx"
```

## Usage

### Interactive Mode
```bash
dsc
```

### Single Prompt
```bash
dsc -p "Fix the bug in src/auth.ts"
```

### With Specific Model
```bash
dsc --model deepseek-v4-pro -p "Refactor this code"
dsc --model deepseek-reasoner --thinking on -p "Analyze the architecture"
```

### Plan Mode
```bash
dsc --mode plan -p "Add user authentication to the app"
```

### Resume Session
```bash
dsc --resume           # Latest session
dsc --resume <id>      # Specific session
```

### Memory Management
```bash
dsc --profile          # Show your user profile
dsc --memories         # List saved memories
dsc --remember "User prefers TypeScript with strict mode"
dsc --forget <slug>    # Delete a memory
```

## Interactive Commands

| Command | Action |
|---------|--------|
| `/auto` | Switch to auto mode |
| `/plan` | Switch to plan mode |
| `/ask` | Switch to ask mode |
| `/chat` | Switch to chat mode |
| `/model <name>` | Switch model |
| `/clear` | Clear conversation context |
| `/compact` | Show context usage |
| `/usage` | Show token usage & cost |
| `/profile` | Show your profile |
| `/remember <text>` | Save a memory |
| `/memories` | List memories |
| `/exit` | Exit and save session |

## Configuration

### Global Config (`~/.fundeepseek/config.json`)
```json
{
  "defaultModel": "deepseek-chat",
  "defaultMode": "auto",
  "defaultThinking": "off"
}
```

### Project Config (`.deepseek/settings.json`)
```json
{
  "model": "deepseek-v4-pro",
  "mode": "auto",
  "thinking": "on",
  "ignorePatterns": ["node_modules", "dist", ".git"]
}
```

## Development

```bash
git clone https://github.com/anyncfunction/fundeepseek.git
cd fundeepseek
npm install
npm run build
npm start
```

## License

Apache-2.0
