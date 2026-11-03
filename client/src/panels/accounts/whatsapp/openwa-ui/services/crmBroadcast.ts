import { api } from '../../../../../api/auth';

// CRM station/donor data for the Broadcast page (not the OpenWA gateway).
// The endpoints answer with snake_case rows; the page works with camelCase.
export interface BroadcastStation {
  ngoId: string;
  ngoName: string;
  station: string;
  donors: number;
}

export interface BroadcastRecipient {
  donorId: string;
  name: string;
  mobile: string;
  city?: string | null;
  station: string;
  ngoId: string;
  ngoName?: string | null;
}

interface StationRow {
  ngo_id: string;
  ngo_name: string;
  station: string;
  donors: number;
}

interface RecipientRow {
  donor_id: string | number;
  name: string;
  mobile: string;
  city?: string | null;
  station: string;
  ngo_id: string;
  ngo_name?: string | null;
}

export const openwaBroadcastApi = {
  stations: async (): Promise<{ stations: BroadcastStation[] }> => {
    const data = (await api('/openwa-broadcast/stations')) as { stations?: StationRow[] };
    return {
      stations: (data?.stations || []).map((row) => ({
        ngoId: row.ngo_id,
        ngoName: row.ngo_name,
        station: row.station,
        donors: row.donors,
      })),
    };
  },

  recipients: async (
    stations: Array<{ ngoId: string; station: string }>,
  ): Promise<{ recipients: BroadcastRecipient[] }> => {
    const data = (await api('/openwa-broadcast/recipients', {
      method: 'POST',
      body: JSON.stringify({ stations }),
    })) as { recipients?: RecipientRow[] };
    return {
      recipients: (data?.recipients || []).map((row) => ({
        donorId: String(row.donor_id),
        name: row.name,
        mobile: row.mobile,
        city: row.city ?? null,
        station: row.station,
        ngoId: row.ngo_id,
        ngoName: row.ngo_name ?? null,
      })),
    };
  },
};
