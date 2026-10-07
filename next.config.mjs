import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deployed in a container (see ../deploy/Dockerfile.next): this is what
  // produces server.js plus a node_modules tree trimmed to what the build
  // actually imports. Without it the image has to carry the full dependency
  // tree - about 1.5 GB instead of 200 MB. No effect on `next dev`.
  output: "standalone",
  // Lets another device on the LAN (e.g. the scanner's own browser, or
  // anyone testing from their PC) load this dev server's JS/HMR - without
  // this Next.js only trusts requests whose Host is localhost, so a page
  // opened via the network IP loads its HTML fine but the client bundle
  // never runs, which is why login (a client-side redirect after the
  // server accepts it) looked like it just did nothing.
  allowedDevOrigins: ["10.96.12.204"],
};

export default withNextIntl(nextConfig);
