import { BASE, WEB_ORIGIN } from "./env.mjs";
import { resetRateLimit } from "./infra.mjs";

// Cliente HTTP contra la API de la verificación, con cookie jar (una sesión por instancia).
export class Client {
  jar = new Map();

  async request(method, url, { json, headers } = {}) {
    const h = { Origin: WEB_ORIGIN, ...headers };
    if (json !== undefined) h["Content-Type"] = "application/json";
    if (this.jar.size > 0) h.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: h,
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie();
    for (const cookie of setCookie) {
      const pair = cookie.split(";")[0];
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1);
      if (value === "" || /max-age=0/i.test(cookie)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      // no era JSON
    }
    return { status: res.status, body, text, setCookie };
  }

  get = (url) => this.request("GET", url);
  post = (url, json = {}) => this.request("POST", url, { json });
  patch = (url, json) => this.request("PATCH", url, { json });
  delete = (url) => this.request("DELETE", url);

  async login(username, password) {
    resetRateLimit();
    return this.post("/api/auth/sign-in/username", { username, password });
  }
}
