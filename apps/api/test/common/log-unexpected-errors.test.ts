import { Controller, Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { oc } from "@orpc/contract";
import { Implement, implement, ORPCModule } from "@orpc/nest";
import { ORPCError } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logUnexpectedErrors } from "@/common/log-unexpected-errors";

const contract = {
  boom: oc.route({ method: "GET", path: "/boom" }),
  conflict: oc.route({ method: "GET", path: "/conflict" }),
};

@Controller()
class TestController {
  @Implement(contract.boom)
  boom() {
    return implement(contract.boom).handler(() => {
      throw new Error("columna inexistente en la consulta");
    });
  }

  @Implement(contract.conflict)
  conflict() {
    return implement(contract.conflict).handler(() => {
      throw new ORPCError("CONFLICT", { message: "Ya existe" });
    });
  }
}

// Una app de Nest de verdad en un puerto libre, con el mismo `ORPCModule.forRoot` que `AppModule`.
async function start(config: Parameters<typeof ORPCModule.forRoot>[0]) {
  @Module({ imports: [ORPCModule.forRoot(config)], controllers: [TestController] })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

describe("logUnexpectedErrors", () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin el interceptor, un error inesperado responde 500 y no queda en el log", async () => {
    const { app, url } = await start({});
    try {
      const res = await fetch(`${url}/boom`);

      expect(res.status).toBe(500);
      expect(error).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("con el interceptor, un error inesperado queda en el log con su stack y el cliente sigue sin verlo", async () => {
    const { app, url } = await start({ interceptors: [logUnexpectedErrors] });
    try {
      const res = await fetch(`${url}/boom`);
      const body = await res.text();

      expect(res.status).toBe(500);
      expect(body).not.toContain("columna inexistente");
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]?.[0])).toContain("columna inexistente en la consulta");
    } finally {
      await app.close();
    }
  });

  it("un error de negocio (ORPCError) responde su status y no se loguea", async () => {
    const { app, url } = await start({ interceptors: [logUnexpectedErrors] });
    try {
      const res = await fetch(`${url}/conflict`);

      expect(res.status).toBe(409);
      expect(error).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
