import { healthContract } from "./health.js";
import { usersContract } from "./users.js";

export * from "./health.js";
export * from "./users.js";

export const contract = {
  health: healthContract,
  users: usersContract,
};
