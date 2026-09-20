import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    // isomorphic-git 依赖的 buffer 包在浏览器环境引用 global，映射到 globalThis
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 分包：把体积大且稳定的第三方库拆成独立 chunk，
    // 便于浏览器/系统缓存复用，也避免单个巨型 chunk 拖慢首屏解析。
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // TipTap / ProseMirror 编辑器全家桶（首屏必需，单独成包便于缓存复用）
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor'
          // React 运行时
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'vendor-react'
          // 其余第三方库**不要**合并进同一个 vendor 包：
          // html2pdf、isomorphic-git、docx 等是动态导入的，一旦并入被首屏引用的 vendor，
          // 就会退化成启动即加载，抵消按需加载的收益。交给打包器自行按引用关系分包。
          return undefined
        },
      },
    },
  },
})
