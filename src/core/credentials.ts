/** Credentials for authentication. */
export interface Credentials {
  /** Username (email address) of the cloud account */
  username: string;
  /** Password of the cloud account */
  password: string;
}

export function createCredentials(username = "", password = ""): Credentials {
  return { username, password };
}

function base64Decode(value: string): string {
  return Buffer.from(value, "base64").toString("utf-8");
}

/** Return decoded default credentials. */
export function getDefaultCredentials(
  credentials: readonly [string, string],
): Credentials {
  return createCredentials(base64Decode(credentials[0]), base64Decode(credentials[1]));
}

export const DEFAULT_CREDENTIALS: Record<string, readonly [string, string]> = {
  KASA: ["a2FzYUB0cC1saW5rLm5ldA==", "a2FzYVNldHVw"],
  KASACAMERA: ["YWRtaW4=", "MjEyMzJmMjk3YTU3YTVhNzQzODk0YTBlNGE4MDFmYzM="],
  TAPO: ["dGVzdEB0cC1saW5rLm5ldA==", "dGVzdA=="],
  TAPOCAMERA: ["YWRtaW4=", "YWRtaW4="],
  TAPOCAMERA_LV3: ["YWRtaW4=", "VFBMMDc1NTI2NDYwNjAz"],
};

/** Look up a well-known default credential pair by key, throwing if unknown. */
export function getNamedDefaultCredentials(
  name: keyof typeof DEFAULT_CREDENTIALS,
): Credentials {
  const value = DEFAULT_CREDENTIALS[name];
  if (!value) throw new Error(`Unknown default credentials key ${name}`);
  return getDefaultCredentials(value);
}
