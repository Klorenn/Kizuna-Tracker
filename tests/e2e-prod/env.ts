function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set: run through scripts/e2e-prod.sh (it reads the Keychain).`);
  return v;
}

export const creds = {
  get username() {
    return need("E2E_USERNAME");
  },
  get email() {
    return need("E2E_EMAIL");
  },
  get password() {
    return need("E2E_PASSWORD");
  },
};

export const LOGGED_OUT = { cookies: [], origins: [] };
