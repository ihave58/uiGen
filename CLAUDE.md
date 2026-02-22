# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in chat, and the AI generates them using Claude with a virtual file system. Components are previewed in real-time without writing to disk.

## Development Commands

### Setup
```bash
npm run setup  # Install dependencies, generate Prisma client, run migrations
```

### Running
```bash
npm run dev            # Start dev server with Turbopack
npm run dev:daemon     # Start dev server in background (logs to logs.txt)
npm run build          # Production build
npm run start          # Production server
```

### Testing
```bash
npm run test                           # Run all tests with Vitest
npx vitest run                         # Run tests once
npx vitest --reporter=verbose          # Run tests with verbose output
npx vitest <path/to/test>              # Run specific test file
```

### Database
```bash
npx prisma migrate dev        # Create and apply new migration
npm run db:reset              # Reset database (warning: deletes all data)
npx prisma studio             # Open database GUI
npx prisma generate           # Regenerate Prisma client
```

### Linting
```bash
npm run lint  # Run ESLint
```

## Architecture

### Virtual File System

The core innovation is a completely in-memory file system (`src/lib/file-system.ts`). No code files are written to disk during component generation.

- `VirtualFileSystem` class manages all files in memory using Map data structures
- Supports standard operations: create, read, update, delete, rename
- Serializes to JSON for database persistence
- Files are organized in a tree structure with nodes containing type, name, path, content, and children

### AI Integration Flow

1. User sends message via chat (`src/components/chat/ChatInterface.tsx`)
2. Request hits `/api/chat/route.ts` with messages and current file system state
3. Claude AI receives system prompt (`src/lib/prompts/generation.tsx`) and two tools:
   - `str_replace_editor`: View, create, and edit files using string replacement
   - `file_manager`: Rename and delete files/folders
4. AI makes tool calls to manipulate virtual file system
5. File system changes trigger UI updates via React context
6. Preview updates automatically

### Component Preview System

Preview rendering (`src/components/preview/PreviewFrame.tsx` and `src/lib/transform/jsx-transformer.ts`):

1. Collect all files from virtual file system
2. Transform JSX/TSX to JavaScript using Babel standalone
3. Create blob URLs for each transformed file
4. Generate ES import map mapping file paths (including `@/` alias) to blob URLs
5. Inject import map and entry point into iframe srcdoc
6. Third-party dependencies loaded from esm.sh CDN
7. Tailwind CSS loaded from CDN
8. Syntax errors displayed in styled error UI instead of breaking preview

Entry point resolution priority: `/App.jsx` → `/App.tsx` → `/index.jsx` → `/index.tsx` → `/src/App.jsx` → first .jsx/.tsx file found

### State Management

Two main React contexts:

1. **FileSystemContext** (`src/lib/contexts/file-system-context.tsx`)
   - Manages VirtualFileSystem instance
   - Tracks selected file for editor
   - Provides file CRUD operations
   - `refreshTrigger` counter forces re-renders when file system changes
   - `handleToolCall` updates UI when AI makes tool calls

2. **ChatContext** (`src/lib/contexts/chat-context.tsx`)
   - Manages chat messages and streaming
   - Handles AI SDK integration
   - Coordinates file system updates with chat responses

### Authentication & Persistence

- JWT-based auth (`src/lib/auth.ts`) with cookies
- Bcrypt for password hashing
- Prisma with SQLite for local development
- Two models: User and Project
- Projects store serialized messages (JSON array) and file system state (JSON object)
- Anonymous users can create projects but cannot save them
- Anonymous usage tracked via `src/lib/anon-work-tracker.ts`

### Import Path Resolution

The virtual file system and preview transformer support:
- Absolute paths: `/components/Button.jsx`
- `@/` alias pointing to root: `@/components/Button.jsx`
- Extension-less imports: `@/components/Button` works for `Button.jsx`

All these variations are added to the import map during transformation.

## Key Implementation Details

### Node.js 25+ Compatibility

`node-compat.cjs` removes global localStorage/sessionStorage in SSR context to prevent "localStorage.getItem is not a function" errors from Node 25's experimental Web Storage API.

### AI System Prompt Rules

The generation prompt (`src/lib/prompts/generation.tsx`) enforces:
- Every project must have `/App.jsx` as entry point with default export
- Use Tailwind CSS for styling, not inline styles
- No HTML files (React only)
- All local imports use `@/` alias
- Operating on virtual filesystem root `/`

### Preview Sandbox

The preview iframe uses `sandbox="allow-scripts allow-same-origin allow-forms"` to safely execute user-generated code while maintaining blob URL import map functionality.

### Testing Setup

Vitest configured with:
- jsdom environment for React component testing
- React Testing Library for component tests
- vite-tsconfig-paths for path alias resolution (`@/`)
- Tests located in `__tests__` directories alongside source files
