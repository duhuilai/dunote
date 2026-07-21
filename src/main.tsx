import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 在加载任何可能用到 git 的代码前，先把 Buffer/process 补丁挂到全局（isomorphic-git 依赖）
import './utils/gitPolyfill'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
