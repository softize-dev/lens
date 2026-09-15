/**
 * Painel da lente — `@softize/lens/ui`.
 *
 * Fonte TypeScript compilada pelo Vite do projeto, como o `@softize/opus/ui`. A entrada é
 * `.ts` (e não `.tsx`) porque o Vite só pré-empacota dependências com entrada `.js`/`.ts`.
 * Nada daqui roda no servidor: os tipos de dados vêm do pacote, os valores vêm do handler.
 */
export { mountLens, LensRoot, type MountLensOptions } from './mount.tsx'
export { LensApp } from './lens-app.tsx'
export { LensAddressProvider, DEFAULT_API_BASE, DEFAULT_BASE_PATH, type LensAddress } from './config.tsx'
