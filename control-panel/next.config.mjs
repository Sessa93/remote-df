/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for a small runtime image.
  output: "standalone",
  // dockerode is a server-only native-ish dep; keep it external to the bundle.
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "adm-zip"],
  },
};

export default nextConfig;
