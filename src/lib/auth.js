import { api } from "$lib/api";
import { generateMnemonic } from "bip39";
import decode from "jwt-decode";
import { tick } from "svelte";
import { get } from "svelte/store";
import { password as pw, poll, prompt, user, token } from "$lib/store";
import PasswordPrompt from "$components/PasswordPrompt";
import { goto, err, validateEmail } from "$lib/utils";
import { createWallet, keypair } from "$lib/wallet";

export const expired = (t) => !t || decode(t).exp * 1000 < Date.now();

export const requireLogin = async (page) => {
  await tick();

  if (page && page.path === "/login") return;
  let $token = get(token);

  if (expired($token)) {
    try {
      await refreshToken();
      await tick();
    } catch (e) {}
  }

  $token = get(token);

  if (expired($token)) {
    goto("/login");
    throw new Error("Login required");
  }
};

export const requirePassword = async () => {
  await requireLogin();
  if (get(pw)) return;
  let unsub;
  await new Promise(
    (resolve) =>
      (unsub = pw.subscribe((password) =>
        password ? resolve() : prompt.set(PasswordPrompt)
      ))
  );
  unsub();
  await tick();
};

export const refreshToken = () =>
  api
    .url("/auth/token/refresh")
    .get()
    .json(({ jwt_token }) => {
      token.set(jwt_token);
      window.sessionStorage.setItem("token", jwt_token);
    });

export const logout = () => {
  get(poll).map((p) => clearInterval(p.interval));

  api
    .url("/auth/logout")
    .post()
    .res(() => {
      window.sessionStorage.removeItem("password");
      window.sessionStorage.removeItem("token");
      window.sessionStorage.removeItem("user");
      token.set(null);
      user.set(null);
      tick().then(() => goto("/login"));
    });
};

let justRegistered;
export const register = async (email, username, password) => {
  if (!validateEmail(email)) throw new Error("Invalid email");
  if (password.length < 8) throw new Error("Password must be 8 characters");

  return api
    .url("/register")
    .post({
      email,
      password,
      username,
      ...createWallet(generateMnemonic(), password),
    })
    .res();
};

export const login = (email, password) => {
  api
    .url("/login")
    .post({
      email,
      password,
    })
    .unauthorized(err)
    .badRequest(err)
    .json(({ jwt_token: t }) => {
      token.set(t);
      window.sessionStorage.setItem("token", t);
      pw.set(password);
      prompt.set(false);
      justRegistered ? goto("/wallet/create") : goto("/landing");
    })
    .catch(() => err("Login failed"));
};

export const activate = (ticket) => {
  console.log(ticket);
  return api.url("/activate").query({ ticket }).get().res();
};
