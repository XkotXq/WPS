import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets another device on the LAN (e.g. the scanner's own browser, or
  // anyone testing from their PC) load this dev server's JS/HMR - without
  // this Next.js only trusts requests whose Host is localhost, so a page
  // opened via the network IP loads its HTML fine but the client bundle
  // never runs, which is why login (a client-side redirect after the
  // server accepts it) looked like it just did nothing.
  allowedDevOrigins: ["10.96.12.204"],
};

export default withNextIntl(nextConfig);
