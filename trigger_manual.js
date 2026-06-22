import { sendManagerDailyReport } from './server.js';
import dotenv from 'dotenv';
dotenv.config();

console.log("--- STARTING MANUAL REPORT DISPATCH ---");
sendManagerDailyReport(true)
    .then(() => {
        console.log("--- DISPATCH COMPLETED SUCCESSFULLY ---");
        process.exit(0);
    })
    .catch(err => {
        console.error("--- DISPATCH FAILED ---");
        console.error(err);
        process.exit(1);
    });
