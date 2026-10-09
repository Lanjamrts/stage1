// Wrapper : les handlers async rejettent → error middleware (500) au lieu de planter.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
