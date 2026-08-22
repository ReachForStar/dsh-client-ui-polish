/**
 * tool-excalidraw builds: the node-half lib plus the invariant companion,
 * both consumed from the tsc-emitted `lib/types`.
 */
export default [{
  name: '@deepseek-ai/dsh-tool-excalidraw',
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}]
