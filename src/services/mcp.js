// FastMCP tool registration. Exposes get_fpow_data as an MCP tool wrapping the
// same aggregation logic used by the REST API. (Registered for parity; the
// process is served over HTTP via Express, not MCP.)
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { fetchFpowData } from './fpow.js';

export const mcp = new FastMCP({
    name: "simPRO FPOWS Automation",
    version: "1.0.0"
});

mcp.addTool({
    name: "get_fpow_data",
    description: "Fetch and aggregate FPOW data for a job ID, including site-wide outstanding works.",
    parameters: z.object({
        jobId: z.number().describe("The simPRO Job ID to retrieve data for")
    }),
    execute: async (args) => {
        return fetchFpowData(args.jobId);
    }
});
