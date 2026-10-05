import { catalogsContract } from "./catalogs.js";
import { healthContract } from "./health.js";
import { organizationsContract } from "./organizations.js";
import { usersContract } from "./users.js";

export * from "./audit.js";
export * from "./auth.js";
export * from "./catalogs.js";
export * from "./health.js";
export * from "./organizations.js";
export * from "./users.js";

export const contract = {
  health: healthContract,
  users: usersContract,
  organizations: organizationsContract,
  catalogs: catalogsContract,
};
