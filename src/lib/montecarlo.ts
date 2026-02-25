/**
 * Monte Carlo simulation engine using Geometric Brownian Motion.
 * Runs in-browser (no server required).
 */

export interface SimulationResult {
  paths: number[][];      // [pathIndex][stepIndex] = price
  meanPath: number[];     // [stepIndex] = average price across all paths
  probAbove: number;      // 0-1 probability that final price > strike
  probBelow: number;      // 0-1 probability that final price <= strike
  finalPrices: number[];  // terminal price of each path
  steps: number;
}

/**
 * Box-Muller transform: generates a standard normal random variable.
 */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Simulate GBM price paths.
 *
 * @param price          Current spot price (S0)
 * @param vol            Annualized volatility (e.g. 0.40 = 40%)
 * @param timeToExpiry   Time to contract expiry in seconds
 * @param strike         Strike price for binary outcome
 * @param nPaths         Number of simulation paths (default 1000)
 * @param nSteps         Number of time steps per path (default 60)
 * @param drift          Drift rate μ (default 0 for risk-neutral)
 */
export function simulatePaths(
  price: number,
  vol: number,
  timeToExpiry: number,
  strike: number,
  nPaths = 1000,
  nSteps = 60,
  drift = 0
): SimulationResult {
  const T = Math.max(timeToExpiry / (365 * 24 * 3600), 1 / (365 * 24 * 60)); // years
  const dt = T / nSteps;
  const sqrtDt = Math.sqrt(dt);

  const paths: number[][] = [];
  const finalPrices: number[] = [];

  for (let p = 0; p < nPaths; p++) {
    const path: number[] = [price];
    let S = price;
    for (let t = 0; t < nSteps; t++) {
      const z = randn();
      S = S * Math.exp((drift - 0.5 * vol * vol) * dt + vol * sqrtDt * z);
      path.push(S);
    }
    paths.push(path);
    finalPrices.push(S);
  }

  // Mean path
  const meanPath: number[] = Array(nSteps + 1).fill(0);
  for (let t = 0; t <= nSteps; t++) {
    let sum = 0;
    for (let p = 0; p < nPaths; p++) {
      sum += paths[p][t];
    }
    meanPath[t] = sum / nPaths;
  }

  const above = finalPrices.filter((s) => s > strike).length;
  const probAbove = above / nPaths;

  return {
    paths,
    meanPath,
    probAbove,
    probBelow: 1 - probAbove,
    finalPrices,
    steps: nSteps,
  };
}

/**
 * Derive volatility estimate from price history (annualized).
 * @param prices  Array of prices, most recent last
 */
export function estimateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0.4; // default 40%
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  if (returns.length === 0) return 0.4;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  // Annualize assuming 1-second intervals
  return stdDev * Math.sqrt(365 * 24 * 3600);
}

/**
 * Classify volatility regime from annualized vol.
 */
export function classifyRegime(vol: number): "R1" | "R2" | "R3" {
  if (vol < 0.3) return "R1";
  if (vol < 0.6) return "R2";
  return "R3";
}
