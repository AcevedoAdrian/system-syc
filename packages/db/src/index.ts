import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getPrismaClient(databaseUrl: string): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return client;
}

export { Prisma, PrismaClient };
