export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult extends Coordinates {
  displayName: string;
}

export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>;
}

export interface RahoServiceLocation extends Coordinates {
  name: string;
  address: string;
  phone: string | null;
}

export const RAHO_SERVICE_LOCATIONS: readonly RahoServiceLocation[] = [
  {
    name: 'Kantor Pusat RAHO Premier',
    address: 'Duta Merlin, Petojo Utara, Gambir, Jakarta Pusat',
    phone: null,
    latitude: -6.1655438,
    longitude: 106.8153732
  },
  {
    name: 'RAHO Club Premier Menara Batavia',
    address:
      'Menara Batavia lantai 2, Jl. K.H. Mas Mansyur No. Kav. 126, Karet Tengsin, Tanah Abang, Jakarta Pusat 10250',
    phone: null,
    latitude: -6.2074731,
    longitude: 106.8164889
  },
  {
    name: 'RAHO Club Premier D’Botanica',
    address:
      'Jl. Dr. Djunjunan/Jl. Tol Pasteur No. 143–149, Pajajaran, Cicendo, Bandung, Jawa Barat 40173',
    phone: '08213103738',
    latitude: -6.8995682,
    longitude: 107.5904563
  },
  {
    name: 'Partnership RAHO Club Premier Bali (Apotek Hannah)',
    address:
      'Jl. Gatot Subroto Barat No. 18 A–B, Kerobokan Kaja, Kuta Utara, Kabupaten Badung, Bali',
    phone: '085168927435',
    latitude: -8.6439295,
    longitude: 115.1729967
  },
  {
    name: 'Partnership RAHO Club Premier Batam',
    address:
      'Komplek Ruko Puri Legenda Blok D1 No. 1–2, Baloi Permai, Batam Kota, Batam, Kepulauan Riau 29431',
    phone: '+62 8518 4522 315',
    latitude: 1.1042698,
    longitude: 104.0531509
  },
  {
    name: 'Partnership Klinik Kecantikan Edmee Clinic',
    address: 'Jl. Pluit Karang Utara No. 105, RT.7/RW.3, Pluit, Penjaringan, Jakarta Utara 14450',
    phone: '081399992330',
    latitude: -6.1119912,
    longitude: 106.7795649
  },
  {
    name: 'Partnership RAHO Club Premier Grand Orchard Kelapa Gading',
    address:
      'Jl. Terusan Raya Kelapa Hybrida, Ruko Grand Orchard Square Blok GOS/B11, Sukapura, Cilincing, Jakarta Utara 14150',
    phone: '081110031103',
    latitude: -6.1476246,
    longitude: 106.9303862
  },
  {
    name: 'Partnership Klinik Utama O2',
    address:
      'Exclusive Bukit Golf Mediterania, Jl. Rukan No. 76 Blok G, Kamal Muara, Penjaringan, Jakarta Utara 14470',
    phone: '08121092236',
    latitude: -6.1098554,
    longitude: 106.7337392
  },
  {
    name: 'Partnership Glowing Anti Aging & Wellness',
    address: 'Jl. Buncit Raya No. 150, RT.5/RW.2, Duren Tiga, Pancoran, Jakarta Selatan 12760',
    phone: '081281716788',
    latitude: -6.258652,
    longitude: 106.8286463
  },
  {
    name: 'Klinik Kecantikan Ministry Treatment – Hair, Beauty & Wellness',
    address:
      'Jl. Samanhudi No. 17 lantai 2, RT.1/RW.7, Pasar Baru, Sawah Besar, Jakarta Pusat 10710',
    phone: '081111132900',
    latitude: -6.1614579,
    longitude: 106.8317033
  },
  {
    name: 'Attiya Reverse Aging Jakarta',
    address: 'Jl. Langsat IV No. 9, RT.3/RW.1, Kramat Pela, Kebayoran Baru, Jakarta Selatan 12130',
    phone: '0816898264',
    latitude: -6.2458268,
    longitude: 106.7924694
  },
  {
    name: 'Partnership RAHO Club Premier Jambi',
    address:
      'Marketing Gallery JBC, Ruko E1-08 Kawasan Jambi Business Center, Jl. Kapt. A. Bakaruddin, Danau Sipin, Jambi 36129',
    phone: '081178786880',
    latitude: -1.6187742,
    longitude: 103.5880187
  },
  {
    name: 'Partnership Klinik Griya Sehat HWA',
    address: 'Jl. Kedondong, Anduonohu, Poasia, Kendari, Sulawesi Tenggara 93231',
    phone: '082271150233',
    latitude: -4.0425827,
    longitude: 122.5558855
  },
  {
    name: 'Partnership Timeless Aesthetic Clinic Medan',
    address: 'Jl. Pemuda No. 13 lantai 2, A U R, Medan Maimun, Medan 20212',
    phone: '082128360202',
    latitude: 3.5832772,
    longitude: 98.6813469
  },
  {
    name: 'Partnership RAHO Club Premier Pekanbaru',
    address:
      'Perkantoran Sudirman Square Blok B No. 15–19, Tangkerang Tengah, Marpoyan Damai, Pekanbaru, Riau 28125',
    phone: '082371750937',
    latitude: 0.4947183,
    longitude: 101.446241
  },
  {
    name: 'Partnership Attiya Reverse Aging Semarang',
    address: 'Jl. Tumpang Raya No. 48, Gajahmungkur, Semarang, Jawa Tengah 50233',
    phone: '0816898264',
    latitude: -7.005327,
    longitude: 110.3975413
  }
] as const;

const normalizeLocationText = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/gu, ' ').trim();

const nearestIntentPattern = /\b(?:terdekat|paling\s+dekat|cabang\s+dekat|lokasi\s+dekat)\b/iu;

const cleanOriginQuery = (value: string): string | null => {
  const stopPattern =
    /[.!?]|\b(?:aku|saya|kami)\s+(?:mau|ingin)\b|\b(?:mana|cabang|lokasi|raho)\s+(?:yang\s+)?(?:paling\s+)?(?:dekat|terdekat)\b|\b(?:yang\s+)?(?:paling\s+dekat|terdekat)\b/iu;
  const stopIndex = value.search(stopPattern);
  const cleaned = (stopIndex >= 0 ? value.slice(0, stopIndex) : value)
    .replace(/^[\s,;:-]+|[\s,;:-]+$/gu, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
};

const extractOriginFromLocationStatement = (value: string): string | null => {
  const normalized = normalizeLocationText(value);
  const patterns = [
    /\b(?:tinggal|berada|posisi)\s+(?:di\s+)?(.+)$/iu,
    /\b(?:aku|saya|kami)\s+di\s+(.+)$/iu,
    /\bdari\s+(.+)$/iu
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const originQuery = cleanOriginQuery(match[1]);
    if (originQuery) return originQuery;
  }
  return null;
};

export interface NearestLocationIntent {
  originQuery: string | null;
}

export const parseNearestLocationIntent = (value: string): NearestLocationIntent | null => {
  const normalized = normalizeLocationText(value);
  if (!nearestIntentPattern.test(normalized)) return null;

  const statementOrigin = extractOriginFromLocationStatement(normalized);
  if (statementOrigin) return { originQuery: statementOrigin };
  const suffix = normalized.match(/\b(?:terdekat|paling\s+dekat)\s+(?:dari\s+)?(.+)$/iu);
  const suffixOrigin = suffix?.[1] ? cleanOriginQuery(suffix[1]) : null;
  if (suffixOrigin) return { originQuery: suffixOrigin };
  return { originQuery: null };
};

export const haversineDistanceKm = (left: Coordinates, right: Coordinates): number => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const findNearestRahoLocation = (
  origin: Coordinates,
  locations: readonly RahoServiceLocation[] = RAHO_SERVICE_LOCATIONS
): { location: RahoServiceLocation; distanceKm: number } | null => {
  let nearest: { location: RahoServiceLocation; distanceKm: number } | null = null;
  for (const location of locations) {
    const distanceKm = haversineDistanceKm(origin, location);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { location, distanceKm };
  }
  return nearest;
};

interface CacheEntry {
  expiresAt: number;
  value: GeocodeResult | null;
}

export class NominatimGeocoder implements Geocoder {
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  public async geocode(query: string): Promise<GeocodeResult | null> {
    const normalized = normalizeLocationText(query);
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let resolveTask!: (value: GeocodeResult | null) => void;
    const result = new Promise<GeocodeResult | null>((resolve) => {
      resolveTask = resolve;
    });
    this.queue = this.queue.then(async () => {
      const waitMs = Math.max(0, this.nextRequestAt - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextRequestAt = Date.now() + 1_100;
      const value = await this.request(normalized);
      this.remember(normalized, value);
      resolveTask(value);
    });
    return result;
  }

  private remember(query: string, value: GeocodeResult | null): void {
    if (this.cache.size >= 500) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(query, {
      expiresAt: Date.now() + (value ? 30 * 24 * 60 * 60 * 1_000 : 60 * 60 * 1_000),
      value
    });
  }

  private async request(query: string): Promise<GeocodeResult | null> {
    try {
      const endpoint = new URL('https://nominatim.openstreetmap.org/search');
      endpoint.searchParams.set('q', `${query}, Indonesia`);
      endpoint.searchParams.set('format', 'jsonv2');
      endpoint.searchParams.set('limit', '1');
      endpoint.searchParams.set('countrycodes', 'id');
      endpoint.searchParams.set('layer', 'address');
      const response = await fetch(endpoint, {
        headers: {
          'Accept-Language': 'id',
          'User-Agent': 'RAHO-Control-Room/0.0.0 (https://rahopremier.id)'
        },
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || payload.length === 0) return null;
      const first = payload[0] as Record<string, unknown>;
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        typeof first.display_name !== 'string'
      ) {
        return null;
      }
      return { latitude, longitude, displayName: first.display_name };
    } catch {
      return null;
    }
  }
}

export interface NearestLocationAnswer {
  status: 'answered' | 'fallback';
  answer: string;
  fallbackReason: string | null;
  metadata: Record<string, unknown>;
}

export const answerNearestLocationQuestion = async (
  question: string,
  geocoder: Geocoder,
  previousCustomerMessages: readonly string[] = []
): Promise<NearestLocationAnswer | null> => {
  const intent = parseNearestLocationIntent(question);
  if (!intent) return null;
  const originQuery =
    intent.originQuery ??
    previousCustomerMessages
      .slice(-5)
      .reverse()
      .map(extractOriginFromLocationStatement)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    null;
  if (!originQuery) {
    return {
      status: 'fallback',
      answer:
        'Boleh sebutkan kecamatan dan kota tempat Anda berada? Saya akan menghitung perkiraan lokasi RAHO yang paling dekat.',
      fallbackReason: 'location_clarification_required',
      metadata: { responseMode: 'deterministic_nearest_location' }
    };
  }

  const origin = await geocoder.geocode(originQuery);
  if (!origin) {
    return {
      status: 'fallback',
      answer: `Maaf, lokasi “${originQuery}” belum dapat dikenali. Mohon tuliskan kecamatan dan kotanya, misalnya “Grogol, Jakarta Barat”.`,
      fallbackReason: 'location_not_found',
      metadata: {
        responseMode: 'deterministic_nearest_location',
        originQuery
      }
    };
  }

  const nearest = findNearestRahoLocation(origin);
  if (!nearest) return null;
  const distance =
    nearest.distanceKm < 10
      ? nearest.distanceKm.toFixed(1)
      : Math.round(nearest.distanceKm).toLocaleString('id-ID');
  const phone = nearest.location.phone ? ` Nomor telepon/WhatsApp: ${nearest.location.phone}.` : '';
  return {
    status: 'answered',
    answer: `Perkiraan lokasi RAHO terdekat dari ${originQuery} adalah ${nearest.location.name}, sekitar ${distance} km secara garis lurus. Alamat: ${nearest.location.address}.${phone} Jarak perjalanan dan waktu tempuh dapat berbeda; silakan cek aplikasi peta sebelum berangkat. Perkiraan koordinat menggunakan data © OpenStreetMap contributors.`,
    fallbackReason: null,
    metadata: {
      responseMode: 'deterministic_nearest_location',
      originQuery,
      geocoderDisplayName: origin.displayName.slice(0, 300),
      nearestLocation: nearest.location.name,
      distanceKm: Number(nearest.distanceKm.toFixed(3)),
      distanceType: 'straight_line',
      geocodingAttribution: 'OpenStreetMap contributors'
    }
  };
};
