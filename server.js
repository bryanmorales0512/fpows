// FPOWS — entry point.
// Builds the Express app, registers scheduled jobs, and starts the HTTP server.
// Application code lives under ./src (config, services, middleware, routes).
import { createApp } from './src/app.js';
import { registerCronJobs } from './src/jobs/cron.js';
import { PORT } from './src/config.js';

// Re-export so utility scripts can trigger the report without booting the server
// via a heavier path (see scripts/trigger_manual.js).
export { sendManagerDailyReport } from './src/services/report.js';

const app = createApp();
registerCronJobs();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] FPOWS Automation live on port ${PORT}`);
});
