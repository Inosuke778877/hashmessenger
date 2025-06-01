export default {
  root: 'pages', // Serve HTML files from the pages directory
  build: {
    outDir: '../dist', // Output build files to dist/
    emptyOutDir: true // Clear the output directory before building
  },
  base: '/' // Base public path for assets
}
