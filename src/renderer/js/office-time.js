/* Regional office clock and approximate solar position. All schedule decisions
   use this one clock, so the HUD, sky, and employee shifts agree. */
(function () {
  const REGIONS = [
    { id: 'auto', label: 'Device region', zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
    { id: 'Asia/Kolkata', label: 'India · Mumbai', zone: 'Asia/Kolkata', lat: 19.08, lon: 72.88 },
    { id: 'Europe/London', label: 'UK · London', zone: 'Europe/London', lat: 51.51, lon: -0.13 },
    { id: 'America/New_York', label: 'USA · New York', zone: 'America/New_York', lat: 40.71, lon: -74.01 },
    { id: 'America/Los_Angeles', label: 'USA · Los Angeles', zone: 'America/Los_Angeles', lat: 34.05, lon: -118.24 },
    { id: 'Europe/Berlin', label: 'Germany · Berlin', zone: 'Europe/Berlin', lat: 52.52, lon: 13.41 },
    { id: 'Asia/Dubai', label: 'UAE · Dubai', zone: 'Asia/Dubai', lat: 25.20, lon: 55.27 },
    { id: 'Asia/Singapore', label: 'Singapore', zone: 'Asia/Singapore', lat: 1.35, lon: 103.82 },
    { id: 'Asia/Tokyo', label: 'Japan · Tokyo', zone: 'Asia/Tokyo', lat: 35.68, lon: 139.69 },
    { id: 'Australia/Sydney', label: 'Australia · Sydney', zone: 'Australia/Sydney', lat: -33.87, lon: 151.21 },
    { id: 'America/Sao_Paulo', label: 'Brazil · São Paulo', zone: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 }
  ];
  const fmt = new Map();
  const formatter = zone => {
    if (!fmt.has(zone)) fmt.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    return fmt.get(zone);
  };
  function region(id = 'auto') {
    const chosen = REGIONS.find(r => r.id === id) || REGIONS[0];
    if (chosen.id !== 'auto') return chosen;
    const canonical = zone => new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
    const known = REGIONS.find(r => r.id !== 'auto' && canonical(r.zone) === canonical(chosen.zone));
    return { ...chosen, lat: known?.lat ?? 35, lon: known?.lon ?? -new Date().getTimezoneOffset() / 4 };
  }
  function info(date, id = 'auto') {
    const place = region(id);
    const parts = Object.fromEntries(formatter(place.zone).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    const year = +parts.year, month = +parts.month, day = +parts.day;
    const hour = +parts.hour, minute = +parts.minute, second = +parts.second;
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetMinutes = Math.round((localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    return { date, zone: place.zone, region: place.label, lat: place.lat, lon: place.lon,
      year, month, day, hour, minute, second, weekday: parts.weekday,
      dateKey: `${year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
      label: `${parts.weekday}, ${day} ${new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: place.zone }).format(date)}`,
      workday: !['Sat', 'Sun'].includes(parts.weekday), offsetMinutes };
  }
  function solar(clock) {
    const rad = Math.PI / 180;
    const start = Date.UTC(clock.year, 0, 1), today = Date.UTC(clock.year, clock.month - 1, clock.day);
    const n = Math.floor((today - start) / 86400000) + 1;
    const hours = clock.hour + clock.minute / 60 + clock.second / 3600;
    const gamma = 2 * Math.PI / 365 * (n - 1 + (hours - 12) / 24);
    const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const trueSolarMinutes = ((hours * 60 + equation + 4 * clock.lon - clock.offsetMinutes) % 1440 + 1440) % 1440;
    const hourAngle = (trueSolarMinutes / 4 - 180) * rad, lat = clock.lat * rad;
    const east = -Math.cos(declination) * Math.sin(hourAngle);
    const north = Math.cos(lat) * Math.sin(declination) - Math.sin(lat) * Math.cos(declination) * Math.cos(hourAngle);
    const up = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
    const sun = { x: east, y: up, z: -north };
    const moon = { x: -east, y: -up, z: north };
    const phase = (((clock.date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) / 29.53059 % 1 + 1) % 1;
    return { sun, moon, elevation: Math.asin(Math.max(-1, Math.min(1, up))) / rad, phase };
  }
  window.DesklyOfficeTime = { REGIONS, region, info, solar };
})();
