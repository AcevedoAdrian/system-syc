export type LoginFailure = "invalid" | "rate-limited" | "disabled" | "unreachable";

export class LoginError extends Error {
  constructor(readonly failure: LoginFailure) {
    super(failure);
  }
}
