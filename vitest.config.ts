import { defineConfig } from 'vitest/config'

// O painel usa o runtime automático de JSX, como no app que o compila.
export default defineConfig({ esbuild: { jsx: 'automatic' } })
