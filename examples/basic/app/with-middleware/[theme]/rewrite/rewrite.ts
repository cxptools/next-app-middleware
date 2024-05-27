import type { RewriteHandler } from "@cxptools/next-app-middleware/runtime";

const rewrite: RewriteHandler<{ theme: string }> = ({ params: { theme } }) => {
  return "/" + theme;
};

export default rewrite;
