import {
  Branch,
  BranchTypes,
  DynamicSegment,
  EjectedMiddleware,
  EjectedNextResponse,
  EjectedRewrite,
  EjectedRouter,
  PathSegmentSwitch,
  RouterHooksConfig,
} from "./types";
import { createHash } from "crypto";

export { BranchTypes };

export type {
  Branch,
  DynamicSegment,
  EjectedMiddleware,
  EjectedNextResponse,
  EjectedRewrite,
  EjectedRouter,
  PathSegmentSwitch,
  RouterHooksConfig,
};

const getSegmentHash = (location: string) =>
  createHash("sha1").update(location).digest("hex").slice(0, 10);

const renderRetrurnNext = ({ rewrite }: EjectedNextResponse) =>
  (rewrite
    ? `
next = (final_params) =>
  \`${rewrite.replace(/\/(:[^/]*)/gm, (match, value) => {
    return match.replace(value, `\${final_params.${value.slice(1)}}`);
  })}\`
`
    : `
next = true;
`
  ).trim();

const renderNotFound = () =>
  `
notFound = true;
`.trim();

const renderHandleResponse = () => "";

const renderBranches = (branches: Branch[]) =>
  `
switch (segments.length - 1) {
  ${branches
    .map((branch, idx) =>
      branch
        ? `
    case ${idx}: {
      ${renderBranch(branch)}
      break;
    }
  `.trim()
        : ""
    )
    .filter(Boolean)
    .join("\n")}
  default: {
    notFound = true;
    break;
  }
}
`.trim();

const renderHooksImport = (hooks: RouterHooksConfig) => {
  const usedHooks = Object.entries(hooks)
    .filter(([, value]) => value)
    .map(([key]) => key);
  if (usedHooks.length)
    return `
  import {
    ${usedHooks
      .map((hook) =>
        `
    ${hook} as ${hook}Hook
    `.trim()
      )
      .join(",\n")}
  } from "./middleware.hooks";
  `.trim();
  else return "";
};

const importTypes = ["rewrite", "middleware"] as const;

export const renderDynamicImports = (
  imports: Array<[string, "middleware" | "rewrite"]>
) =>
  `
${imports
  .sort((a, b) => importTypes.indexOf(b[1]) - importTypes.indexOf(a[1]))
  .map(([location, type]) =>
    `
const ${type}_${getSegmentHash(location)} = import("./${location}/${type}");
`.trim()
  )
  .join("\n")}
`.trim();

export const renderRouter = (router: EjectedRouter) =>
  `
import type {
  MiddleWareHandlerResult,
  NextMiddlewareInternals,
  NextMiddlewareRequest,
  NextMiddlewareResponse,
  Params,
} from "next-app-middleware/runtime";
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies/response-cookies";
import { NextMiddleware, NextResponse } from "next/server";
${renderHooksImport(router.hooks)}

${renderDynamicImports(router.imports)}

const publicFiles = new Set<string>([${router.publicFiles
    .map((publicFile) => `"${publicFile}"`)
    .join(", ")}]);

type ParamType = Record<string, string>;

export const middleware: NextMiddleware = async (nextRequest, ev) => {
  if (nextRequest.method !== "GET") return NextResponse.next();
  const incomingPathname = nextRequest.nextUrl.pathname;
  if (incomingPathname.indexOf("_next/", 1) === 0) return NextResponse.next();
  if (incomingPathname === "/api" || incomingPathname.indexOf("api/", 1) === 0)
    return NextResponse.next();
  if (publicFiles.has(incomingPathname))
    return NextResponse.next();
  const pathname =
    incomingPathname.length < 2
      ? "/"
      : incomingPathname.charCodeAt(incomingPathname.length - 1) === 47
      ? incomingPathname
      : incomingPathname + "/";
  const [, ...segments] = pathname.split("/");
  const params: ParamType = {};
  const internals = {} as NextMiddlewareInternals;
  const req = {} as NextMiddlewareRequest;
  Object.defineProperty(req, "url", {
    get: () =>
      internals.nextUrl || (internals.nextUrl = nextRequest.nextUrl.clone()),
  });
  Object.defineProperty(req, "headers", {
    get: () =>
      internals.requestHeaders || (internals.requestHeaders = new Headers()),
  });
  Object.defineProperty(req, "params", {
    get: () => ({
      ...params,
    }),
  });
  Object.defineProperty(req, "search", {
    get: () =>
      internals.searchParams ||
      (internals.searchParams = new URLSearchParams(
        nextRequest.nextUrl.search
      )),
  });
  Object.defineProperty(req, "waitUntil", {
    get: () => (promise: Promise<any>) => ev.waitUntil(promise)
  });
  const res = {} as NextMiddlewareResponse;
  Object.defineProperty(res, "headers", {
    get: () =>
      internals.responseHeaders || (internals.responseHeaders = new Headers()),
  });
  Object.defineProperty(res, "cookies", {
    get: () =>
      internals.cookies ||
      (internals.cookies = new ResponseCookies(res.headers)),
  });
  let middleware_response: MiddleWareHandlerResult | undefined = undefined;
  let response: NextResponse | undefined = undefined;
  let next: ((params: ParamType) => string) | true | undefined = undefined;
  let notFound: boolean = false;
  ${renderBranches(router.branches)}
  if (!response) {
    if (notFound) {
      ${
        router.hooks.notFound
          ? `
        response = (await nofFoundHook(req, res)) || NextResponse.rewrite(new URL("/404", nextRequest.nextUrl));
      `
          : `response = NextResponse.rewrite(new URL("/404", nextRequest.nextUrl));`
      }
      
    } else if (next) {
      let final_pathname = incomingPathname;
      if (typeof next === "function") {
        ${
          router.hooks.params
            ? `
          const final_params = (await paramsHook(params)) || params;
          final_pathname = next(final_params);
        `
            : `
          final_pathname = next(params);
        `
        }
      }
      const search = internals.searchParams
        ? internals.searchParams
        : nextRequest.nextUrl.searchParams;
      final_pathname = \`\${final_pathname}?\${search}\`;
      response =
        final_pathname !== \`\${pathname}?\${nextRequest.nextUrl.searchParams}\`
          ? NextResponse.rewrite(new URL(final_pathname, nextRequest.nextUrl))
          : NextResponse.next();
    } else {
      if (!middleware_response) throw new Error("Expected middleware response");
      const middleware_result = middleware_response!;
      if ("redirect" in middleware_result) {
        ${
          router.hooks.redirect
            ? `
          response = (await redirectHook(req, res)) || NextResponse.redirect(
            new URL(middleware_result.redirect, nextRequest.nextUrl),
            middleware_result.status
          );
        `
            : `
          response = NextResponse.redirect(
            new URL(middleware_result.redirect, nextRequest.nextUrl),
            middleware_result.status
          );
        `
        }
      } else if ("rewrite" in middleware_result!) {
        ${
          router.hooks.rewrite
            ? `
          response = (await rewriteHook(req, res)) || NextResponse.rewrite(
            new URL(middleware_result.rewrite, nextRequest.nextUrl)
          );
        `
            : `
          response = NextResponse.rewrite(
            new URL(middleware_result.rewrite, nextRequest.nextUrl)
          );
        `
        }
      } else if ("json" in middleware_result!) {
        ${
          router.hooks.json
            ? `
          response = (await jsonHook(req, res)) 
            || NextResponse.json(middleware_result.json)
        `
            : `
          response = NextResponse.json(middleware_result.json)
        `
        }
      } else throw new Error("invalid middleware response");
    }
  }

  internals.responseHeaders !== undefined &&
    internals.responseHeaders.forEach((value, key) =>
      response!.headers.append(key, value)
    );

  ${
    router.hooks.response
      ? `
  ev.waitUntil(Promise.resolve(responseHook(response)));
  `
      : ""
  }

  return response;
};

export const config = {
  matcher: "${renderMatcherPattern(router.segmentAmount)}"
}
`.trim();

const renderMiddleware = ({
  then,
  internalPath,
  location,
}: EjectedMiddleware) =>
  `
middleware_response = await (await middleware_${getSegmentHash(
    location
  )}.then(({
  default: middleware
}) => middleware))(
  req as NextMiddlewareRequest<Params<"${internalPath}">>,
  res
);
${renderSwitchStatement({
  statement: "middleware_response",
  cases: [
    [
      ["void 0"],
      `{
    ${renderBranch(then)}
    break;
  }`,
    ],
  ],
  default: `{
    ${renderHandleResponse()}
    break;
  }`,
})}
`.trim();

const renderRewrite = ({
  then,
  rewrite,
  name,
  location,
  internalPath,
}: EjectedRewrite) =>
  `
const rewrite_response = await (await rewrite_${getSegmentHash(
    location
  )}.then(({
  ${name}: rewrite
}) => rewrite))(
  req as NextMiddlewareRequest<Params<"${internalPath}">>,
  res
);
${renderSwitchStatement({
  statement: "rewrite_response",
  cases: [
    [
      ["void 0"],
      `{
    ${renderBranch(then || { type: BranchTypes.NOT_FOUND })}
    break;
  }`,
    ],
  ],
  default: `{
    params.${name} = rewrite_response!;
    ${renderBranch(rewrite || { type: BranchTypes.NOT_FOUND })}
    break;
  }`,
})}
`.trim();

const renderDynamic = ({ name, index, then }: DynamicSegment) =>
  `
params.${name} = segments[${index}];
${renderBranch(then)}
`.trim();

const renderBranch = (branch: Branch): string => {
  switch (branch.type) {
    case BranchTypes.MIDDLEWARE: {
      return renderMiddleware(branch);
    }
    case BranchTypes.REWRITE: {
      return renderRewrite(branch);
    }
    case BranchTypes.SWITCH: {
      return renderPathSwitch(branch);
    }
    case BranchTypes.NEXT: {
      return renderRetrurnNext(branch);
    }
    case BranchTypes.NOT_FOUND: {
      return renderNotFound();
    }
    case BranchTypes.DYNAMIC: {
      return renderDynamic(branch);
    }
    default: {
      const exhaustive: never = branch;
      return exhaustive;
    }
  }
};

const renderPathSwitch = ({ index, defaultCase, cases }: PathSegmentSwitch) => {
  return renderSwitchStatement({
    statement: `segments[${index}]`,
    cases: cases.map(({ match, then }) => {
      if (!(match instanceof Array)) {
        match = [match];
      }
      return [
        match.map((single) => `"${single}"`),
        `{
        ${renderBranch(then)}
        break;
      }
      `,
      ];
    }),
    default: `{
      ${renderBranch(defaultCase)}
      break;
    }`,
  });
};

const renderMatcherPattern = (segments: number) =>
  segments > 0
    ? `
/((?!_next(?:$|\/)|api(?:$|\/))[^\/]+\/?|$)${`([^\/]+\/?|$)`.repeat(
        segments - 1
      )}
`.trim()
    : "/";

type RenderSwitchStatementOptions = {
  statement: string;
  cases: [string[], string][];
  default: string;
};

const renderSwitchCase = (tests: string[], body: string) =>
  `
${tests.map((test) => `case ${test}:`).join("\n")} 
  ${body}
`.trim();

const renderSwitchStatement = (
  { cases, default: defaultMatch, statement }: RenderSwitchStatementOptions,
  tabs = 0
) =>
  `
switch (${statement}) {
  ${cases.map((_case) => renderSwitchCase(..._case)).join("\n")}
  default: 
    ${defaultMatch}
  
}
`
    .trim()
    .split("\n")
    .map((val, idx) => (idx ? "  ".repeat(tabs) + val : val))
    .join("\n");

export {};

function benchmark(method: () => unknown, methodName: string) {
  const times: bigint[] = [];

  for (let i = 0; i < 1000000; i++) {
    const startTime = process.hrtime.bigint();
    method();
    const endTime = process.hrtime.bigint();
    times.push(endTime - startTime);
  }

  const totalTime = times.reduce((acc, val) => acc + val, 0n);
  const sorted = times.sort((a, b) => Number(a - b));
  const minTime = sorted[0];
  const maxTime = sorted[sorted.length - 1];
  console.log(
    `${methodName}: ${(Number(totalTime) / 10000).toFixed(
      5
    )} milliseconds (min: ${(Number(minTime) / 1000000).toFixed(5)}ms, max: ${(
      Number(maxTime) / 1000000
    ).toFixed(5)}ms)`
  );
}