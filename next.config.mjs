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
  //
  // **Every private address, not this machine's own IP.** It was one
  // hardcoded address, which stops being this machine the next time DHCP
  // hands out another one and was never right on anybody else's computer.
  // Next matches these per dot-separated segment, so "10.*.*.*" is exactly
  // the 10/8 block (see next/dist/server/app-render/csrf-protection.js);
  // this is a dev-server CSRF allowlist on a LAN, and none of these
  // addresses is routable from outside it. DEV_ORIGINS adds a hostname
  // (comma-separated) for a setup that reaches the dev server by name.
  allowedDevOrigins: [
    "10.*.*.*",
    "192.168.*.*",
    // 172.16/12 - the private part of 172, which is also where Docker and
    // WSL put their own bridges on this machine.
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
    ...(process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ],
};

export default withNextIntl(nextConfig);
