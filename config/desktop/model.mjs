export const DATASET_ID = 'B1';
export const COORDINATES_URL = '../3-Mapping/peking25-5sec_coordinates1.json';
export function createClips(rows, baseURL) {
  if (!Array.isArray(rows) || rows.length !== 150) throw new Error('B1 must contain 150 audio points.');
  const ids = new Set();
  const expectedDirectory = new URL('../audio_processing/peking25-5sec/', baseURL).href;
  return rows.map(row => {
    if (!Array.isArray(row.point3d) || row.point3d.length !== 3 || !row.point3d.every(Number.isFinite)) throw new Error('Invalid point3d coordinates.');
    if (!Number.isInteger(row.cluster)) throw new Error('Invalid cluster identifier.');
    const url = new URL(row.path, baseURL);
    const match = url.pathname.match(/\/(\d+)_(\d+)\.wav$/);
    if (!url.href.startsWith(expectedDirectory) || !match) throw new Error('Unexpected B1 audio path.');
    const number = Number(match[1]), start = Number(match[2]) / 1000, id = `${DATASET_ID}-${number}`;
    if (ids.has(id) || number < 1 || number > 150 || start !== (number - 1) * 5) throw new Error('Invalid or duplicate B1 segment.');
    ids.add(id);
    return Object.freeze({ id, number, start, duration: 5, cluster: row.cluster, position: Object.freeze([...row.point3d]), url: url.href, originalPath: row.path });
  }).sort((a, b) => a.number - b.number);
}
export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export function groupName(cluster) { return cluster < 0 ? 'Ungrouped' : `Group ${cluster + 1}`; }

