// Scheduled jobs. The daily portfolio report runs at 6:00 AM Asia/Manila
// (mirrored by a Cloud Scheduler HTTP trigger in production).
import cron from 'node-cron';
import { sendManagerDailyReport } from '../services/report.js';

export function registerCronJobs() {
    cron.schedule('0 6 * * *', () => {
        sendManagerDailyReport();
    }, {
        scheduled: true,
        timezone: "Asia/Manila"
    });
}
