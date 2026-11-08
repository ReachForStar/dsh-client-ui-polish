import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

// Vite's default transform leaves standard TypeScript decorators for the
// runtime, which Node cannot parse. The typert Remote decorators are standard
// decorators, so lower them with TypeScript before Vite parses the file.
function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

// One config for the whole workspace: every package runs `vitest run` from its
// own directory, and without this file Vitest walks up to the enclosing
// DeepSeek Harness checkout (when the repository is nested inside one) and
// picks up that checkout's root config. Per-file `@vitest-environment jsdom`
// docblocks switch the browser-facing specs.
export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    exclude: ['**/node_modules/**', '**/lib/**'],
  },
})
