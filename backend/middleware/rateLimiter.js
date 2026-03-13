const rateLimit = require('express-rate-limit');

// Factory helpers for per-endpoint rate limits.

function createPerMinuteLimiter(maxPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
}

module.exports = {
  createPerMinuteLimiter,
};

