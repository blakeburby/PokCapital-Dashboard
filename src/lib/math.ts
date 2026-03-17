// POK Capital — Modified Black-Scholes Math Library
// All formulas match the v1.1 whitepaper exactly.

import type { ModifiedBSResult, VolRegime, MoneynessBucket } from "./types";

const KELLY_FRAC = 0.25;
const MAX_POS_PCT = 0.05;
const KALSHI_FEE = 0.01;
const EV_THRESHOLD = 0.03;
const LAMBDA_J = 0.0001;
const SIGMA_J = 0.008;
const T_DOF = 5;
// Trading minutes per year: 252 trading days × 390 min/day
const TRADING_MINS_PER_YEAR = 252 * 390;

/** Lanczos approximation for log-gamma */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized incomplete beta function I_x(a, b) using continued fraction */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Student-t CDF P(T <= t) for nu degrees of freedom.
 * Uses regularized incomplete beta: I_x(nu/2, 1/2) where x = nu/(nu + t²)
 */
export function studentTCDF(t: number, nu: number): number {
  const x = nu / (nu + t * t);
  const ibeta = regularizedIncompleteBeta(x, nu / 2, 0.5);
  return t >= 0 ? 1 - ibeta / 2 : ibeta / 2;
}

/**
 * Poisson PMF: P(N=n) = exp(-lambda) * lambda^n / n!
 */
export function poissonPMF(n: number, lambda: number): number {
  if (lambda <= 0) return n === 0 ? 1 : 0;
  let logProb = -lambda + n * Math.log(lambda);
  for (let i = 1; i <= n; i++) logProb -= Math.log(i);
  return Math.exp(logProb);
}

/**
 * Modified Black-Scholes (Merton Jump-Diffusion + Student-t tails)
 * P_YES = Σ(n=0..5) [ Poisson_PMF(n, λ_J * T_min) * studentTCDF(d2_n, ν) ]
 * d2_n = ln(S/K) / sqrt(σ²_ann * T_yr + n * σ_J²)
 * T_yr = T_min / TRADING_MINS_PER_YEAR
 */
export function modifiedBS(
  S: number,
  K: number,
  sigmaEwmaAnn: number,
  tMinutes: number,
  askYes: number,
  bidYes: number,
  lambdaJ: number = LAMBDA_J,
  sigmaJ: number = SIGMA_J,
  nu: number = T_DOF
): ModifiedBSResult {
  const T_yr = tMinutes / TRADING_MINS_PER_YEAR;
  const diffusionVar = sigmaEwmaAnn * sigmaEwmaAnn * T_yr;
  const lnSK = Math.log(S / K);
  const jumpIntensity = lambdaJ * tMinutes;

  let pModel = 0;
  let jumpWeightN1 = 0;

  for (let n = 0; n <= 5; n++) {
    const weight = poissonPMF(n, jumpIntensity);
    const totalVar = diffusionVar + n * sigmaJ * sigmaJ;
    const d2n = totalVar > 0 ? lnSK / Math.sqrt(totalVar) : (lnSK >= 0 ? 1e6 : -1e6);
    const prob = studentTCDF(d2n, nu);
    pModel += weight * prob;
    if (n === 1) jumpWeightN1 = weight;
  }

  const d2Base = diffusionVar > 0 ? lnSK / Math.sqrt(diffusionVar) : (lnSK >= 0 ? 1e6 : -1e6);

  const evYes = pModel - askYes - KALSHI_FEE;
  const evNo = bidYes - pModel - KALSHI_FEE;

  return { pModel, d2Base, jumpWeightN1, evYes, evNo };
}

/** Quarter-Kelly position sizing, capped at MAX_POS_PCT */
export function kellyFraction(ev: number): { kellyRaw: number; positionPct: number } {
  if (ev <= 0) return { kellyRaw: 0, positionPct: 0 };
  const kellyRaw = (ev / (1 - ev)) * KELLY_FRAC;
  const positionPct = Math.min(kellyRaw, MAX_POS_PCT);
  return { kellyRaw, positionPct };
}

/** EWMA variance update: σ²_t = λ * σ²_{t-1} + (1-λ) * r_t² */
export function ewmaUpdate(prevVar: number, ret: number, lambda = 0.97): number {
  return lambda * prevVar + (1 - lambda) * ret * ret;
}

/** Convert per-minute σ to annualized σ */
export function annualizeVol(sigma1min: number): number {
  return sigma1min * Math.sqrt(TRADING_MINS_PER_YEAR);
}

/** Classify annualized vol into regime */
export function classifyVolRegime(sigmaEwmaAnn: number): VolRegime {
  if (sigmaEwmaAnn < 0.6) return "LOW";
  if (sigmaEwmaAnn < 1.0) return "MEDIUM";
  return "HIGH";
}

/** Classify moneyness ln(S/K) into bucket */
export function classifyMoneyness(moneyness: number): MoneynessBucket {
  const abs = Math.abs(moneyness);
  if (abs < 0.005) return "ATM";
  if (abs < 0.02) return "OTM1";
  if (abs < 0.05) return "OTM2";
  return "DEEP";
}

export { KALSHI_FEE, EV_THRESHOLD, KELLY_FRAC, MAX_POS_PCT };
