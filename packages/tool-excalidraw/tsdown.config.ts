/**
 * Node-half bundle from the tsc-emitted `lib/types`.
 */
export default [{
  name: '@reachforstar/dsh-tool-excalidraw',
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}]
