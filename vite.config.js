import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      usePolling: true
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        test_clouds: 'test_clouds.html'
      }
    }
  },
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.obj', '**/*.png', '**/*.jpg', '**/*.mp3', '**/*.wav']
})
