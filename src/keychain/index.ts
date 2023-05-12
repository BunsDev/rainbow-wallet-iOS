import DeviceInfo from 'react-native-device-info';
import {
  ACCESS_CONTROL,
  ACCESSIBLE,
  getAllInternetCredentials,
  getInternetCredentials,
  getSupportedBiometryType as originalGetSupportedBiometryType,
  hasInternetCredentials,
  Options,
  resetInternetCredentials,
  setInternetCredentials,
  UserCredentials,
  BIOMETRY_TYPE,
  requestSharedWebCredentials,
  setSharedWebCredentials as originalSetSharedWebCredentials,
  SharedWebCredentials,
} from 'react-native-keychain';
import { MMKV } from 'react-native-mmkv';

import AesEncryptor from '@/handlers/aesEncryption';
import { delay } from '@/utils/delay';
import { IS_DEV, IS_ANDROID } from '@/env';
import { logger, RainbowError } from '@/logger';
import {
  authenticateWithPINAndCreateIfNeeded,
  authenticateWithPIN,
} from '@/handlers/authentication';

export const encryptor = new AesEncryptor();

export type KeychainOptions = Options & {
  /**
   * If we already have the user's pin in memory, pass it here to prevent
   * another authentication prompt and lookup.
   */
  androidEncryptionPin?: string;
};

export enum ErrorType {
  Unknown = 0,
  UserCanceled = -1, // legacy
  NotAuthenticated = -2, // legacy
  Unavailable = -3,
}

type Result<T = any> =
  | {
      value: T;
      error: undefined;
    }
  | {
      value: undefined;
      error: ErrorType;
    };

const cache = new MMKV({
  id: 'rainbowKeychainLocalStorage',
});

export const publicAccessControlOptions: Options = {
  accessible: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Retrieve a value from the keychain.
 */
export async function get(
  key: string,
  options: KeychainOptions = {}
): Promise<Result<string>> {
  logger.debug(`keychain: get`, { key }, logger.DebugContext.keychain);

  async function _get(attempts = 0): Promise<Result<string>> {
    if (attempts > 0) {
      logger.debug(
        `keychain: get attempt ${attempts}`,
        { key },
        logger.DebugContext.keychain
      );
    }

    let data = cache.getString(key);

    if (!data) {
      try {
        const result = await getInternetCredentials(key, options);

        if (result) {
          if (
            IS_ANDROID &&
            !(await getSupportedBiometryType()) &&
            result.password.includes('cipher')
          ) {
            logger.debug(
              `keychain: decrypting private data on Android`,
              {
                key,
              },
              logger.DebugContext.keychain
            );

            const pin =
              options.androidEncryptionPin || (await authenticateWithPIN());
            const decryptedValue = await encryptor.decrypt(
              pin,
              result.password
            );

            if (decryptedValue) {
              data = decryptedValue;
            } else {
              logger.error(
                new RainbowError(
                  `keychain: failed to decrypt private data on Android`
                )
              );
            }
          } else {
            data = result.password;
          }
        }
      } catch (e: any) {
        switch (e.toString()) {
          case 'Error: User canceled the operation.': {
            return {
              value: undefined,
              error: ErrorType.UserCanceled,
            };
          }
          case 'Error: Wrapped error: User not authenticated': {
            return {
              value: undefined,
              error: ErrorType.NotAuthenticated,
            };
          }
          case 'Error: The user name or passphrase you entered is not correct.': {
            if (attempts > 2) {
              return {
                value: undefined,
                error: ErrorType.NotAuthenticated,
              };
            }

            // try again
            await delay(1000);
            return _get(attempts + 1);
          }
          default: {
            logger.error(
              new RainbowError(`keychain: _get() handled unknown error`),
              {
                message: e.toString(),
              }
            );

            return {
              value: undefined,
              error: ErrorType.Unknown,
            };
          }
        }
      }
    }

    return data
      ? {
          value: data,
          error: undefined,
        }
      : {
          value: undefined,
          error: ErrorType.Unavailable,
        };
  }

  return _get();
}

/**
 * Set a value on the keychain
 */
export async function set(
  key: string,
  value: string,
  options: KeychainOptions = {}
): Promise<void> {
  logger.debug(`keychain: set`, { key }, logger.DebugContext.keychain);

  // only save public data to mmkv
  // private data has accessControl
  if (!options.accessControl) {
    cache.set(key, value);
  } else if (
    options.accessControl &&
    IS_ANDROID &&
    !(await getSupportedBiometryType())
  ) {
    logger.debug(
      `keychain: encrypting private data on android`,
      { key, options },
      logger.DebugContext.keychain
    );

    const pin =
      options.androidEncryptionPin ||
      (await authenticateWithPINAndCreateIfNeeded());
    const encryptedValue = await encryptor.encrypt(pin, value);

    if (encryptedValue) {
      value = encryptedValue;
    } else {
      throw new Error(`keychain: failed to encrypt value`);
    }
  }

  await setInternetCredentials(key, key, String(value), options);
}

/**
 * A convenience method for getting a value from the keychain and parsing it as
 * JSON.
 */
export async function getObject<
  T extends Record<string, any> = Record<string, unknown>
>(key: string, options: KeychainOptions = {}): Promise<Result<T>> {
  logger.debug(`keychain: getObject`, { key }, logger.DebugContext.keychain);

  const { value, error } = await get(key, options);

  if (error || !value) {
    return { value: undefined, error: error || ErrorType.Unknown };
  }

  return {
    value: JSON.parse(value),
    error: undefined,
  };
}

/**
 * A convenience method for stringifying an object and storing it on the
 * keychain.
 */
export async function setObject(
  key: string,
  value: Record<string, any>,
  options: KeychainOptions = {}
): Promise<void> {
  logger.debug(`keychain: setObject`, { key }, logger.DebugContext.keychain);

  await set(key, JSON.stringify(value), options);
}

/**
 * Check if a value exists on the keychain.
 */
export async function has(key: string): Promise<boolean> {
  logger.debug(`keychain: has`, { key }, logger.DebugContext.keychain);
  return Boolean(await hasInternetCredentials(key));
}

/**
 * Remove a value from the keychain.
 */
export async function remove(key: string) {
  logger.debug(`keychain: remove`, { key }, logger.DebugContext.keychain);

  cache.delete(key);
  await resetInternetCredentials(key);
}

/**
 * Return all the keys stored on the keychain.
 *
 * This method originates in a patch that we applied manually to the underlying
 * keychain library. Check out our patches directory for more info.
 */
export async function getAllKeys(): Promise<UserCredentials[]> {
  logger.debug(`keychain: getAllKeys`, {}, logger.DebugContext.keychain);
  const res = await getAllInternetCredentials();
  return res ? res.results : [];
}

/**
 * Clear all key/value pairs stored on the keychain.
 *
 * This is only possible because of the patch we made to add
 * `getAllKeys`.
 */
export async function clear() {
  logger.debug(`keychain: clear`, {}, logger.DebugContext.keychain);

  cache.clearAll();

  const credentials = await getAllKeys();

  await Promise.all(
    credentials?.map(c => resetInternetCredentials(c.username))
  );
}

/**
 * Wrapper around the underlying library's method by the same name.
 */
export async function getSupportedBiometryType(): Promise<
  BIOMETRY_TYPE | undefined
> {
  logger.debug(
    `keychain: getSupportedBiometryType`,
    {},
    logger.DebugContext.keychain
  );
  return (await originalGetSupportedBiometryType()) || undefined;
}

/**
 * Wrapper around the underlying library's method by a similar name, with our
 * more robust `Result` return type.
 */
export async function getSharedWebCredentials(): Promise<
  Result<SharedWebCredentials | undefined>
> {
  logger.debug(
    `keychain: getSharedWebCredentials`,
    {},
    logger.DebugContext.keychain
  );

  let data = undefined;

  try {
    data = await requestSharedWebCredentials();
  } catch (e: any) {
    /**
     * Throws if not supported or credentials not found
     * @see https://github.com/oblador/react-native-keychain/blob/f3003e8208f6561a77d6fad0544d9a73a6731663/README.md?plain=1#L142
     */
  }

  return data
    ? {
        value: data,
        error: undefined,
      }
    : {
        value: undefined,
        error: ErrorType.Unavailable,
      };
}

/**
 * Wrapper around the underlying library's method by the same name, with our
 * more robust `Result` return type.
 */
export async function setSharedWebCredentials(
  username: string,
  password: string
) {
  logger.debug(
    `keychain: setSharedWebCredentials`,
    {},
    logger.DebugContext.keychain
  );
  await originalSetSharedWebCredentials('rainbow.me', username, password);
}

/**
 * Returns our standard private access control options, based on certain
 * environment variables.
 */
export async function getPrivateAccessControlOptions(): Promise<Options> {
  logger.debug(
    `keychain: getPrivateAccessControlOptions`,
    {},
    logger.DebugContext.keychain
  );

  const isSimulator = IS_DEV && (await DeviceInfo.isEmulator());

  if (isSimulator) return {};

  return {
    accessControl: ios
      ? ACCESS_CONTROL.USER_PRESENCE
      : ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
    accessible: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
}
