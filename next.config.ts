import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The invite email attaches the employee guide (R23); the server reads it from disk.
  outputFileTracingIncludes: {
    "/admin/employees/*": ["./Anleitung/Anleitung-Mitarbeitende.pdf"],
  },
};

export default nextConfig;
