import clearLoginAttempts from "./global-setup";

/** Leaves the local limiter table empty after every run, so the owner can sign up by hand right after e2e. Same local-only guards as the setup. */
export default function globalTeardown() {
  clearLoginAttempts();
}
