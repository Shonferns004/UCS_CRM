// Station-code helpers shared by the backend.
//
// "Fresh" (new) stations are the FD-* family: FD-1..FD-23 plus the per-NGO
// renamed variants the bulk-rename flow produces (BFD-*, AFD-*, MFD-*).
// Everything else is an OLD station: the original DH-*/ND-*/M-* codes and the
// BOD-*/AOD-*/MOD-* codes those old stations are renamed to.
//
// The bulk-rename map (client/src/panels/ngo-admin/pages/StationManagement.jsx)
// deliberately keeps that invariant: FD-1 -> BFD-1/AFD-1/MFD-1 stays fresh,
// while DH-5 -> BOD-15/AOD-15/MOD-15 stays old.
//
// Mirrors client/src/lib/stations.js. KEEP THE TWO IN SYNC - the admin's
// Station Management page decides which tab a station lands on with the same
// rule, so a divergence here would hide/show the wrong stations.

export const FRESH_STATION_RE = /^(?:[BAM]?)FD-/i;

export const isFreshStation = (code) => FRESH_STATION_RE.test(String(code ?? '').trim());

export const isOldStation = (code) => !isFreshStation(code);
