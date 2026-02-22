import AsyncStorage from "@react-native-async-storage/async-storage";
import { RecentRoom } from "../types";

const STORAGE_KEY = "recent_rooms";
const MAX_ENTRIES = 20;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export async function loadRecentRooms(): Promise<RecentRoom[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function saveRecentRoom(entry: RecentRoom): Promise<void> {
  const rooms = await loadRecentRooms();
  const filtered = rooms.filter((r) => r.roomId !== entry.roomId);
  const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function updateRecentRoomName(
  roomId: string,
  roomName: string
): Promise<void> {
  const rooms = await loadRecentRooms();
  const updated = rooms.map((r) =>
    r.roomId === roomId ? { ...r, roomName } : r
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function removeRecentRoom(roomId: string): Promise<void> {
  const rooms = await loadRecentRooms();
  const updated = rooms.filter((r) => r.roomId !== roomId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function filterRecentRooms(rooms: RecentRoom[]): RecentRoom[] {
  const cutoff = Date.now() - TWELVE_HOURS_MS;
  return rooms.filter((r) => r.joinedAt >= cutoff);
}
