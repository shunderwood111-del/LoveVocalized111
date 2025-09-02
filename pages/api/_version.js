export default function handler(req, res) {
  res.status(200).json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    url: process.env.VERCEL_URL || null,
    env: process.env.VERCEL_ENV || (process.env.NODE_ENV || "unknown"),
    buildId: process.env.VERCEL_BUILD_ID || null,
  });
}
