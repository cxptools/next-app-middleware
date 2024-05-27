/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check
const { withMiddleware } = require("@cxptools/next-app-middleware");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withMiddleware(nextConfig);
