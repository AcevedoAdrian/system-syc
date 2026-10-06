import { catalogsContract } from "./catalogs.js";
import { commentsContract } from "./comments.js";
import { healthContract } from "./health.js";
import { organizationsContract } from "./organizations.js";
import { ticketsContract } from "./tickets.js";
import { usersContract } from "./users.js";

export * from "./audit.js";
export * from "./auth.js";
export * from "./catalogs.js";
export * from "./comments.js";
export * from "./fields.js";
export * from "./health.js";
export * from "./organizations.js";
export * from "./tickets.js";
export * from "./users.js";

export const contract = {
  health: healthContract,
  users: usersContract,
  organizations: organizationsContract,
  catalogs: catalogsContract,
  tickets: ticketsContract,
  comments: commentsContract,
};
