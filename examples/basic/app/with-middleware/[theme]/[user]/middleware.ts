import { MiddlewareHandler } from "@cxptools/next-app-middleware/runtime";

const middleware: MiddlewareHandler<{ theme: string; user: string }> = (
  req
) => {
  console.log("middleware", req.params.theme, req.params.user);
};

export default middleware;
