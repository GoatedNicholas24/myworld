// Converts between real map coordinates (latitude/longitude) and game metres.
// Game axes: +x = east, -z = north. The start point is (0, 0).
const METRES_PER_DEGREE_LAT = 110574;
const METRES_PER_DEGREE_LON_AT_EQUATOR = 111320;

export function createGeo(origin) {
  const metresPerDegreeLon =
    METRES_PER_DEGREE_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180);

  return {
    toLocal(lat, lon) {
      return {
        x: (lon - origin.lon) * metresPerDegreeLon,
        z: -(lat - origin.lat) * METRES_PER_DEGREE_LAT,
      };
    },
    toGeo(x, z) {
      return {
        lat: origin.lat - z / METRES_PER_DEGREE_LAT,
        lon: origin.lon + x / metresPerDegreeLon,
      };
    },
  };
}