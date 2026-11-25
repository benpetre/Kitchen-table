import AsyncStorage from '@react-native-async-storage/async-storage';

/** Everything the app keeps on the phone lives under this prefix, as JSON. */
const PREFIX = 'kt.';

export async function load<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // A full or unavailable disk must not crash a game in progress.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/** Drop cached puzzles and in-progress boards for days before `keepFrom` (history is kept forever). */
export async function pruneBefore(keepFrom: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const old = keys.filter((k) => {
      const m = /^kt\.(?:daily|progress)\.(\d{4}-\d{2}-\d{2})/.exec(k);
      return m != null && m[1] < keepFrom;
    });
    if (old.length) await AsyncStorage.multiRemove(old);
  } catch {
    // ignore
  }
}
