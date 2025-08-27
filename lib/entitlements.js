// lib/entitlements.js  (TEST mode)
export const ENTITLEMENTS = {
  // $19.99 / year — One-Hit Wonder
  "price_1RxfHhKhwtUF5XZpyewzUaoQ": {
    songsPerYear: 1,
    revisionsPerSong: 0,
    commercial: false,
    name: "One-Hit Wonder",
  },
  // $29.99 / year — Greatest Hits
  "price_1RxfInKhwtUF5XZpADVWFbIP": {
    songsPerYear: 5,
    revisionsPerSong: 2,
    commercial: false,
    name: "Greatest Hits",
  },
  // $99.99 / year — Platinum Playlist
  "price_1RxfJYKhwtUF5XZpQgxUX7fV": {
    songsPerYear: -1, // -1 = unlimited
    revisionsPerSong: -1,
    commercial: true,
    name: "Platinum Playlist",
  },
};

export function getEntitlementFromPriceId(priceId) {
  return ENTITLEMENTS[priceId] || null;
}
