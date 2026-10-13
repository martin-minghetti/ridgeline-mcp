// @types/react-dom is not installed (no new deps); minimal typing for tests only.
declare module "react-dom/server" {
  export function renderToStaticMarkup(node: unknown): string;
}
