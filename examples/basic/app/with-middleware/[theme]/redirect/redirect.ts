import type { RedirectHandler } from "@cxptools/next-app-middleware/runtime";

const redirect: RedirectHandler<{ theme: string }> = () => {
  return "/";
};

export default redirect;
