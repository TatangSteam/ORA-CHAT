import { describe, expect, it } from 'vitest';

import {
  answerNearestLocationQuestion,
  findNearestRahoLocation,
  haversineDistanceKm,
  parseNearestLocationIntent,
  type Geocoder
} from './location-distance.js';

describe('nearest RAHO location intent', () => {
  it.each([
    ['Aku tinggal di Badung, Bali. Aku mau terapi RAHO paling dekat dimana?', 'badung, bali'],
    ['Kalau aku tinggal di Jakarta Barat, Grogol. Mana yang terdekat?', 'jakarta barat, grogol'],
    ['Cabang RAHO terdekat dari Bekasi?', 'bekasi']
  ])('extracts the customer area from: %s', (question, expected) => {
    expect(parseNearestLocationIntent(question)).toEqual({ originQuery: expected });
  });

  it('does not intercept an ordinary address question', () => {
    expect(parseNearestLocationIntent('Di mana alamat RAHO Bandung?')).toBeNull();
  });

  it('asks for location when the nearest intent has no origin', () => {
    expect(parseNearestLocationIntent('Cabang mana yang paling dekat?')).toEqual({
      originQuery: null
    });
  });
});

describe('distance calculation', () => {
  it('calculates a stable haversine distance', () => {
    expect(
      haversineDistanceKm(
        { latitude: -6.161329, longitude: 106.7948841 },
        { latitude: -6.1655438, longitude: 106.8153732 }
      )
    ).toBeCloseTo(2.313, 3);
  });

  it('selects the closest configured service location', () => {
    const nearest = findNearestRahoLocation({ latitude: -6.161329, longitude: 106.7948841 });
    expect(nearest?.location.name).toBe('Kantor Pusat RAHO Premier');
    expect(nearest?.distanceKm).toBeLessThan(3);
  });
});

describe('nearest location answer', () => {
  it('returns an attributed estimate without an AI provider', async () => {
    const geocoder: Geocoder = {
      geocode: async () => ({
        latitude: -6.161329,
        longitude: 106.7948841,
        displayName: 'Grogol, Jakarta Barat, Indonesia'
      })
    };
    const result = await answerNearestLocationQuestion(
      'Saya tinggal di Grogol, Jakarta Barat. Cabang paling dekat mana?',
      geocoder
    );

    expect(result?.status).toBe('answered');
    expect(result?.answer).toContain('Kantor Pusat RAHO Premier');
    expect(result?.answer).toContain('2.3 km secara garis lurus');
    expect(result?.answer).toContain('© OpenStreetMap contributors');
    expect(result?.metadata).toMatchObject({
      responseMode: 'deterministic_nearest_location',
      distanceType: 'straight_line'
    });
  });

  it('fails closed when the origin cannot be geocoded', async () => {
    const geocoder: Geocoder = { geocode: async () => null };
    const result = await answerNearestLocationQuestion(
      'Cabang RAHO terdekat dari tempat tidak dikenal?',
      geocoder
    );

    expect(result).toMatchObject({
      status: 'fallback',
      fallbackReason: 'location_not_found'
    });
  });

  it('uses a location stated in the previous customer message', async () => {
    let receivedQuery = '';
    const geocoder: Geocoder = {
      geocode: async (query) => {
        receivedQuery = query;
        return {
          latitude: -6.161329,
          longitude: 106.7948841,
          displayName: 'Grogol, Jakarta Barat, Indonesia'
        };
      }
    };
    const result = await answerNearestLocationQuestion(
      'Kalau begitu, mana yang paling dekat?',
      geocoder,
      ['Saya tinggal di Grogol, Jakarta Barat.']
    );

    expect(receivedQuery).toBe('grogol, jakarta barat');
    expect(result?.answer).toContain('Kantor Pusat RAHO Premier');
  });
});
