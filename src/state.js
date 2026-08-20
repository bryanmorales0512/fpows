// Shared in-memory state. Exposed as a single mutable object so route modules
// can read and update the same cache without ES-module live-binding pitfalls.

// Active-customers cache, populated by the customer search route and read by
// the latest-job / debug-cache routes. Valid for 60s (see customers route).
export const cache = {
    customers: null,      // array of customer records, or null before first build
    customersTime: 0      // Date.now() when the cache was last built
};
