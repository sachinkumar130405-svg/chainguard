require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const evidenceRoutes = require('./routes/evidence');
const attestationRoutes = require('./routes/attestation');
const authRoutes = require('./routes/auth');


const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: false,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.enableRequestLogging) {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', env: config.env });
});

app.use('/api/auth', authRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/attestation', attestationRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
  });
});

if (require.main === module) {
  const port = config.port;
  app.listen(port, () => {
    console.log(`ChainGuard backend listening on http://localhost:${port}`);
  });
}

module.exports = app;

