import { StaticForwarder } from "@cxptools/next-app-middleware/runtime";

export const hosted: StaticForwarder = () => {
  return true;
};
